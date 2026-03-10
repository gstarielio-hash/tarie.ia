# ==========================================
# TARIEL CONTROL TOWER — ROTAS_INSPETOR.PY
# Responsabilidade:
# - autenticação do portal do inspetor
# - páginas HTML do módulo /app
# - fluxo de laudos do inspetor
# - chat com IA + SSE
# - whispers para mesa avaliadora
# - upload seguro de documentos
# - geração de PDF
# ==========================================

from __future__ import annotations

import asyncio
import difflib
import io  # noqa: F401
import json
import logging
import os
import re
import secrets
import tempfile  # noqa: F401
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation  # noqa: F401
from pathlib import Path
from typing import Any, Optional

from fastapi import (
    APIRouter,
    File,  # noqa: F401
    HTTPException,
    Query,  # noqa: F401
    Request,
    UploadFile,  # noqa: F401
)
from fastapi.responses import (
    FileResponse,  # noqa: F401
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    StreamingResponse,  # noqa: F401
)
from fastapi.templating import Jinja2Templates
from sqlalchemy import func
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask  # noqa: F401

from app.core.settings import get_settings
from app.shared.database import (
    LIMITES_PADRAO,
    CitacaoLaudo,  # noqa: F401
    Empresa,  # noqa: F401
    Laudo,
    LaudoRevisao,
    LimitePlano,
    ModoResposta,
    MensagemLaudo,
    NivelAcesso,
    PlanoEmpresa,
    SessaoLocal,  # noqa: F401
    StatusRevisao,
    TemplateLaudo,
    TipoMensagem,
    Usuario,
)
from app.shared.security import (
    PORTAL_INSPETOR,
    limpar_sessao_portal,
    usuario_tem_bloqueio_ativo,
)
from nucleo.cliente_ia import ClienteIA
from nucleo.gerador_laudos import GeradorLaudos  # noqa: F401
from nucleo.inspetor.comandos_chat import (  # noqa: F401
    analisar_comando_finalizacao,
    analisar_comando_rapido_chat,
    mensagem_para_mesa,
    remover_mencao_mesa,
)
from nucleo.inspetor.confianca_ia import (
    CONFIANCA_MEDIA,
    _resumo_texto_curto,
    _titulo_confianca_humano,
    analisar_confianca_resposta_ia,  # noqa: F401
    normalizar_payload_confianca_ia,
)
from nucleo.inspetor.referencias_mensagem import (
    compor_texto_com_referencia,  # noqa: F401
    extrair_referencia_do_texto,
)
from nucleo.template_laudos import gerar_preview_pdf_template  # noqa: F401
from app.domains.chat.normalization import (
    TIPOS_TEMPLATE_VALIDOS,
    codigos_template_compativeis,
    nome_template_humano,
    normalizar_tipo_template,
)
from app.domains.chat.schemas import (
    DadosChat,  # noqa: F401
    DadosFeedback,  # noqa: F401
    DadosPDF,  # noqa: F401
    MensagemHistorico,
)

try:
    from configuracoes import configuracoes
except ImportError:
    configuracoes = None

logger = logging.getLogger("tariel.rotas_inspetor")
_settings = get_settings()

roteador_inspetor = APIRouter()
templates = Jinja2Templates(directory="templates")

cliente_ia: ClienteIA | None = None
_erro_cliente_ia_boot: str | None = None

try:
    cliente_ia = ClienteIA()
except Exception as erro:
    _erro_cliente_ia_boot = str(erro)
    logger.warning(
        "Cliente IA indisponível no boot. Recursos de IA ficarão desativados até configuração correta.",
        exc_info=not isinstance(erro, OSError),
    )

executor_stream = ThreadPoolExecutor(max_workers=4, thread_name_prefix="tariel_ia")

# ============================================================================
# CONSTANTES
# ============================================================================

LIMITE_MSG_CHARS = 8_000
LIMITE_HISTORICO = 20
LIMITE_HISTORICO_TOTAL_CHARS = 40_000

# 10 MB binário em base64 pode ultrapassar 13 MB de string
LIMITE_IMG_BASE64 = 14_500_000

LIMITE_DOC_BYTES = 15 * 1024 * 1024
LIMITE_DOC_CHARS = 40_000
LIMITE_PARECER = 4_000
LIMITE_FEEDBACK = 500
LIMITE_NOME_DOCUMENTO = 120

TIMEOUT_FILA_STREAM_SEGUNDOS = 90.0
TIMEOUT_KEEPALIVE_SSE_SEGUNDOS = 25.0

PREFIXO_METADATA = "__METADATA__:"
PREFIXO_CITACOES = "__CITACOES__:"
PREFIXO_MODO_HUMANO = "__MODO_HUMANO__:"

MODO_DETALHADO = ModoResposta.DETALHADO.value
MODO_CURTO = ModoResposta.CURTO.value
MODO_DEEP = ModoResposta.DEEP_RESEARCH.value

NIVEIS_PERMITIDOS_APP = frozenset({NivelAcesso.INSPETOR.value})
PORTAL_TROCA_SENHA_INSPETOR = "inspetor"
CHAVE_TROCA_SENHA_UID = "troca_senha_uid"
CHAVE_TROCA_SENHA_PORTAL = "troca_senha_portal"
CHAVE_TROCA_SENHA_LEMBRAR = "troca_senha_lembrar"
CHAVE_CSRF_INSPETOR = "csrf_token_inspetor"

REGRAS_GATE_QUALIDADE_TEMPLATE: dict[str, dict[str, Any]] = {
    "padrao": {
        "min_textos": 1,
        "min_evidencias": 2,
        "min_fotos": 1,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "avcb": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "spda": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "pie": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "rti": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "nr12maquinas": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "nr13": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": False,
    },
    "cbmgo": {
        "min_textos": 2,
        "min_evidencias": 3,
        "min_fotos": 2,
        "min_mensagens_ia": 1,
        "requer_dados_formulario": True,
    },
}

MIME_DOC_PERMITIDOS = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}

PADRAO_SUPORTE_WHATSAPP = os.getenv("SUPORTE_WHATSAPP", "5516999999999").strip()
VERSAO_APP = os.getenv("APP_BUILD_ID", "dev").strip() or "dev"

ASSINATURA_MESA_NOME_PADRAO = os.getenv("MESA_ENG_NOME_PADRAO", "Mesa Avaliadora WF").strip()
ASSINATURA_MESA_CARGO_PADRAO = os.getenv("MESA_ENG_CARGO_PADRAO", "Engenheiro Revisor").strip()
ASSINATURA_MESA_CREA_PADRAO = os.getenv("MESA_ENG_CREA_PADRAO", "").strip()
ASSINATURA_MESA_CARIMBO_PADRAO = os.getenv("MESA_ENG_CARIMBO_PADRAO", "CARIMBO DIGITAL WF").strip()

REGEX_DATA_URI_IMAGEM = re.compile(
    r"^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$",
    flags=re.IGNORECASE,
)

REGEX_ARQUIVO_DOCUMENTO = re.compile(r"\.(?:pdf|docx?)\b", flags=re.IGNORECASE)

MAPA_FILTRO_PENDENCIAS_LABEL = {
    "abertas": "Abertas",
    "resolvidas": "Resolvidas",
    "todas": "Todas",
}

try:
    import pypdf as leitor_pdf

    TEM_PYPDF = True
except ImportError:
    TEM_PYPDF = False
    leitor_pdf = None

try:
    import docx as leitor_docx

    TEM_DOCX = True
except ImportError:
    TEM_DOCX = False
    leitor_docx = None


# ============================================================================
# SSE MANAGER POR USUÁRIO
# ============================================================================


class GerenciadorSSEUsuario:
    def __init__(self) -> None:
        self._filas: dict[int, set[asyncio.Queue]] = defaultdict(set)

    async def conectar(self, usuario_id: int) -> asyncio.Queue:
        fila: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._filas[usuario_id].add(fila)
        return fila

    def desconectar(self, usuario_id: int, fila: asyncio.Queue) -> None:
        filas = self._filas.get(usuario_id)
        if not filas:
            return

        filas.discard(fila)
        if not filas:
            self._filas.pop(usuario_id, None)

    async def notificar(self, usuario_id: int, mensagem: dict[str, Any]) -> None:
        filas = list(self._filas.get(usuario_id, set()))
        if not filas:
            return

        filas_para_remover: list[asyncio.Queue] = []

        for fila in filas:
            try:
                fila.put_nowait(mensagem)
            except asyncio.QueueFull:
                logger.warning("Fila SSE cheia | usuario_id=%s", usuario_id)
                filas_para_remover.append(fila)

        for fila in filas_para_remover:
            self.desconectar(usuario_id, fila)


inspetor_notif_manager = GerenciadorSSEUsuario()


# ============================================================================
# HELPERS GERAIS
# ============================================================================


def agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def json_seguro(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False)


def evento_sse(data: dict[str, Any]) -> str:
    return f"data: {json_seguro(data)}\n\n"


def resposta_json_ok(payload: dict[str, Any], status_code: int = 200) -> JSONResponse:
    return JSONResponse(content=payload, status_code=status_code)


def contexto_base(request: Request) -> dict[str, Any]:
    if CHAVE_CSRF_INSPETOR not in request.session:
        request.session[CHAVE_CSRF_INSPETOR] = secrets.token_urlsafe(32)

    return {
        "request": request,
        "csrf_token": request.session[CHAVE_CSRF_INSPETOR],
        "csp_nonce": getattr(request.state, "csp_nonce", ""),
        "v_app": VERSAO_APP,
    }


def validar_csrf(request: Request, token_form: str = "") -> bool:
    token_sessao = request.session.get(CHAVE_CSRF_INSPETOR) or request.session.get("csrf_token", "")
    if not token_sessao:
        return False

    token_candidato = request.headers.get("X-CSRF-Token", "") or token_form
    return bool(token_candidato and secrets.compare_digest(token_sessao, token_candidato))


def exigir_csrf(request: Request, token_form: str = "") -> None:
    if not validar_csrf(request, token_form):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")


def contar_laudos_mes(banco: Session, empresa_id: int) -> int:
    inicio_mes = agora_utc().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    return banco.query(func.count(Laudo.id)).filter(Laudo.empresa_id == empresa_id, Laudo.criado_em >= inicio_mes).scalar() or 0


def laudo_id_sessao(request: Request) -> Optional[int]:
    valor = request.session.get("laudo_ativo_id")
    try:
        return int(valor) if valor is not None else None
    except (TypeError, ValueError):
        return None


def selecionar_template_ativo_para_tipo(
    banco: Session,
    *,
    empresa_id: int,
    tipo_template: str,
) -> TemplateLaudo | None:
    codigos = codigos_template_compativeis(tipo_template)
    if not codigos:
        return None

    candidatos = (
        banco.query(TemplateLaudo)
        .filter(
            TemplateLaudo.empresa_id == empresa_id,
            TemplateLaudo.ativo.is_(True),
            TemplateLaudo.codigo_template.in_(codigos),
        )
        .all()
    )
    if not candidatos:
        return None

    prioridade = {codigo: indice for indice, codigo in enumerate(codigos)}
    candidatos.sort(
        key=lambda item: (
            prioridade.get(str(item.codigo_template or "").strip().lower(), 999),
            -int(item.versao or 0),
            -int(item.id or 0),
        )
    )
    return candidatos[0]


def normalizar_filtro_pendencias(valor: str) -> str:
    filtro = (valor or "").strip().lower()
    if filtro in {"abertas", "resolvidas", "todas"}:
        return filtro
    return "abertas"


def normalizar_paginacao_pendencias(
    pagina: int,
    tamanho: int,
    *,
    tamanho_padrao: int = 25,
    tamanho_maximo: int = 120,
) -> tuple[int, int]:
    pagina_segura = pagina if isinstance(pagina, int) and pagina > 0 else 1

    if not isinstance(tamanho, int) or tamanho <= 0:
        tamanho_seguro = tamanho_padrao
    else:
        tamanho_seguro = min(tamanho, tamanho_maximo)

    return pagina_segura, tamanho_seguro


def listar_pendencias_mesa_laudo(
    banco: Session,
    *,
    laudo_id: int,
    filtro: str,
    pagina: int = 1,
    tamanho: int = 25,
) -> tuple[list[MensagemLaudo], int, int, int]:
    pagina_segura, tamanho_seguro = normalizar_paginacao_pendencias(pagina, tamanho)

    consulta_base = banco.query(MensagemLaudo).filter(
        MensagemLaudo.laudo_id == laudo_id,
        MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
    )

    total = consulta_base.count()
    abertas_total = consulta_base.filter(MensagemLaudo.lida.is_(False)).count()

    if filtro == "abertas":
        consulta_filtrada = consulta_base.filter(MensagemLaudo.lida.is_(False))
    elif filtro == "resolvidas":
        consulta_filtrada = consulta_base.filter(MensagemLaudo.lida.is_(True))
    else:
        consulta_filtrada = consulta_base

    total_filtrado = consulta_filtrada.count()
    deslocamento = (pagina_segura - 1) * tamanho_seguro
    pendencias_filtradas = (
        consulta_filtrada
        .order_by(MensagemLaudo.criado_em.desc())
        .offset(deslocamento)
        .limit(tamanho_seguro)
        .all()
    )
    return pendencias_filtradas, total, abertas_total, total_filtrado


def nome_resolvedor_pendencia(item: MensagemLaudo) -> str:
    if not item.resolvida_por_id:
        return ""

    if item.resolvida_por:
        return (
            getattr(item.resolvida_por, "nome", None)
            or getattr(item.resolvida_por, "nome_completo", None)
            or f"Usuario #{item.resolvida_por_id}"
        )

    return f"Usuario #{item.resolvida_por_id}"


def serializar_pendencia_mesa(item: MensagemLaudo) -> dict[str, Any]:
    return {
        "id": item.id,
        "texto": item.conteudo,
        "lida": bool(item.lida),
        "data": item.criado_em.isoformat() if item.criado_em else "",
        "data_label": (
            item.criado_em.astimezone().strftime("%d/%m %H:%M")
            if item.criado_em
            else ""
        ),
        "resolvida_por_id": item.resolvida_por_id,
        "resolvida_por_nome": nome_resolvedor_pendencia(item),
        "resolvida_em": item.resolvida_em.isoformat() if item.resolvida_em else "",
        "resolvida_em_label": (
            item.resolvida_em.astimezone().strftime("%d/%m %H:%M")
            if item.resolvida_em
            else ""
        ),
    }


def obter_assinatura_mesa_para_pdf(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
) -> dict[str, str]:
    nome_padrao = ASSINATURA_MESA_NOME_PADRAO or "Mesa Avaliadora WF"
    cargo_padrao = ASSINATURA_MESA_CARGO_PADRAO or "Engenheiro Revisor"
    crea_padrao = ASSINATURA_MESA_CREA_PADRAO or "Nao informado"
    carimbo_padrao = ASSINATURA_MESA_CARIMBO_PADRAO or "CARIMBO DIGITAL WF"

    revisor_remetente = (
        banco.query(Usuario)
        .join(MensagemLaudo, MensagemLaudo.remetente_id == Usuario.id)
        .filter(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
            Usuario.empresa_id == empresa_id,
            Usuario.nivel_acesso >= int(NivelAcesso.REVISOR),
        )
        .order_by(MensagemLaudo.criado_em.desc())
        .first()
    )

    revisor_resolvedor = None
    if not revisor_remetente:
        revisor_resolvedor = (
            banco.query(Usuario)
            .join(MensagemLaudo, MensagemLaudo.resolvida_por_id == Usuario.id)
            .filter(
                MensagemLaudo.laudo_id == laudo_id,
                MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
                Usuario.empresa_id == empresa_id,
                Usuario.nivel_acesso >= int(NivelAcesso.REVISOR),
            )
            .order_by(MensagemLaudo.resolvida_em.desc())
            .first()
        )

    engenheiro = revisor_remetente or revisor_resolvedor
    nome_assinatura = (
        getattr(engenheiro, "nome", None)
        or getattr(engenheiro, "nome_completo", None)
        or nome_padrao
    )
    crea_assinatura = str(getattr(engenheiro, "crea", "") if engenheiro else "").strip()[:40] or crea_padrao

    return {
        "nome": nome_assinatura,
        "cargo": cargo_padrao,
        "crea": crea_assinatura,
        "carimbo": carimbo_padrao,
    }


def montar_texto_relatorio_pendencias(
    *,
    laudo_id: int,
    filtro: str,
    pendencias_filtradas: list[MensagemLaudo],
    total: int,
    abertas: int,
    resolvidas: int,
) -> str:
    filtro_label = {
        "abertas": "Abertas",
        "resolvidas": "Resolvidas",
        "todas": "Todas",
    }.get(filtro, "Abertas")

    linhas = [
        "Relatorio de Pendencias da Mesa Avaliadora",
        f"Laudo #{laudo_id}",
        "",
        f"Filtro aplicado: {filtro_label}",
        f"Total geral: {total}",
        f"Abertas: {abertas}",
        f"Resolvidas: {resolvidas}",
        "",
    ]

    if not pendencias_filtradas:
        linhas.append("Nenhuma pendencia encontrada para o filtro selecionado.")
        return "\n".join(linhas)

    linhas.append("Pendencias listadas:")
    for indice, item in enumerate(pendencias_filtradas, start=1):
        data_criacao = item.criado_em.astimezone().strftime("%d/%m/%Y %H:%M") if item.criado_em else "-"
        status = "Aberta" if not item.lida else "Resolvida"
        texto = " ".join((item.conteudo or "").split())[:350] or "(sem conteudo)"

        linhas.append(f"{indice}. [{status}] ID {item.id} | Criada em: {data_criacao}")
        linhas.append(f"   {texto}")

        if item.lida:
            resolvedor = nome_resolvedor_pendencia(item) or "Nao informado"
            data_resolucao = item.resolvida_em.astimezone().strftime("%d/%m/%Y %H:%M") if item.resolvida_em else "-"
            linhas.append(f"   Resolvida por: {resolvedor} | Em: {data_resolucao}")

        linhas.append("")

    return "\n".join(linhas).strip()


def usuario_nome(usuario: Usuario) -> str:
    return getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None) or f"Inspetor #{usuario.id}"


def obter_cliente_ia_ativo() -> ClienteIA:
    if cliente_ia is None:
        detalhe = "Módulo de IA indisponível. Configure CHAVE_API_GEMINI e reinicie o serviço."
        if _erro_cliente_ia_boot:
            detalhe = f"{detalhe} Motivo: {_erro_cliente_ia_boot}"

        raise HTTPException(status_code=503, detail=detalhe)

    return cliente_ia


def redirecionar_por_nivel(usuario: Usuario) -> RedirectResponse:
    nivel = usuario.nivel_acesso

    if nivel == NivelAcesso.INSPETOR.value:
        return RedirectResponse(url="/app/", status_code=303)

    if nivel == NivelAcesso.REVISOR.value:
        return RedirectResponse(url="/revisao/painel", status_code=303)

    if nivel >= NivelAcesso.DIRETORIA.value:
        return RedirectResponse(url="/admin/painel", status_code=303)

    return RedirectResponse(url="/app/login", status_code=303)


def _iniciar_fluxo_troca_senha(request: Request, *, usuario_id: int, lembrar: bool) -> None:
    limpar_sessao_portal(request.session, portal=PORTAL_INSPETOR)
    request.session[CHAVE_CSRF_INSPETOR] = secrets.token_urlsafe(32)
    request.session[CHAVE_TROCA_SENHA_UID] = int(usuario_id)
    request.session[CHAVE_TROCA_SENHA_PORTAL] = PORTAL_TROCA_SENHA_INSPETOR
    request.session[CHAVE_TROCA_SENHA_LEMBRAR] = bool(lembrar)


def _limpar_fluxo_troca_senha(request: Request) -> None:
    request.session.pop(CHAVE_TROCA_SENHA_UID, None)
    request.session.pop(CHAVE_TROCA_SENHA_PORTAL, None)
    request.session.pop(CHAVE_TROCA_SENHA_LEMBRAR, None)


def _usuario_pendente_troca_senha(request: Request, banco: Session) -> Optional[Usuario]:
    if request.session.get(CHAVE_TROCA_SENHA_PORTAL) != PORTAL_TROCA_SENHA_INSPETOR:
        return None

    usuario_id = request.session.get(CHAVE_TROCA_SENHA_UID)
    try:
        usuario_id_int = int(usuario_id)
    except (TypeError, ValueError):
        _limpar_fluxo_troca_senha(request)
        return None

    usuario = banco.get(Usuario, usuario_id_int)
    if not usuario:
        _limpar_fluxo_troca_senha(request)
        return None

    if usuario.nivel_acesso not in NIVEIS_PERMITIDOS_APP:
        _limpar_fluxo_troca_senha(request)
        return None

    if not bool(getattr(usuario, "senha_temporaria_ativa", False)):
        _limpar_fluxo_troca_senha(request)
        return None

    if usuario_tem_bloqueio_ativo(usuario):
        _limpar_fluxo_troca_senha(request)
        return None

    return usuario


def _validar_nova_senha(senha_atual: str, nova_senha: str, confirmar_senha: str) -> str:
    senha_atual = senha_atual or ""
    nova_senha = nova_senha or ""
    confirmar_senha = confirmar_senha or ""

    if not senha_atual or not nova_senha or not confirmar_senha:
        return "Preencha senha atual, nova senha e confirmação."
    if nova_senha != confirmar_senha:
        return "A confirmação da nova senha não confere."
    if len(nova_senha) < 8:
        return "A nova senha deve ter no mínimo 8 caracteres."
    if nova_senha == senha_atual:
        return "A nova senha deve ser diferente da senha temporária."
    return ""


def _render_troca_senha(request: Request, *, erro: str = "", status_code: int = 200) -> HTMLResponse:
    contexto = {
        **contexto_base(request),
        "erro": erro,
        "titulo_pagina": "Troca Obrigatória de Senha",
        "subtitulo_pagina": "Defina sua nova senha para liberar o acesso ao sistema.",
        "acao_form": "/app/trocar-senha",
        "rota_login": "/app/login",
    }
    return templates.TemplateResponse(request, "trocar_senha.html", contexto, status_code=status_code)


def obter_preview_primeira_mensagem(
    mensagem: str,
    *,
    nome_documento: str = "",
    tem_imagem: bool = False,
) -> str:
    texto = (mensagem or "").strip()
    if texto:
        return texto[:80]

    if nome_documento:
        return f"Documento: {nome_documento[:60]}"

    if tem_imagem:
        return "Imagem enviada"

    return "Nova conversa"


def validar_historico_total(historico: list["MensagemHistorico"]) -> None:
    total = sum(len(item.texto or "") for item in historico)
    if total > LIMITE_HISTORICO_TOTAL_CHARS:
        raise HTTPException(
            status_code=413,
            detail="Histórico excedeu o tamanho máximo permitido.",
        )


def validar_imagem_base64(dados_imagem: str) -> str:
    valor = (dados_imagem or "").strip()
    if not valor:
        return ""

    if len(valor) > LIMITE_IMG_BASE64:
        raise HTTPException(status_code=413, detail="Imagem excedeu o tamanho máximo.")

    if not REGEX_DATA_URI_IMAGEM.match(valor):
        raise HTTPException(status_code=400, detail="Imagem base64 inválida.")

    return valor


def nome_documento_seguro(nome: str) -> str:
    texto = (nome or "").strip()
    if not texto:
        return ""

    nome_base = Path(texto).name
    nome_base = re.sub(r"[^A-Za-z0-9._\- ()À-ÿ]", "_", nome_base)
    return nome_base[:LIMITE_NOME_DOCUMENTO]


def safe_remove_file(caminho: str) -> None:
    try:
        if caminho and os.path.isfile(caminho):
            os.remove(caminho)
    except Exception:
        logger.warning("Falha ao remover arquivo temporário | caminho=%s", caminho)


def obter_limite_empresa(usuario: Usuario, banco: Session):
    if not usuario.empresa:
        return None
    return usuario.empresa.obter_limites(banco)


def garantir_limite_laudos(usuario: Usuario, banco: Session) -> None:
    limite = obter_limite_empresa(usuario, banco)
    if not limite or limite.laudos_mes is None:
        return

    usados = contar_laudos_mes(banco, usuario.empresa_id)
    if usados >= limite.laudos_mes:
        raise HTTPException(
            status_code=402,
            detail="Limite de laudos mensais atingido.",
        )


def garantir_upload_documento_habilitado(usuario: Usuario, banco: Session) -> None:
    limite = obter_limite_empresa(usuario, banco)
    if not limite or not getattr(limite, "upload_doc", False):
        raise HTTPException(status_code=403, detail="Upload de documento bloqueado pelo plano.")


def garantir_deep_research_habilitado(usuario: Usuario, banco: Session) -> None:
    limite = obter_limite_empresa(usuario, banco)
    if not limite or not getattr(limite, "deep_research", False):
        raise HTTPException(status_code=403, detail="Deep Research indisponível para o plano atual.")


def obter_laudo_empresa(banco: Session, laudo_id: int, empresa_id: int) -> Laudo:
    laudo = banco.query(Laudo).filter(Laudo.id == laudo_id, Laudo.empresa_id == empresa_id).first()
    if not laudo:
        raise HTTPException(status_code=404, detail="Laudo não encontrado.")
    return laudo


def obter_laudo_do_inspetor(banco: Session, laudo_id: int, usuario: Usuario) -> Laudo:
    laudo = obter_laudo_empresa(banco, laudo_id, usuario.empresa_id)
    if laudo.usuario_id not in (None, usuario.id):
        raise HTTPException(
            status_code=403,
            detail="Laudo não pertence ao inspetor autenticado.",
        )
    return laudo


def _mensagem_eh_comando_sistema(conteudo: str) -> bool:
    texto = (conteudo or "").strip()
    if not texto:
        return False

    texto_lower = texto.lower()
    return (
        "[comando_sistema]" in texto_lower
        or "[comando_rapido]" in texto_lower
        or "comando_sistema finalizarlaudoagora" in texto_lower
        or "solicitou encerramento e geração do laudo" in texto_lower
        or "solicitou encerramento e geracao do laudo" in texto_lower
    )


def _mensagem_representa_foto(conteudo: str) -> bool:
    texto = (conteudo or "").strip().lower()
    return texto in {"[imagem]", "imagem enviada", "[foto]"}


def _mensagem_representa_documento(conteudo: str) -> bool:
    texto = (conteudo or "").strip()
    if not texto:
        return False
    if texto.lower().startswith("documento:"):
        return True
    return bool(REGEX_ARQUIVO_DOCUMENTO.search(texto))


def _mensagem_textual_relevante(conteudo: str) -> bool:
    texto = (conteudo or "").strip()
    if not texto:
        return False
    if _mensagem_eh_comando_sistema(texto):
        return False
    if _mensagem_representa_foto(texto):
        return False
    if _mensagem_representa_documento(texto):
        return False

    texto_util = re.sub(r"[\W_]+", "", texto, flags=re.UNICODE)
    return len(texto_util) >= 8


def _primeira_mensagem_qualificada(laudo: Laudo) -> bool:
    texto = (laudo.primeira_mensagem or "").strip()
    if not texto:
        return False

    texto_lower = texto.lower()
    if texto_lower in {"nova conversa", "imagem enviada", "[imagem]"}:
        return False
    if (
        texto_lower.startswith("relatório ")
        or texto_lower.startswith("relatorio ")
    ) and "iniciado" in texto_lower:
        return False

    texto_util = re.sub(r"[\W_]+", "", texto, flags=re.UNICODE)
    return len(texto_util) >= 8


def _item_gate_qualidade(
    *,
    item_id: str,
    categoria: str,
    titulo: str,
    ok: bool,
    atual: Any,
    minimo: Any,
    observacao: str,
) -> dict[str, Any]:
    return {
        "id": item_id,
        "categoria": categoria,
        "titulo": titulo,
        "status": "ok" if ok else "faltante",
        "atual": atual,
        "minimo": minimo,
        "observacao": observacao,
    }


def avaliar_gate_qualidade_laudo(banco: Session, laudo: Laudo) -> dict[str, Any]:
    tipo_template = normalizar_tipo_template(getattr(laudo, "tipo_template", "padrao"))
    regra = REGRAS_GATE_QUALIDADE_TEMPLATE.get(
        tipo_template,
        REGRAS_GATE_QUALIDADE_TEMPLATE["padrao"],
    )

    mensagens = (
        banco.query(MensagemLaudo)
        .filter(MensagemLaudo.laudo_id == laudo.id)
        .order_by(MensagemLaudo.criado_em.asc())
        .all()
    )
    mensagens_usuario = [
        item
        for item in mensagens
        if item.tipo in (TipoMensagem.USER.value, TipoMensagem.HUMANO_INSP.value)
    ]
    mensagens_ia = [item for item in mensagens if item.tipo == TipoMensagem.IA.value]

    qtd_textos = 0
    qtd_fotos = 0
    qtd_documentos = 0
    qtd_evidencias = 0

    for item in mensagens_usuario:
        conteudo = (item.conteudo or "").strip()
        eh_texto = _mensagem_textual_relevante(conteudo)
        eh_foto = _mensagem_representa_foto(conteudo)
        eh_documento = _mensagem_representa_documento(conteudo)

        if eh_texto:
            qtd_textos += 1
        if eh_foto:
            qtd_fotos += 1
        if eh_documento:
            qtd_documentos += 1
        if eh_texto or eh_foto or eh_documento:
            qtd_evidencias += 1

    min_textos = int(regra.get("min_textos", 0) or 0)
    min_evidencias = int(regra.get("min_evidencias", 0) or 0)
    min_fotos = int(regra.get("min_fotos", 0) or 0)
    min_mensagens_ia = int(regra.get("min_mensagens_ia", 0) or 0)
    requer_dados_formulario = bool(regra.get("requer_dados_formulario", False))

    primeira_ok = _primeira_mensagem_qualificada(laudo)
    mensagens_ia_ok = len(mensagens_ia) >= min_mensagens_ia
    textos_ok = qtd_textos >= min_textos
    evidencias_ok = qtd_evidencias >= min_evidencias
    fotos_ok = qtd_fotos >= min_fotos
    dados_formulario_ok = (not requer_dados_formulario) or bool(laudo.dados_formulario)

    itens = [
        _item_gate_qualidade(
            item_id="campo_escopo_inicial",
            categoria="campo_critico",
            titulo="Escopo inicial da inspeção",
            ok=primeira_ok,
            atual="registrado" if primeira_ok else "ausente",
            minimo="registrado",
            observacao="Defina contexto técnico inicial da inspeção no chat.",
        ),
        _item_gate_qualidade(
            item_id="campo_parecer_ia",
            categoria="campo_critico",
            titulo="Parecer técnico preliminar da IA",
            ok=mensagens_ia_ok,
            atual=len(mensagens_ia),
            minimo=min_mensagens_ia,
            observacao="A IA precisa consolidar ao menos uma resposta técnica antes do envio.",
        ),
        _item_gate_qualidade(
            item_id="evidencias_textuais",
            categoria="evidencia",
            titulo="Registros textuais de campo",
            ok=textos_ok,
            atual=qtd_textos,
            minimo=min_textos,
            observacao="Descreva achados, medições e contexto operacional.",
        ),
        _item_gate_qualidade(
            item_id="evidencias_minimas",
            categoria="evidencia",
            titulo="Evidências mínimas consolidadas",
            ok=evidencias_ok,
            atual=qtd_evidencias,
            minimo=min_evidencias,
            observacao="Combine texto, fotos e documentos para suportar o laudo.",
        ),
        _item_gate_qualidade(
            item_id="fotos_essenciais",
            categoria="foto",
            titulo="Fotos essenciais da inspeção",
            ok=fotos_ok,
            atual=qtd_fotos,
            minimo=min_fotos,
            observacao="Envie imagens dos pontos críticos antes de finalizar.",
        ),
    ]

    if requer_dados_formulario:
        itens.append(
            _item_gate_qualidade(
                item_id="formulario_estruturado",
                categoria="campo_critico",
                titulo="Formulário estruturado obrigatório",
                ok=dados_formulario_ok,
                atual="gerado" if dados_formulario_ok else "pendente",
                minimo="gerado",
                observacao="O template selecionado exige estruturação automática antes do envio.",
            )
        )

    faltantes = [item for item in itens if item["status"] == "faltante"]
    aprovado = len(faltantes) == 0

    resumo = {
        "mensagens_usuario": len(mensagens_usuario),
        "mensagens_ia": len(mensagens_ia),
        "textos_campo": qtd_textos,
        "fotos": qtd_fotos,
        "documentos": qtd_documentos,
        "evidencias": qtd_evidencias,
    }

    mensagem = (
        "Gate de qualidade aprovado. O laudo pode ser enviado para a mesa avaliadora."
        if aprovado
        else (
            f"Finalize bloqueado: faltam {len(faltantes)} item(ns) obrigatório(s) no checklist de qualidade."
        )
    )

    return {
        "codigo": "GATE_QUALIDADE_OK" if aprovado else "GATE_QUALIDADE_REPROVADO",
        "aprovado": aprovado,
        "mensagem": mensagem,
        "tipo_template": tipo_template,
        "template_nome": nome_template_humano(tipo_template),
        "resumo": resumo,
        "itens": itens,
        "faltantes": faltantes,
    }


def garantir_gate_qualidade_laudo(banco: Session, laudo: Laudo) -> dict[str, Any]:
    resultado = avaliar_gate_qualidade_laudo(banco, laudo)
    if not bool(resultado.get("aprovado", False)):
        raise HTTPException(
            status_code=422,
            detail=resultado,
        )
    return resultado


def estado_relatorio_sanitizado(
    request: Request,
    banco: Session,
    usuario: Usuario,
) -> dict[str, Any]:
    estado = request.session.get("estado_relatorio", "sem_relatorio")
    laudo_id = laudo_id_sessao(request)

    if not laudo_id:
        request.session["estado_relatorio"] = "sem_relatorio"
        request.session.pop("laudo_ativo_id", None)
        return {
            "estado": "sem_relatorio",
            "laudo_id": None,
            "tipos_relatorio": TIPOS_TEMPLATE_VALIDOS,
        }

    laudo = (
        banco.query(Laudo)
        .filter(
            Laudo.id == laudo_id,
            Laudo.empresa_id == usuario.empresa_id,
            Laudo.usuario_id == usuario.id,
        )
        .first()
    )

    if not laudo:
        request.session["estado_relatorio"] = "sem_relatorio"
        request.session.pop("laudo_ativo_id", None)
        return {
            "estado": "sem_relatorio",
            "laudo_id": None,
            "tipos_relatorio": TIPOS_TEMPLATE_VALIDOS,
        }

    if laudo.status_revisao == StatusRevisao.RASCUNHO.value:
        estado = "relatorio_ativo"
    else:
        estado = "sem_relatorio"
        request.session.pop("laudo_ativo_id", None)

    request.session["estado_relatorio"] = estado

    return {
        "estado": estado,
        "laudo_id": laudo.id if estado == "relatorio_ativo" else None,
        "tipos_relatorio": TIPOS_TEMPLATE_VALIDOS,
    }


def formatar_data_humana(valor: Optional[datetime]) -> str:
    return formatar_data_br(valor, incluir_ano=True)


def formatar_data_br(valor: Optional[datetime], *, incluir_ano: bool = False) -> str:
    if not valor:
        return "-"

    try:
        formato = "%d/%m/%Y %H:%M" if incluir_ano else "%d/%m %H:%M"
        return valor.astimezone().strftime(formato)
    except Exception:
        return "-"


def descrever_status_revisao(status: str) -> str:
    status_normalizado = str(status or "").strip().lower()
    mapa = {
        StatusRevisao.RASCUNHO.value: "Rascunho em campo",
        StatusRevisao.AGUARDANDO.value: "Aguardando mesa avaliadora",
        StatusRevisao.APROVADO.value: "Aprovado",
    }
    return mapa.get(status_normalizado, status_normalizado or "Indefinido")


def _obter_ultima_revisao_laudo(banco: Session, laudo_id: int) -> LaudoRevisao | None:
    return (
        banco.query(LaudoRevisao)
        .filter(LaudoRevisao.laudo_id == laudo_id)
        .order_by(LaudoRevisao.numero_versao.desc(), LaudoRevisao.id.desc())
        .first()
    )


def _obter_revisao_por_versao(banco: Session, laudo_id: int, versao: int) -> LaudoRevisao | None:
    return (
        banco.query(LaudoRevisao)
        .filter(LaudoRevisao.laudo_id == laudo_id, LaudoRevisao.numero_versao == versao)
        .first()
    )


def _registrar_revisao_laudo(
    banco: Session,
    laudo: Laudo,
    *,
    conteudo: str,
    origem: str,
    confianca: dict[str, Any] | None = None,
) -> LaudoRevisao | None:
    texto = str(conteudo or "").strip()
    if not texto:
        return None

    ultima = _obter_ultima_revisao_laudo(banco, laudo.id)
    if ultima and (ultima.conteudo or "").strip() == texto:
        return ultima

    proxima_versao = (int(ultima.numero_versao) + 1) if ultima else 1
    payload_confianca = normalizar_payload_confianca_ia(confianca or {})

    revisao = LaudoRevisao(
        laudo_id=laudo.id,
        numero_versao=proxima_versao,
        origem=str(origem or "ia").strip().lower()[:20] or "ia",
        resumo=_resumo_texto_curto(texto, limite=220),
        conteudo=texto,
        confianca_geral=payload_confianca.get("geral"),
        confianca_json=payload_confianca or None,
    )
    banco.add(revisao)
    return revisao


def _serializar_revisao_laudo(revisao: LaudoRevisao) -> dict[str, Any]:
    payload_confianca = normalizar_payload_confianca_ia(revisao.confianca_json or {})
    return {
        "id": revisao.id,
        "versao": int(revisao.numero_versao),
        "origem": revisao.origem,
        "resumo": revisao.resumo or "",
        "criado_em": revisao.criado_em.isoformat() if revisao.criado_em else "",
        "confianca_geral": payload_confianca.get("geral") or str(revisao.confianca_geral or "").strip().lower(),
        "confianca": payload_confianca,
    }


def _gerar_diff_revisoes(base: str, comparar: str) -> str:
    linhas_base = (base or "").splitlines()
    linhas_comparar = (comparar or "").splitlines()

    diff = difflib.unified_diff(
        linhas_base,
        linhas_comparar,
        fromfile="versao_base",
        tofile="versao_comparada",
        lineterm="",
        n=2,
    )
    return "\n".join(diff).strip()


def _resumo_diff_revisoes(diff_texto: str) -> dict[str, int]:
    adicionadas = 0
    removidas = 0
    for linha in (diff_texto or "").splitlines():
        if not linha or linha.startswith(("+++", "---", "@@")):
            continue
        if linha.startswith("+"):
            adicionadas += 1
        elif linha.startswith("-"):
            removidas += 1

    return {
        "linhas_adicionadas": adicionadas,
        "linhas_removidas": removidas,
        "total_alteracoes": adicionadas + removidas,
    }


def montar_resposta_comando_pendencias(
    banco: Session,
    laudo: Laudo,
    argumento: str,
) -> str:
    filtro_bruto = (argumento or "").split(" ", 1)[0].strip().lower()
    filtro = normalizar_filtro_pendencias(filtro_bruto or "abertas")
    pendencias, total, abertas, total_filtrado = listar_pendencias_mesa_laudo(
        banco,
        laudo_id=laudo.id,
        filtro=filtro,
        pagina=1,
        tamanho=5,
    )
    resolvidas = max(total - abertas, 0)

    linhas = [
        "### Pendências da Mesa",
        f"- Filtro: **{MAPA_FILTRO_PENDENCIAS_LABEL.get(filtro, 'Abertas')}**",
        f"- Total geral: **{total}**",
        f"- Abertas: **{abertas}** | Resolvidas: **{resolvidas}**",
    ]

    if total_filtrado <= 0:
        linhas.append("- Nenhuma pendência para o filtro selecionado.")
        linhas.append("")
        linhas.append("Comandos úteis: `/pendencias todas` | `/pendencias abertas` | `/pendencias resolvidas`")
        return "\n".join(linhas)

    linhas.append("")
    linhas.append("Principais itens:")
    for indice, item in enumerate(pendencias, start=1):
        status_item = "aberta" if not item.lida else "resolvida"
        data_item = formatar_data_humana(item.criado_em)
        texto_item = " ".join((item.conteudo or "").split()).strip()[:180] or "(sem conteúdo)"
        linhas.append(f"{indice}. [{status_item}] {texto_item} _(#{item.id} · {data_item})_")

    if total_filtrado > len(pendencias):
        linhas.append(f"- ... e mais **{total_filtrado - len(pendencias)}** item(ns) no filtro atual.")

    linhas.append("")
    linhas.append("Dica: use `/enviar_mesa <mensagem>` para responder no mesmo chat.")
    return "\n".join(linhas)


def montar_resposta_comando_resumo(
    banco: Session,
    laudo: Laudo,
) -> str:
    mensagens = banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo.id).all()
    qtd_usuario = sum(1 for item in mensagens if item.tipo in (TipoMensagem.USER.value, TipoMensagem.HUMANO_INSP.value))
    qtd_ia = sum(1 for item in mensagens if item.tipo == TipoMensagem.IA.value)
    qtd_mesa = sum(1 for item in mensagens if item.tipo == TipoMensagem.HUMANO_ENG.value)
    qtd_fotos = sum(1 for item in mensagens if _mensagem_representa_foto(item.conteudo or ""))
    qtd_docs = sum(1 for item in mensagens if _mensagem_representa_documento(item.conteudo or ""))
    gate = avaliar_gate_qualidade_laudo(banco, laudo)
    hash_curto = (laudo.codigo_hash or "")[-6:]
    pendencias_abertas = (
        banco.query(MensagemLaudo)
        .filter(
            MensagemLaudo.laudo_id == laudo.id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
            MensagemLaudo.lida.is_(False),
        )
        .count()
    )
    total_revisoes = (
        banco.query(func.count(LaudoRevisao.id))
        .filter(LaudoRevisao.laudo_id == laudo.id)
        .scalar()
        or 0
    )
    ultima_revisao = _obter_ultima_revisao_laudo(banco, laudo.id)
    confianca = normalizar_payload_confianca_ia(getattr(laudo, "confianca_ia_json", None) or {})
    confianca_geral = _titulo_confianca_humano(confianca.get("geral", CONFIANCA_MEDIA))

    linhas = [
        "### Resumo da Sessão",
        f"- Laudo: **#{hash_curto or laudo.id}** ({nome_template_humano(getattr(laudo, 'tipo_template', 'padrao'))})",
        f"- Status: **{descrever_status_revisao(laudo.status_revisao)}**",
        f"- Atualizado em: **{formatar_data_humana(getattr(laudo, 'atualizado_em', None) or getattr(laudo, 'criado_em', None))}**",
        f"- Mensagens: usuário/inspetor **{qtd_usuario}**, IA **{qtd_ia}**, mesa **{qtd_mesa}**",
        f"- Evidências registradas: fotos **{qtd_fotos}**, documentos **{qtd_docs}**",
        f"- Pendências abertas da mesa: **{pendencias_abertas}**",
        f"- Confiança IA (última síntese): **{confianca_geral}**",
    ]

    if total_revisoes:
        linhas.append(f"- Versionamento: **v{ultima_revisao.numero_versao if ultima_revisao else total_revisoes}** ({total_revisoes} revisão(ões))")
        if total_revisoes >= 2 and ultima_revisao:
            revisao_anterior = _obter_revisao_por_versao(
                banco,
                laudo.id,
                int(ultima_revisao.numero_versao) - 1,
            )
            if revisao_anterior:
                diff = _gerar_diff_revisoes(revisao_anterior.conteudo or "", ultima_revisao.conteudo or "")
                resumo_diff = _resumo_diff_revisoes(diff)
                linhas.append(
                    "- Mudanças da última revisão: "
                    f"**+{resumo_diff['linhas_adicionadas']} / -{resumo_diff['linhas_removidas']}**"
                )

    if gate.get("aprovado", False):
        linhas.append("- Gate de qualidade: **aprovado**")
    else:
        faltantes = gate.get("faltantes", []) or []
        linhas.append(f"- Gate de qualidade: **reprovado** ({len(faltantes)} item(ns) pendente(s))")
        if faltantes:
            linhas.append("  Itens críticos:")
            for item in faltantes[:3]:
                linhas.append(f"  - {item.get('titulo', 'Item pendente')}")

    pontos_humanos = confianca.get("pontos_validacao_humana", []) or []
    if pontos_humanos:
        linhas.append("- Pontos para validação humana:")
        for item in pontos_humanos[:3]:
            linhas.append(f"  - {item}")

    return "\n".join(linhas)


def montar_resposta_comando_previa(
    banco: Session,
    laudo: Laudo,
) -> str:
    gate = avaliar_gate_qualidade_laudo(banco, laudo)
    faltantes = gate.get("faltantes", []) or []
    pendencias_abertas = (
        banco.query(MensagemLaudo)
        .filter(
            MensagemLaudo.laudo_id == laudo.id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
            MensagemLaudo.lida.is_(False),
        )
        .count()
    )
    parecer_ia = (laudo.parecer_ia or "").strip()
    if parecer_ia:
        parecer_preview = parecer_ia[:900] + ("..." if len(parecer_ia) > 900 else "")
    else:
        parecer_preview = "_Sem parecer consolidado da IA até o momento._"
    confianca = normalizar_payload_confianca_ia(getattr(laudo, "confianca_ia_json", None) or {})
    confianca_geral = _titulo_confianca_humano(confianca.get("geral", CONFIANCA_MEDIA))
    ultima_revisao = _obter_ultima_revisao_laudo(banco, laudo.id)
    total_revisoes = (
        banco.query(func.count(LaudoRevisao.id))
        .filter(LaudoRevisao.laudo_id == laudo.id)
        .scalar()
        or 0
    )

    linhas = [
        "### Prévia Operacional do Laudo",
        f"**Template:** {nome_template_humano(getattr(laudo, 'tipo_template', 'padrao'))}",
        f"**Status:** {descrever_status_revisao(laudo.status_revisao)}",
        f"**Atualização:** {formatar_data_humana(getattr(laudo, 'atualizado_em', None) or getattr(laudo, 'criado_em', None))}",
        f"**Confiança IA:** {confianca_geral}",
        "",
        "**Escopo inicial registrado**",
        (laudo.primeira_mensagem or "_Sem escopo inicial registrado._"),
        "",
        "**Síntese técnica atual da IA**",
        parecer_preview,
        "",
        f"**Pendências abertas da mesa:** {pendencias_abertas}",
    ]

    if total_revisoes:
        linhas.append(
            f"**Versão atual:** v{ultima_revisao.numero_versao if ultima_revisao else total_revisoes} "
            f"({total_revisoes} revisão(ões))"
        )

    pontos_humanos = confianca.get("pontos_validacao_humana", []) or []
    if pontos_humanos:
        linhas.append("")
        linhas.append("**Pontos para validação humana**")
        for item in pontos_humanos[:4]:
            linhas.append(f"- {item}")

    if gate.get("aprovado", False):
        linhas.append("**Gate de qualidade:** aprovado para envio.")
    else:
        linhas.append(f"**Gate de qualidade:** bloqueado ({len(faltantes)} item(ns) pendente(s)).")
        if faltantes:
            linhas.append("")
            linhas.append("Itens que faltam:")
            for item in faltantes[:5]:
                linhas.append(f"- {item.get('titulo', 'Item pendente')} — {item.get('observacao', '')}".strip())

    linhas.append("")
    linhas.append("Comandos úteis: `/resumo` | `/pendencias` | `/enviar_mesa <mensagem>`")
    return "\n".join(linhas)


def montar_resposta_comando_rapido(
    banco: Session,
    laudo: Laudo,
    comando: str,
    argumento: str,
) -> str:
    comando_normalizado = str(comando or "").strip().lower()
    if comando_normalizado == "pendencias":
        return montar_resposta_comando_pendencias(banco, laudo, argumento)
    if comando_normalizado == "resumo":
        return montar_resposta_comando_resumo(banco, laudo)
    if comando_normalizado == "gerar_previa":
        return montar_resposta_comando_previa(banco, laudo)

    raise HTTPException(status_code=400, detail="Comando rápido inválido.")


def registrar_comando_rapido_historico(
    banco: Session,
    laudo: Laudo,
    usuario: Usuario,
    comando: str,
    argumento: str,
    resposta: str,
) -> None:
    sufixo = f" {argumento.strip()}" if argumento else ""
    conteudo_comando = f"[COMANDO_RAPIDO] /{comando}{sufixo}".strip()

    banco.add(
        MensagemLaudo(
            laudo_id=laudo.id,
            remetente_id=usuario.id,
            tipo=TipoMensagem.USER.value,
            conteudo=conteudo_comando,
            custo_api_reais=Decimal("0.0000"),
        )
    )
    banco.add(
        MensagemLaudo(
            laudo_id=laudo.id,
            tipo=TipoMensagem.IA.value,
            conteudo=resposta,
            custo_api_reais=Decimal("0.0000"),
        )
    )
    laudo.atualizado_em = agora_utc()


def montar_limites_para_template(banco: Session) -> dict[str, Any]:
    limites: dict[str, Any] = {}

    for plano in PlanoEmpresa:
        registro = banco.get(LimitePlano, plano.value)
        if registro:
            limites[plano.value] = registro
            continue

        fallback = type("LimitePlanoView", (), {})()
        setattr(fallback, "plano", plano.value)

        for campo, valor in LIMITES_PADRAO.get(plano.value, {}).items():
            setattr(fallback, campo, valor)

        limites[plano.value] = fallback

    return limites


def serializar_historico_mensagem(
    mensagem: MensagemLaudo,
    modo_resposta: str,
    citacoes: list[dict[str, Any]] | None = None,
    confianca_ia: dict[str, Any] | None = None,
) -> dict[str, Any]:
    referencia_mensagem_id, texto_limpo = extrair_referencia_do_texto(mensagem.conteudo)

    if mensagem.tipo in (TipoMensagem.USER.value, TipoMensagem.HUMANO_INSP.value):
        papel = "usuario"
    elif mensagem.tipo == TipoMensagem.HUMANO_ENG.value:
        papel = "engenheiro"
    else:
        papel = "assistente"

    item: dict[str, Any] = {
        "id": mensagem.id,
        "papel": papel,
        "texto": texto_limpo,
        "tipo": mensagem.tipo,
        "modo": modo_resposta or MODO_DETALHADO,
        "is_whisper": mensagem.tipo
        in (
            TipoMensagem.HUMANO_INSP.value,
            TipoMensagem.HUMANO_ENG.value,
        ),
        "remetente_id": mensagem.remetente_id,
    }
    if referencia_mensagem_id:
        item["referencia_mensagem_id"] = referencia_mensagem_id

    if citacoes:
        item["citacoes"] = citacoes
    if confianca_ia and mensagem.tipo == TipoMensagem.IA.value:
        item["confianca_ia"] = normalizar_payload_confianca_ia(confianca_ia)

    return item


def serializar_mensagem_mesa(mensagem: MensagemLaudo) -> dict[str, Any]:
    referencia_mensagem_id, texto_limpo = extrair_referencia_do_texto(mensagem.conteudo)
    payload: dict[str, Any] = {
        "id": mensagem.id,
        "laudo_id": mensagem.laudo_id,
        "tipo": mensagem.tipo,
        "texto": texto_limpo,
        "remetente_id": mensagem.remetente_id,
        "data": formatar_data_br(mensagem.criado_em),
    }
    if referencia_mensagem_id:
        payload["referencia_mensagem_id"] = referencia_mensagem_id
    return payload


async def notificar_mesa_whisper(
    *,
    empresa_id: int,
    laudo_id: int,
    inspetor_id: int,
    inspetor_nome: str,
    preview: str,
) -> None:
    try:
        from app.domains.revisor.routes import manager as manager_mesa

        payload = {
            "tipo": "whisper_ping",
            "laudo_id": laudo_id,
            "inspetor": inspetor_nome,
            "inspetor_id": inspetor_id,
            "preview": preview[:120],
            "timestamp": agora_utc().isoformat(),
        }

        if hasattr(manager_mesa, "broadcast_empresa"):
            await manager_mesa.broadcast_empresa(
                empresa_id=empresa_id,
                mensagem=payload,
            )
        elif hasattr(manager_mesa, "ping_whisper"):
            await manager_mesa.ping_whisper(payload)

    except Exception:
        logger.warning("Falha ao notificar mesa avaliadora.", exc_info=True)


# ============================================================================
# APIs CRUD / AUXILIARES
# ============================================================================
