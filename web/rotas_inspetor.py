# ==========================================
# TARIEL.IA — ROTAS_INSPETOR.PY
# Responsabilidade: área do inspetor (/app/)
# Chat IA, geração de PDF, histórico de laudos
# ==========================================

import os
import uuid
import json
import secrets
import asyncio
import tempfile
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from banco_dados import Laudo, Usuario, obter_banco
from seguranca import exigir_inspetor, obter_usuario_html
from nucleo.cliente_ia import ClienteIA
from nucleo.gerador_laudos import GeradorLaudos

logger = logging.getLogger(__name__)

roteador_inspetor = APIRouter()
templates         = Jinja2Templates(directory="templates")

ia        = ClienteIA()
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="gemini_stream")

_PREFIXO_METADATA = "__METADATA__:"

# Setores permitidos — allowlist para evitar injeção de prompt via campo setor
_SETORES_PERMITIDOS = frozenset({
    "geral", "eletrica", "mecanica", "caldeiraria", "spda",
    "loto", "nr10", "nr12", "nr13", "nr35", "avcb", "pie", "rti",
})

# Limites de entrada
_LIMITE_MSG_CHARS  = 8_000
_LIMITE_HISTORICO  = 20
_LIMITE_IMG_BASE64 = 7_000_000
_LIMITE_PDF_BYTES  = 1 * 1024 * 1024


# ── Helpers de contexto ────────────────────────────────────────────────────────

def _contexto_base(request: Request) -> dict:
    """
    Injeta csrf_token e csp_nonce em todos os templates.
    FIX: sem este helper, qualquer TemplateResponse sem essas variáveis
    lança UndefinedError em templates que usam {{ csrf_token }} ou nonce.
    """
    if "csrf_token" not in request.session:
        request.session["csrf_token"] = secrets.token_urlsafe(32)

    return {
        "request":    request,
        "csrf_token": request.session["csrf_token"],
        "csp_nonce":  getattr(request.state, "csp_nonce", ""),
    }


# ── Schemas ────────────────────────────────────────────────────────────────────

class MensagemHistorico(BaseModel):
    # FIX: Literal restringe papéis válidos — evita manipulação do histórico
    papel: Literal["usuario", "assistente"]
    texto: str = Field(..., max_length=_LIMITE_MSG_CHARS)


class DadosChat(BaseModel):
    mensagem:     str = Field(default="", max_length=_LIMITE_MSG_CHARS)
    dados_imagem: str = Field(default="", max_length=_LIMITE_IMG_BASE64)
    setor:        str = Field(default="geral", max_length=50)
    historico:    List[MensagemHistorico] = Field(default=[], max_length=_LIMITE_HISTORICO)

    # FIX: setor validado contra allowlist — bloqueia injeção de prompt
    @field_validator("setor")
    @classmethod
    def validar_setor(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in _SETORES_PERMITIDOS:
            raise ValueError(
                f"Setor inválido: '{v}'. Valores aceitos: {sorted(_SETORES_PERMITIDOS)}"
            )
        return v

    # FIX: imagem deve ser um data URI válido
    @field_validator("dados_imagem")
    @classmethod
    def validar_imagem(cls, v: str) -> str:
        if v and not v.startswith("data:image/"):
            raise ValueError("dados_imagem deve ser um data URI (data:image/...;base64,...)")
        return v


# ── Página principal ───────────────────────────────────────────────────────────

@roteador_inspetor.get("/", response_class=HTMLResponse)
async def pagina_inicial(
    request: Request,
    banco:   Session           = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    """
    FIX: trocado exigir_inspetor por obter_usuario_html.

    exigir_inspetor usa obter_usuario_api que levanta HTTPException 401 —
    isso faz obter_banco capturar a exceção, executar rollback desnecessário
    e logar como erro de banco, além de retornar JSON 401 em rota HTML.

    obter_usuario_html retorna None sem levantar exceção — a rota faz
    RedirectResponse para /admin/login de forma limpa.
    """
    if not usuario:
        return RedirectResponse(url="/admin/login", status_code=303)

    # Busca os 10 laudos mais recentes da empresa para o histórico na sidebar
    laudos_recentes = (
        banco.query(Laudo)
        .filter(Laudo.empresa_id == usuario.empresa_id)
        .order_by(Laudo.criado_em.desc())
        .limit(10)
        .all()
    )

    return templates.TemplateResponse("index.html", {
        **_contexto_base(request),
        "usuario":         usuario,
        "laudos_recentes": laudos_recentes,
    })


# ── Chat com IA (SSE Streaming) ────────────────────────────────────────────────

@roteador_inspetor.post("/api/chat")
async def rota_chat(
    dados:   DadosChat,
    usuario: Usuario = Depends(exigir_inspetor),
    banco:   Session = Depends(obter_banco),
):
    """
    Rota de API — mantém exigir_inspetor (retorna JSON 401 se não autenticado).
    Clientes de API (api.js) tratam 401 corretamente via fetch.
    """
    if not dados.mensagem and not dados.dados_imagem:
        raise HTTPException(
            status_code=400,
            detail="Entrada inválida. Exigido texto ou imagem.",
        )

    headers = {
        "Cache-Control":     "no-cache",
        "X-Accel-Buffering": "no",
        "Connection":        "keep-alive",
    }

    async def gerador_async():
        loop = asyncio.get_running_loop()
        fila: asyncio.Queue[str | None] = asyncio.Queue()

        resposta_completa: List[str] = []
        metadados_custo: dict        = {}
        historico_dict               = [msg.model_dump() for msg in dados.historico]

        def executar_stream():
            try:
                gen = ia.gerar_resposta_stream(
                    dados.mensagem,
                    dados.dados_imagem or None,
                    dados.setor,
                    empresa_id=usuario.empresa_id,
                    historico=historico_dict,
                )
                for pedaco in gen:
                    asyncio.run_coroutine_threadsafe(fila.put(pedaco), loop)
            except Exception as erro:
                logger.error("Erro na thread de stream: %s", erro, exc_info=True)
                asyncio.run_coroutine_threadsafe(
                    fila.put(
                        "\n\n**[Falha no Sistema]** Ocorreu um erro interno. Tente novamente."
                    ),
                    loop,
                )
            finally:
                asyncio.run_coroutine_threadsafe(fila.put(None), loop)

        # FIX: mantém referência ao Future — evita descarte silencioso de exceções
        _future = loop.run_in_executor(_executor, executar_stream)

        try:
            while True:
                try:
                    pedaco = await asyncio.wait_for(fila.get(), timeout=90.0)
                except asyncio.TimeoutError:
                    yield (
                        f"data: {json.dumps({'texto': chr(10)*2 + '**[Timeout]** A IA demorou mais que 90s.'})}\n\n"
                    )
                    break

                if pedaco is None:
                    break

                if pedaco.startswith(_PREFIXO_METADATA):
                    try:
                        metadados_custo = json.loads(pedaco[len(_PREFIXO_METADATA):])
                    except Exception:
                        pass
                    continue

                resposta_completa.append(pedaco)
                yield f"data: {json.dumps({'texto': pedaco})}\n\n"

            yield "data: [FIM]\n\n"

        finally:
            await _salvar_laudo(
                banco=banco,
                usuario=usuario,
                setor=dados.setor,
                texto_final="".join(resposta_completa),
                metadados=metadados_custo,
            )

    return StreamingResponse(
        gerador_async(),
        media_type="text/event-stream",
        headers=headers,
    )


async def _salvar_laudo(
    banco:       Session,
    usuario:     Usuario,
    setor:       str,
    texto_final: str,
    metadados:   Optional[dict],
) -> None:
    """
    Salva o laudo com custo real em BRL.
    Nunca lança exceção — um erro aqui nunca deve derrubar o stream.
    """
    if not texto_final or not usuario.empresa_id:
        return

    try:
        custo_reais = float(metadados.get("custo_reais", 0.0)) if metadados else 0.0

        # FIX: loga aviso quando a resposta é truncada silenciosamente
        texto_truncado = texto_final[:4000]
        if len(texto_final) > 4000:
            logger.warning(
                "Resposta da IA truncada de %d para 4000 chars | empresa_id=%s",
                len(texto_final), usuario.empresa_id,
            )

        laudo = Laudo(
            empresa_id=usuario.empresa_id,
            usuario_id=usuario.id,
            setor_industrial=setor,
            parecer_ia=texto_truncado,
            codigo_hash=uuid.uuid4().hex,
            status_conformidade="Pendente",
            custo_api_reais=custo_reais,
        )
        banco.add(laudo)

        if custo_reais > 0:
            empresa = usuario.empresa
            if empresa:
                empresa.custo_gerado_reais    = (empresa.custo_gerado_reais    or 0.0) + custo_reais
                empresa.mensagens_processadas = (empresa.mensagens_processadas or 0)   + 1

        banco.commit()

        logger.info(
            "Laudo salvo | empresa_id=%s usuario_id=%s custo=R$%.4f",
            usuario.empresa_id, usuario.id, custo_reais,
        )
    except Exception as e:
        logger.error("Falha ao salvar laudo no banco: %s", e, exc_info=True)
        banco.rollback()


# ── Geração de PDF ─────────────────────────────────────────────────────────────

@roteador_inspetor.post("/api/gerar_pdf")
async def rota_pdf(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
):
    # FIX: limite de tamanho do body — bloqueia payloads de DoS antes de parsear
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > _LIMITE_PDF_BYTES:
        raise HTTPException(status_code=413, detail="Payload muito grande. Limite: 1 MB.")

    dados_json  = await request.json()
    string_json = json.dumps(dados_json, ensure_ascii=False)

    nome_arquivo = f"Laudo_Tarielia_{uuid.uuid4().hex[:12]}.pdf"
    caminho_pdf  = os.path.join(tempfile.gettempdir(), nome_arquivo)

    try:
        GeradorLaudos.gerar_pdf_inspecao(string_json, caminho_pdf)
        return FileResponse(
            path=caminho_pdf,
            filename="Laudo_ART_Tarielia.pdf",
            media_type="application/pdf",
            background=BackgroundTask(os.remove, caminho_pdf),
        )
    except Exception as erro:
        logger.error(
            "Falha ao gerar PDF | usuario_id=%s erro=%s",
            usuario.id, erro, exc_info=True,
        )
        if os.path.exists(caminho_pdf):
            os.remove(caminho_pdf)
        # FIX: não expõe str(erro) — vaza paths, nomes de lib, stack traces
        return JSONResponse(
            status_code=500,
            content={"erro": "Falha ao gerar o PDF. Tente novamente."},
        )


# ── PWA ────────────────────────────────────────────────────────────────────────
# FIX: rotas PWA REMOVIDAS deste roteador.
# Motivo 1 — duplicatas: já estão definidas na raiz em main.py.
# Motivo 2 — escopo do SW: servido em /app/trabalhador_servico.js com escopo
#            restrito a /app/, não cobriria /admin/.
#            O SW é servido pela raiz (main.py) corretamente.
