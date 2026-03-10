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
import io  # noqa: F401
import json
import logging
import os
import secrets
import tempfile  # noqa: F401
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation  # noqa: F401
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
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask  # noqa: F401

from app.core.settings import get_settings
from app.shared.database import (
    LIMITES_PADRAO,
    CitacaoLaudo,  # noqa: F401
    Empresa,  # noqa: F401
    Laudo,
    LimitePlano,
    ModoResposta,
    NivelAcesso,
    PlanoEmpresa,
    SessaoLocal,  # noqa: F401
    TemplateLaudo,
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
    CONFIANCA_MEDIA,  # noqa: F401
    _titulo_confianca_humano,  # noqa: F401
    analisar_confianca_resposta_ia,  # noqa: F401
)
from nucleo.inspetor.referencias_mensagem import (
    compor_texto_com_referencia,  # noqa: F401
)
from nucleo.template_laudos import gerar_preview_pdf_template  # noqa: F401
from app.domains.chat.normalization import (
    codigos_template_compativeis,
)
from app.domains.chat.media_helpers import (
    LIMITE_HISTORICO_TOTAL_CHARS,  # noqa: F401
    LIMITE_IMG_BASE64,  # noqa: F401
    LIMITE_NOME_DOCUMENTO,  # noqa: F401
    REGEX_ARQUIVO_DOCUMENTO,  # noqa: F401
    REGEX_DATA_URI_IMAGEM,  # noqa: F401
    nome_documento_seguro,  # noqa: F401
    safe_remove_file,  # noqa: F401
    validar_historico_total,  # noqa: F401
    validar_imagem_base64,  # noqa: F401
)
from app.domains.chat.session_helpers import (
    CHAVE_CSRF_INSPETOR,  # noqa: F401
    VERSAO_APP,  # noqa: F401
    contexto_base,  # noqa: F401
    estado_relatorio_sanitizado,  # noqa: F401
    exigir_csrf,  # noqa: F401
    laudo_id_sessao,  # noqa: F401
    validar_csrf,  # noqa: F401
)
from app.domains.chat.limits_helpers import (
    contar_laudos_mes,  # noqa: F401
    garantir_deep_research_habilitado,  # noqa: F401
    garantir_limite_laudos,  # noqa: F401
    garantir_upload_documento_habilitado,  # noqa: F401
    obter_limite_empresa,  # noqa: F401
)
from app.domains.chat.pendencias_helpers import (
    MAPA_FILTRO_PENDENCIAS_LABEL,  # noqa: F401
    descrever_status_revisao,  # noqa: F401
    formatar_data_humana,  # noqa: F401
    listar_pendencias_mesa_laudo,  # noqa: F401
    normalizar_filtro_pendencias,  # noqa: F401
)
from app.domains.chat.gate_helpers import (
    REGRAS_GATE_QUALIDADE_TEMPLATE,  # noqa: F401
    avaliar_gate_qualidade_laudo,  # noqa: F401
    garantir_gate_qualidade_laudo,  # noqa: F401
)
from app.domains.chat.mensagem_helpers import (
    notificar_mesa_whisper,  # noqa: F401
    serializar_historico_mensagem,  # noqa: F401
    serializar_mensagem_mesa,  # noqa: F401
)
from app.domains.chat.commands_helpers import (
    montar_resposta_comando_pendencias,  # noqa: F401
    montar_resposta_comando_previa,  # noqa: F401
    montar_resposta_comando_rapido,  # noqa: F401
    montar_resposta_comando_resumo,  # noqa: F401
    registrar_comando_rapido_historico,  # noqa: F401
)
from app.domains.chat.revisao_helpers import (
    _gerar_diff_revisoes,  # noqa: F401
    _obter_revisao_por_versao,  # noqa: F401
    _obter_ultima_revisao_laudo,  # noqa: F401
    _registrar_revisao_laudo,  # noqa: F401
    _resumo_diff_revisoes,  # noqa: F401
    _serializar_revisao_laudo,  # noqa: F401
)
from app.domains.chat.schemas import (
    DadosChat,  # noqa: F401
    DadosFeedback,  # noqa: F401
    DadosPDF,  # noqa: F401
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

# 10 MB binário em base64 pode ultrapassar 13 MB de string

LIMITE_DOC_BYTES = 15 * 1024 * 1024
LIMITE_DOC_CHARS = 40_000
LIMITE_PARECER = 4_000
LIMITE_FEEDBACK = 500

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

MIME_DOC_PERMITIDOS = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}

PADRAO_SUPORTE_WHATSAPP = os.getenv("SUPORTE_WHATSAPP", "5516999999999").strip()

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


# ============================================================================
# APIs CRUD / AUXILIARES
# ============================================================================
