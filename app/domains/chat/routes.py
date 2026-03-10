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
import io
import json
import logging
import os
import re
import secrets
import tempfile
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Optional

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
)
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    StreamingResponse,
)
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.shared.database import (
    LIMITES_PADRAO,
    CitacaoLaudo,
    Empresa,
    Laudo,
    LaudoRevisao,
    LimitePlano,
    ModoResposta,
    MensagemLaudo,
    NivelAcesso,
    PlanoEmpresa,
    SessaoLocal,
    StatusRevisao,
    TemplateLaudo,
    TipoMensagem,
    Usuario,
    obter_banco,
)
from app.shared.security import (
    PORTAL_INSPETOR,
    criar_hash_senha,
    criar_sessao,
    definir_sessao_portal,
    encerrar_sessao,
    exigir_inspetor,
    limpar_sessao_portal,
    obter_dados_sessao_portal,
    obter_usuario_html,
    token_esta_ativo,
    usuario_tem_bloqueio_ativo,
    verificar_senha,
)
from nucleo.cliente_ia import ClienteIA
from nucleo.gerador_laudos import GeradorLaudos
from nucleo.template_laudos import gerar_preview_pdf_template
from nucleo.inspetor.comandos_chat import (
    analisar_comando_finalizacao,
    analisar_comando_rapido_chat,
    mensagem_para_mesa,
    remover_mencao_mesa,
)
from nucleo.inspetor.confianca_ia import (
    CONFIANCA_MEDIA,
    _resumo_texto_curto,
    _titulo_confianca_humano,
    analisar_confianca_resposta_ia,
    normalizar_payload_confianca_ia,
)
from nucleo.inspetor.referencias_mensagem import (
    compor_texto_com_referencia,
    extrair_referencia_do_texto,
)
from app.domains.chat.templates_ai import RelatorioCBMGO
from app.domains.chat.schemas import (
    DadosChat,
    DadosFeedback,
    DadosMesaMensagem,
    DadosPDF,
    DadosPendencia,
    DadosPin,
)

try:
    from configuracoes import configuracoes
except ImportError:
    configuracoes = None

logger = logging.getLogger("tariel.rotas_inspetor")

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

SETORES_PERMITIDOS = frozenset(
    {
        "geral",
        "eletrica",
        "mecanica",
        "caldeiraria",
        "spda",
        "loto",
        "nr10",
        "nr12",
        "nr13",
        "nr35",
        "avcb",
        "pie",
        "rti",
    }
)

TIPOS_TEMPLATE_VALIDOS = {
    "cbmgo": "CBM-GO Vistoria Bombeiro",
    "rti": "NR-10 RTI Elétrica",
    "nr10_rti": "NR-10 RTI Elétrica",
    "nr13": "NR-13 Caldeiras",
    "nr13_caldeira": "NR-13 Caldeiras",
    "nr12maquinas": "NR-12 Máquinas",
    "nr12_maquinas": "NR-12 Máquinas",
    "spda": "SPDA Proteção Descargas",
    "pie": "PIE Instalações Elétricas",
    "avcb": "AVCB Projeto Bombeiro",
    "padrao": "Inspeção Geral (Padrão)",
}

ALIASES_TEMPLATE = {
    "nr12": "nr12maquinas",
    "nr12_maquinas": "nr12maquinas",
    "nr12maquinas": "nr12maquinas",
    "rti": "rti",
    "nr10_rti": "rti",
    "nr13": "nr13",
    "nr13_caldeira": "nr13",
    "cbmgo": "cbmgo",
    "spda": "spda",
    "pie": "pie",
    "avcb": "avcb",
    "padrao": "padrao",
}

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


def normalizar_email(email: str) -> str:
    return (email or "").strip().lower()


def normalizar_setor(valor: str) -> str:
    setor = (valor or "").strip().lower()
    return setor if setor in SETORES_PERMITIDOS else "geral"


def normalizar_tipo_template(valor: str) -> str:
    bruto = (valor or "").strip().lower()
    return ALIASES_TEMPLATE.get(bruto, "padrao")


def codigos_template_compativeis(tipo_template: str) -> list[str]:
    tipo = normalizar_tipo_template(tipo_template)
    variantes_por_tipo: dict[str, list[str]] = {
        "cbmgo": ["cbmgo", "cbmgo_cmar", "checklist_cbmgo"],
        "rti": ["rti", "nr10_rti"],
        "nr13": ["nr13", "nr13_caldeira"],
        "nr12maquinas": ["nr12maquinas", "nr12_maquinas"],
        "padrao": ["padrao"],
    }

    candidatos = [tipo, *variantes_por_tipo.get(tipo, [])]
    vistos: set[str] = set()
    codigos: list[str] = []
    for item in candidatos:
        codigo = re.sub(r"[^a-z0-9_-]+", "_", str(item or "").strip().lower()).strip("_-")
        if not codigo or codigo in vistos:
            continue
        vistos.add(codigo)
        codigos.append(codigo)
    return codigos


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


def nome_template_humano(tipo_template: str) -> str:
    tipo = normalizar_tipo_template(tipo_template)
    return TIPOS_TEMPLATE_VALIDOS.get(tipo, TIPOS_TEMPLATE_VALIDOS["padrao"])


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
# FLUXO DE RELATÓRIO
# ============================================================================


async def api_status_relatorio(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    return resposta_json_ok(estado_relatorio_sanitizado(request, banco, usuario))


async def api_iniciar_relatorio(
    request: Request,
    tipo_template: str | None = Form(default=None),
    tipotemplate: str | None = Form(default=None),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    tipo_template_bruto = (tipo_template or tipotemplate or "").strip().lower()

    if not tipo_template_bruto:
        payload_json: dict[str, Any] = {}
        try:
            payload_json = await request.json()
        except Exception:
            payload_json = {}

        tipo_template_bruto = str(payload_json.get("tipo_template") or payload_json.get("tipotemplate") or payload_json.get("template") or "").strip().lower()

    if not tipo_template_bruto:
        raise HTTPException(status_code=400, detail="Tipo de relatório não informado.")

    if tipo_template_bruto not in ALIASES_TEMPLATE:
        raise HTTPException(status_code=400, detail="Tipo de relatório inválido.")

    tipo_template_normalizado = normalizar_tipo_template(tipo_template_bruto)

    garantir_limite_laudos(usuario, banco)

    laudo_id_ativo = laudo_id_sessao(request)
    if laudo_id_ativo:
        laudo_ativo = (
            banco.query(Laudo)
            .filter(
                Laudo.id == laudo_id_ativo,
                Laudo.empresa_id == usuario.empresa_id,
                Laudo.usuario_id == usuario.id,
                Laudo.status_revisao == StatusRevisao.RASCUNHO.value,
            )
            .first()
        )
        if laudo_ativo:
            return resposta_json_ok(
                {
                    "success": True,
                    "laudo_id": laudo_ativo.id,
                    "hash": laudo_ativo.codigo_hash[-6:],
                    "message": "Já existe um relatório ativo em andamento.",
                    "estado": "relatorio_ativo",
                    "tipo_template": laudo_ativo.tipo_template,
                }
            )

    laudo = Laudo(
        empresa_id=usuario.empresa_id,
        usuario_id=usuario.id,
        tipo_template=tipo_template_normalizado,
        status_revisao=StatusRevisao.RASCUNHO.value,
        setor_industrial=nome_template_humano(tipo_template_normalizado),
        primeira_mensagem=f"Relatório {tipo_template_normalizado.upper()} iniciado",
        modo_resposta=MODO_DETALHADO,
        codigo_hash=uuid.uuid4().hex,
        is_deep_research=False,
    )

    banco.add(laudo)
    banco.commit()
    banco.refresh(laudo)

    request.session["laudo_ativo_id"] = laudo.id
    request.session["estado_relatorio"] = "relatorio_ativo"

    logger.info(
        "Relatório iniciado | usuario_id=%s | tipo=%s | laudo_id=%s",
        usuario.id,
        tipo_template_normalizado,
        laudo.id,
    )

    return resposta_json_ok(
        {
            "success": True,
            "laudo_id": laudo.id,
            "hash": laudo.codigo_hash[-6:],
            "message": f"✅ Relatório {nome_template_humano(tipo_template_normalizado)} iniciado!",
            "estado": "relatorio_ativo",
            "tipo_template": tipo_template_normalizado,
        }
    )


async def api_finalizar_relatorio(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    if laudo.status_revisao != StatusRevisao.RASCUNHO.value:
        raise HTTPException(status_code=400, detail="Laudo já foi enviado ou finalizado.")

    if laudo.tipo_template == "cbmgo" and not laudo.dados_formulario:
        try:
            mensagens = banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo_id).order_by(MensagemLaudo.criado_em.asc()).all()

            historico = [
                {
                    "papel": "usuario" if m.tipo == TipoMensagem.USER.value else "assistente",
                    "texto": m.conteudo,
                }
                for m in mensagens
                if m.tipo in (TipoMensagem.USER.value, TipoMensagem.IA.value)
            ]

            cliente_ia_ativo = obter_cliente_ia_ativo()
            dados_json = await cliente_ia_ativo.gerar_json_estruturado(
                schema_pydantic=RelatorioCBMGO,
                historico=historico,
                dados_imagem="",
                texto_documento="",
            )
            laudo.dados_formulario = dados_json
        except Exception:
            logger.warning(
                "Falha ao gerar JSON estruturado CBM-GO na finalização | laudo_id=%s",
                laudo_id,
                exc_info=True,
            )

    garantir_gate_qualidade_laudo(banco, laudo)

    laudo.status_revisao = StatusRevisao.AGUARDANDO.value
    laudo.atualizado_em = agora_utc()
    banco.commit()

    if laudo_id_sessao(request) == laudo.id:
        request.session.pop("laudo_ativo_id", None)
    request.session["estado_relatorio"] = "sem_relatorio"

    logger.info("Relatório finalizado | usuario_id=%s | laudo_id=%s", usuario.id, laudo_id)

    return resposta_json_ok(
        {
            "success": True,
            "message": "✅ Relatório enviado para engenharia! Já aparece na Mesa de Avaliação.",
        }
    )


async def api_obter_gate_qualidade_laudo(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    resultado = avaliar_gate_qualidade_laudo(banco, laudo)

    status_http = 200 if bool(resultado.get("aprovado", False)) else 422
    return JSONResponse(resultado, status_code=status_http)


async def api_cancelar_relatorio(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    laudo_id = laudo_id_sessao(request)
    if laudo_id:
        laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)

        if laudo.status_revisao != StatusRevisao.RASCUNHO.value:
            raise HTTPException(
                status_code=400,
                detail="Apenas relatórios em rascunho podem ser cancelados.",
            )

        banco.delete(laudo)
        banco.commit()

    request.session.pop("laudo_ativo_id", None)
    request.session["estado_relatorio"] = "sem_relatorio"

    return resposta_json_ok({"success": True, "message": "❌ Relatório cancelado"})


async def api_desativar_relatorio_ativo(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    """
    Remove apenas o contexto de "laudo ativo" da sessão.
    Não exclui o laudo em rascunho do banco.
    """
    exigir_csrf(request)

    laudo_id_atual = laudo_id_sessao(request)
    laudo_existente = False

    if laudo_id_atual:
        laudo_existente = bool(
            banco.query(Laudo)
            .filter(
                Laudo.id == laudo_id_atual,
                Laudo.empresa_id == usuario.empresa_id,
                Laudo.usuario_id == usuario.id,
            )
            .first()
        )

    request.session.pop("laudo_ativo_id", None)
    request.session["estado_relatorio"] = "sem_relatorio"

    return resposta_json_ok(
        {
            "success": True,
            "message": "Sessão ativa removida da central.",
            "laudo_id": int(laudo_id_atual) if laudo_id_atual else None,
            "laudo_preservado": laudo_existente,
        }
    )


# ============================================================================
# CONTROLE DE ACESSO E PÁGINAS HTML
# ============================================================================


async def tela_login_app(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    dados_sessao = obter_dados_sessao_portal(request.session, portal=PORTAL_INSPETOR)
    token = dados_sessao.get("token")
    if token and token_esta_ativo(token):
        usuario_id = dados_sessao.get("usuario_id")
        if usuario_id:
            usuario = banco.get(Usuario, usuario_id)
            if usuario:
                return redirecionar_por_nivel(usuario)
        limpar_sessao_portal(request.session, portal=PORTAL_INSPETOR)

    return templates.TemplateResponse(request, "login_app.html", contexto_base(request))


async def tela_troca_senha_app(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    if not _usuario_pendente_troca_senha(request, banco):
        return RedirectResponse(url="/app/login", status_code=303)
    return _render_troca_senha(request)


async def processar_troca_senha_app(
    request: Request,
    senha_atual: str = Form(default=""),
    nova_senha: str = Form(default=""),
    confirmar_senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    banco: Session = Depends(obter_banco),
):
    if not validar_csrf(request, csrf_token):
        return _render_troca_senha(request, erro="Requisição inválida.", status_code=400)

    usuario = _usuario_pendente_troca_senha(request, banco)
    if not usuario:
        return RedirectResponse(url="/app/login", status_code=303)

    erro_validacao = _validar_nova_senha(senha_atual, nova_senha, confirmar_senha)
    if erro_validacao:
        return _render_troca_senha(request, erro=erro_validacao, status_code=400)

    if not verificar_senha(senha_atual, usuario.senha_hash):
        return _render_troca_senha(request, erro="Senha temporária inválida.", status_code=401)

    lembrar = bool(request.session.get(CHAVE_TROCA_SENHA_LEMBRAR, False))
    usuario.senha_hash = criar_hash_senha(nova_senha)
    usuario.senha_temporaria_ativa = False
    if hasattr(usuario, "registrar_login_sucesso"):
        usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
    banco.commit()

    _limpar_fluxo_troca_senha(request)

    token = criar_sessao(usuario.id, lembrar=lembrar)
    definir_sessao_portal(
        request.session,
        portal=PORTAL_INSPETOR,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=usuario_nome(usuario),
    )
    request.session[CHAVE_CSRF_INSPETOR] = secrets.token_urlsafe(32)

    logger.info("Troca obrigatória de senha concluída | usuario_id=%s", usuario.id)
    return RedirectResponse(url="/app/", status_code=303)


async def processar_login_app(
    request: Request,
    email: str = Form(default=""),
    senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    lembrar: bool = Form(default=False),
    banco: Session = Depends(obter_banco),
):
    ctx = contexto_base(request)
    email_normalizado = normalizar_email(email)

    if not email_normalizado or not senha:
        return templates.TemplateResponse(
            request,
            "login_app.html",
            {**ctx, "erro": "Preencha os dados."},
            status_code=400,
        )

    if not validar_csrf(request, csrf_token):
        return templates.TemplateResponse(
            request,
            "login_app.html",
            {**ctx, "erro": "Requisição inválida."},
            status_code=400,
        )

    usuario = banco.scalar(select(Usuario).where(Usuario.email == email_normalizado))

    senha_valida = False
    if usuario:
        try:
            senha_valida = verificar_senha(senha, usuario.senha_hash)
        except Exception:
            logger.warning("Falha ao verificar hash de senha | email=%s", email_normalizado)

    if not usuario or not senha_valida:
        if usuario and hasattr(usuario, "incrementar_tentativa_falha"):
            usuario.incrementar_tentativa_falha()
            banco.commit()

        return templates.TemplateResponse(
            request,
            "login_app.html",
            {**ctx, "erro": "Credenciais inválidas."},
            status_code=401,
        )

    if usuario.nivel_acesso not in NIVEIS_PERMITIDOS_APP:
        return templates.TemplateResponse(
            request,
            "login_app.html",
            {**ctx, "erro": "Acesso negado. Use o portal correto para sua função."},
            status_code=403,
        )

    if usuario_tem_bloqueio_ativo(usuario):
        return templates.TemplateResponse(
            request,
            "login_app.html",
            {**ctx, "erro": "Acesso bloqueado. Contate o suporte."},
            status_code=403,
        )

    token_anterior = obter_dados_sessao_portal(
        request.session,
        portal=PORTAL_INSPETOR,
    ).get("token")
    if token_anterior:
        encerrar_sessao(token_anterior)

    if bool(getattr(usuario, "senha_temporaria_ativa", False)):
        _iniciar_fluxo_troca_senha(request, usuario_id=usuario.id, lembrar=lembrar)
        return RedirectResponse(url="/app/trocar-senha", status_code=303)

    token = criar_sessao(usuario.id, lembrar=lembrar)
    definir_sessao_portal(
        request.session,
        portal=PORTAL_INSPETOR,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=usuario_nome(usuario),
    )
    request.session[CHAVE_CSRF_INSPETOR] = secrets.token_urlsafe(32)

    if hasattr(usuario, "registrar_login_sucesso"):
        usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)

    banco.commit()
    logger.info("Login inspetor | usuario_id=%s | email=%s", usuario.id, email_normalizado)

    return RedirectResponse(url="/app/", status_code=303)


async def logout_inspetor(
    request: Request,
    csrf_token: str = Form(default=""),
):
    if not validar_csrf(request, csrf_token):
        return RedirectResponse(url="/app/login", status_code=303)

    token = obter_dados_sessao_portal(request.session, portal=PORTAL_INSPETOR).get("token")
    encerrar_sessao(token)
    limpar_sessao_portal(request.session, portal=PORTAL_INSPETOR)
    request.session.pop(CHAVE_CSRF_INSPETOR, None)
    return RedirectResponse(url="/app/login", status_code=303)


async def pagina_inicial(
    request: Request,
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return RedirectResponse(url="/app/login", status_code=303)

    if usuario.nivel_acesso != NivelAcesso.INSPETOR.value:
        return redirecionar_por_nivel(usuario)

    estado_relatorio = estado_relatorio_sanitizado(request, banco, usuario)

    laudos_recentes = (
        banco.query(Laudo)
        .filter(
            Laudo.empresa_id == usuario.empresa_id,
            Laudo.usuario_id == usuario.id,
        )
        .order_by(Laudo.pinado.desc(), Laudo.criado_em.desc())
        .limit(20)
        .all()
    )

    limite = obter_limite_empresa(usuario, banco)
    laudos_mes_usados = contar_laudos_mes(banco, usuario.empresa_id)

    telefone_suporte = (getattr(configuracoes, "SUPORTE_WHATSAPP", "") if configuracoes else "") or PADRAO_SUPORTE_WHATSAPP

    ambiente_atual = (
        (getattr(configuracoes, "AMBIENTE", "") if configuracoes else "")
        or os.getenv("AMBIENTE", "")
    )

    return templates.TemplateResponse(
        request,
        "index.html",
        {
            **contexto_base(request),
            "usuario": usuario,
            "laudos_recentes": laudos_recentes,
            "laudos_mes_usados": laudos_mes_usados,
            "laudos_mes_limite": getattr(limite, "laudos_mes", None),
            "plano_upload_doc": getattr(limite, "upload_doc", False),
            "deep_research_disponivel": getattr(limite, "deep_research", False),
            "estado_relatorio": estado_relatorio,
            "suporte_whatsapp": telefone_suporte,
            "ambiente": ambiente_atual,
        },
    )


async def pagina_planos(
    request: Request,
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return RedirectResponse(url="/app/login", status_code=303)

    if usuario.nivel_acesso != NivelAcesso.INSPETOR.value:
        return redirecionar_por_nivel(usuario)

    limites = montar_limites_para_template(banco)

    return templates.TemplateResponse(
        request,
        "planos.html",
        {
            **contexto_base(request),
            "usuario": usuario,
            "limites": limites,
            "planos": PlanoEmpresa,
        },
    )


# ============================================================================
# NOTIFICAÇÕES SSE
# ============================================================================


async def sse_notificacoes_inspetor(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
):
    fila = await inspetor_notif_manager.conectar(usuario.id)

    async def gerador():
        try:
            yield evento_sse({"tipo": "conectado", "usuario_id": usuario.id})

            while True:
                if await request.is_disconnected():
                    break

                try:
                    msg = await asyncio.wait_for(
                        fila.get(),
                        timeout=TIMEOUT_KEEPALIVE_SSE_SEGUNDOS,
                    )
                    yield evento_sse(msg)
                except asyncio.TimeoutError:
                    yield evento_sse({"tipo": "heartbeat"})
        finally:
            inspetor_notif_manager.desconectar(usuario.id, fila)

    return StreamingResponse(
        gerador(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ============================================================================
# CHAT COM IA / WHISPER / STREAMING SSE
# ============================================================================


async def rota_chat(
    dados: DadosChat,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    validar_historico_total(dados.historico)

    mensagem_limpa = (dados.mensagem or "").strip()
    comando_rapido, argumento_comando_rapido = analisar_comando_rapido_chat(mensagem_limpa)
    comando_rapido_eh_mesa = comando_rapido == "enviar_mesa"
    mensagem_bruta_eh_mesa = mensagem_para_mesa(mensagem_limpa)
    dados_imagem_validos = validar_imagem_base64(dados.dados_imagem)
    texto_documento = (dados.texto_documento or "").strip()
    nome_documento = nome_documento_seguro(dados.nome_documento)

    if not mensagem_limpa and not dados_imagem_validos and not texto_documento:
        raise HTTPException(
            status_code=400,
            detail="Envie texto, imagem ou documento.",
        )

    if texto_documento:
        garantir_upload_documento_habilitado(usuario, banco)

    if dados.modo == MODO_DEEP:
        garantir_deep_research_habilitado(usuario, banco)

    estado_sessao = request.session.get("estado_relatorio", "sem_relatorio")
    laudo_sessao = laudo_id_sessao(request)
    laudo_id_requisitado = dados.laudo_id

    if estado_sessao == "relatorio_ativo":
        if laudo_id_requisitado and laudo_id_requisitado != laudo_sessao:
            raise HTTPException(status_code=403, detail="Use apenas o relatório ativo.")

        dados.laudo_id = laudo_sessao
    else:
        if not laudo_id_requisitado:
            garantir_limite_laudos(usuario, banco)

    laudo: Laudo | None = None
    if dados.laudo_id:
        laudo = obter_laudo_do_inspetor(banco, dados.laudo_id, usuario)

        if laudo.status_revisao == StatusRevisao.APROVADO.value:
            raise HTTPException(
                status_code=400,
                detail="Laudo aprovado não pode ser editado.",
            )

        if (
            laudo.status_revisao == StatusRevisao.AGUARDANDO.value
            and not (mensagem_bruta_eh_mesa or comando_rapido_eh_mesa)
        ):
            raise HTTPException(
                status_code=400,
                detail="Laudo aguardando avaliação não pode receber novas mensagens.",
            )

    if comando_rapido:
        if dados_imagem_validos or texto_documento:
            raise HTTPException(
                status_code=400,
                detail="Comandos rápidos não aceitam imagem ou documento.",
            )

        if comando_rapido == "enviar_mesa":
            if not laudo:
                raise HTTPException(
                    status_code=400,
                    detail="A conversa com a mesa avaliadora só é permitida após iniciar uma nova inspeção.",
                )
            if not argumento_comando_rapido:
                raise HTTPException(
                    status_code=400,
                    detail="Use /enviar_mesa seguido da mensagem para a mesa avaliadora.",
                )
            mensagem_limpa = f"@insp {argumento_comando_rapido}"
        else:
            if not laudo:
                raise HTTPException(
                    status_code=400,
                    detail="Esse comando exige um relatório ativo.",
                )

            texto_comando = montar_resposta_comando_rapido(
                banco=banco,
                laudo=laudo,
                comando=comando_rapido,
                argumento=argumento_comando_rapido,
            )
            registrar_comando_rapido_historico(
                banco=banco,
                laudo=laudo,
                usuario=usuario,
                comando=comando_rapido,
                argumento=argumento_comando_rapido,
                resposta=texto_comando,
            )
            banco.commit()

            request.session["laudo_ativo_id"] = laudo.id
            request.session["estado_relatorio"] = (
                "relatorio_ativo"
                if laudo.status_revisao == StatusRevisao.RASCUNHO.value
                else "sem_relatorio"
            )

            return JSONResponse(
                {
                    "texto": texto_comando,
                    "tipo": "comando_rapido",
                    "comando": f"/{comando_rapido}",
                    "laudo_id": laudo.id,
                }
            )

    if not laudo:
        laudo = Laudo(
            empresa_id=usuario.empresa_id,
            usuario_id=usuario.id,
            setor_industrial=dados.setor,
            tipo_template="padrao",
            codigo_hash=uuid.uuid4().hex,
            primeira_mensagem=obter_preview_primeira_mensagem(
                mensagem_limpa,
                nome_documento=nome_documento,
                tem_imagem=bool(dados_imagem_validos),
            ),
            modo_resposta=dados.modo,
            is_deep_research=(dados.modo == MODO_DEEP),
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add(laudo)

        try:
            banco.flush()
        except Exception:
            banco.rollback()
            logger.error("Falha ao criar laudo.", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Erro ao criar sessão de laudo.",
            )

    request.session["laudo_ativo_id"] = laudo.id
    request.session["estado_relatorio"] = "relatorio_ativo"

    headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }

    historico_dict = [msg.model_dump() for msg in dados.historico]

    eh_comando_finalizar, tipo_template_finalizacao = analisar_comando_finalizacao(
        mensagem_limpa,
        normalizar_tipo_template=normalizar_tipo_template,
    )

    eh_whisper_para_mesa = mensagem_para_mesa(mensagem_limpa)
    referencia_mensagem_id = None
    texto_exibicao = ""

    if eh_whisper_para_mesa:
        tipo_msg_usuario = TipoMensagem.HUMANO_INSP.value
        texto_exibicao = remover_mencao_mesa(mensagem_limpa)
        if not texto_exibicao:
            raise HTTPException(status_code=400, detail="Mensagem para a mesa está vazia.")
        referencia_mensagem_id = int(dados.referencia_mensagem_id or 0) or None
        texto_salvar = compor_texto_com_referencia(texto_exibicao, referencia_mensagem_id)
    elif eh_comando_finalizar:
        tipo_msg_usuario = TipoMensagem.USER.value
        texto_salvar = "*(Inspetor solicitou encerramento e geração do laudo)*"
        texto_exibicao = texto_salvar
    else:
        tipo_msg_usuario = TipoMensagem.USER.value
        texto_salvar = mensagem_limpa or nome_documento or "[imagem]"
        texto_exibicao = texto_salvar

    mensagem_usuario = MensagemLaudo(
        laudo_id=laudo.id,
        remetente_id=usuario.id,
        tipo=tipo_msg_usuario,
        conteudo=texto_salvar,
        custo_api_reais=Decimal("0.0000"),
    )
    banco.add(mensagem_usuario)

    laudo.atualizado_em = agora_utc()
    laudo.modo_resposta = dados.modo
    laudo.is_deep_research = dados.modo == MODO_DEEP

    if not laudo.primeira_mensagem:
        laudo.primeira_mensagem = obter_preview_primeira_mensagem(
            mensagem_limpa,
            nome_documento=nome_documento,
            tem_imagem=bool(dados_imagem_validos),
        )

    banco.commit()

    laudo_id_atual = laudo.id
    empresa_id_atual = usuario.empresa_id
    usuario_id_atual = usuario.id
    usuario_nome_atual = usuario_nome(usuario)

    if eh_whisper_para_mesa:

        async def gerador_humano():
            yield evento_sse({"laudo_id": laudo_id_atual})

            await notificar_mesa_whisper(
                empresa_id=empresa_id_atual,
                laudo_id=laudo_id_atual,
                inspetor_id=usuario_id_atual,
                inspetor_nome=usuario_nome_atual,
                preview=texto_exibicao,
            )

            yield evento_sse(
                {
                    "tipo": TipoMensagem.HUMANO_INSP.value,
                    "tipo_humano": TipoMensagem.HUMANO_INSP.value,
                    "texto": texto_exibicao,
                    "remetente": "inspetor",
                    "destinatario": "engenharia",
                    "laudo_id": laudo_id_atual,
                    "mensagem_id": mensagem_usuario.id,
                    "referencia_mensagem_id": referencia_mensagem_id,
                }
            )
            yield "data: [FIM]\n\n"

        return StreamingResponse(
            gerador_humano(),
            media_type="text/event-stream",
            headers=headers,
        )

    if eh_comando_finalizar:
        laudo.tipo_template = tipo_template_finalizacao
        laudo.atualizado_em = agora_utc()

        texto_resposta = "✅ **Sessão finalizada!** O laudo foi encaminhado para o engenheiro revisor."

        if tipo_template_finalizacao == "cbmgo":
            texto_resposta = "✅ **Relatório CBM-GO estruturado gerado!** As tabelas foram preenchidas."
            try:
                cliente_ia_ativo = obter_cliente_ia_ativo()
                dados_json = await cliente_ia_ativo.gerar_json_estruturado(
                    schema_pydantic=RelatorioCBMGO,
                    historico=historico_dict,
                    dados_imagem=dados_imagem_validos,
                    texto_documento=texto_documento,
                )
                laudo.dados_formulario = dados_json
            except Exception:
                logger.error(
                    "Falha ao gerar JSON estruturado CBM-GO.",
                    exc_info=True,
                )
                texto_resposta = "❌ O laudo foi enviado ao revisor, mas houve falha ao estruturar as tabelas CBM-GO."

        garantir_gate_qualidade_laudo(banco, laudo)

        laudo.status_revisao = StatusRevisao.AGUARDANDO.value
        banco.add(
            MensagemLaudo(
                laudo_id=laudo.id,
                tipo=TipoMensagem.IA.value,
                conteudo=texto_resposta,
                custo_api_reais=Decimal("0.0000"),
            )
        )

        request.session.pop("laudo_ativo_id", None)
        request.session["estado_relatorio"] = "sem_relatorio"
        banco.commit()

        async def gerador_envio():
            yield evento_sse({"laudo_id": laudo.id})
            yield evento_sse({"texto": texto_resposta})
            yield "data: [FIM]\n\n"

        return StreamingResponse(
            gerador_envio(),
            media_type="text/event-stream",
            headers=headers,
        )

    eh_deep = dados.modo == MODO_DEEP
    cliente_ia_ativo = obter_cliente_ia_ativo()

    async def gerador_async():
        loop = asyncio.get_running_loop()
        fila: asyncio.Queue[Optional[str]] = asyncio.Queue()
        resposta_completa: list[str] = []
        metadados_custo: dict[str, Any] = {}
        citacoes_deep: list[dict[str, Any]] = []
        confianca_ia_payload: dict[str, Any] = {}

        def executar_stream() -> None:
            try:
                gerador_stream = cliente_ia_ativo.gerar_resposta_stream(
                    mensagem_limpa,
                    dados_imagem_validos or None,
                    dados.setor,
                    empresa_id=empresa_id_atual,
                    historico=historico_dict,
                    modo=dados.modo,
                    texto_documento=texto_documento or None,
                    nome_documento=nome_documento or None,
                )

                for pedaco in gerador_stream:
                    asyncio.run_coroutine_threadsafe(fila.put(pedaco), loop)
            except Exception:
                logger.error("Erro no stream da IA.", exc_info=True)
                asyncio.run_coroutine_threadsafe(
                    fila.put("\n\n**[Erro]** Falha interna."),
                    loop,
                )
            finally:
                asyncio.run_coroutine_threadsafe(fila.put(None), loop)

        yield evento_sse({"laudo_id": laudo_id_atual})
        future = loop.run_in_executor(executor_stream, executar_stream)

        try:
            while True:
                try:
                    pedaco = await asyncio.wait_for(
                        fila.get(),
                        timeout=TIMEOUT_FILA_STREAM_SEGUNDOS,
                    )
                except asyncio.TimeoutError:
                    yield evento_sse({"texto": "\n\n**[Timeout]** A IA demorou muito."})
                    break

                if pedaco is None:
                    break

                if pedaco.startswith(PREFIXO_METADATA):
                    try:
                        metadados_custo = json.loads(pedaco[len(PREFIXO_METADATA) :])
                    except Exception:
                        metadados_custo = {}
                    continue

                if pedaco.startswith(PREFIXO_CITACOES):
                    try:
                        citacoes_deep = json.loads(pedaco[len(PREFIXO_CITACOES) :])
                        if not isinstance(citacoes_deep, list):
                            citacoes_deep = []
                    except Exception:
                        citacoes_deep = []

                    if citacoes_deep:
                        yield evento_sse({"citacoes": citacoes_deep})
                    continue

                if pedaco.startswith(PREFIXO_MODO_HUMANO):
                    continue

                resposta_completa.append(pedaco)
                yield evento_sse({"texto": pedaco})

            texto_final_stream = "".join(resposta_completa)
            if texto_final_stream.strip():
                confianca_ia_payload = analisar_confianca_resposta_ia(texto_final_stream)
                if confianca_ia_payload:
                    yield evento_sse({"confianca_ia": confianca_ia_payload})

            yield "data: [FIM]\n\n"
        except asyncio.CancelledError:
            future.cancel()
            raise
        finally:
            await salvar_mensagem_ia(
                laudo_id=laudo_id_atual,
                usuario_id=usuario_id_atual,
                empresa_id=empresa_id_atual,
                texto_final="".join(resposta_completa),
                metadados=metadados_custo,
                is_deep=eh_deep,
                citacoes=citacoes_deep if eh_deep else None,
                confianca_ia=confianca_ia_payload or None,
            )

    return StreamingResponse(
        gerador_async(),
        media_type="text/event-stream",
        headers=headers,
    )


# ============================================================================
# PERSISTÊNCIA PÓS-STREAM
# ============================================================================


async def salvar_mensagem_ia(
    laudo_id: int,
    usuario_id: int,
    empresa_id: int,
    texto_final: str,
    metadados: Optional[dict[str, Any]],
    is_deep: bool = False,
    citacoes: Optional[list[dict[str, Any]]] = None,
    confianca_ia: Optional[dict[str, Any]] = None,
) -> None:
    if not (texto_final or "").strip():
        return

    with SessaoLocal() as banco:
        try:
            custo_reais = Decimal("0")

            if metadados:
                try:
                    custo_reais = Decimal(str(metadados.get("custo_reais", "0")))
                except (InvalidOperation, TypeError, ValueError):
                    custo_reais = Decimal("0")

            banco.add(
                MensagemLaudo(
                    laudo_id=laudo_id,
                    tipo=TipoMensagem.IA.value,
                    conteudo=texto_final,
                    custo_api_reais=custo_reais,
                )
            )

            laudo = banco.query(Laudo).filter(Laudo.id == laudo_id).first()
            if laudo:
                payload_confianca = normalizar_payload_confianca_ia(confianca_ia or {})
                if not payload_confianca:
                    payload_confianca = analisar_confianca_resposta_ia(texto_final)

                laudo.parecer_ia = texto_final[:LIMITE_PARECER]
                laudo.confianca_ia_json = payload_confianca or None
                laudo.custo_api_reais = (laudo.custo_api_reais or Decimal("0")) + custo_reais
                laudo.atualizado_em = agora_utc()
                _registrar_revisao_laudo(
                    banco,
                    laudo,
                    conteudo=texto_final,
                    origem="ia",
                    confianca=payload_confianca,
                )

                if is_deep and citacoes:
                    banco.query(CitacaoLaudo).filter(CitacaoLaudo.laudo_id == laudo_id).delete(synchronize_session=False)

                    for citacao in citacoes:
                        referencia = str(citacao.get("referencia", "") or "")[:300].strip()
                        trecho = str(citacao.get("trecho", "") or "")[:300].strip() or None
                        url = str(citacao.get("url", "") or "")[:500].strip() or None

                        try:
                            ordem = int(citacao.get("ordem", 0) or 0)
                        except (TypeError, ValueError):
                            ordem = 0

                        if not referencia:
                            continue

                        banco.add(
                            CitacaoLaudo(
                                laudo_id=laudo_id,
                                referencia=referencia,
                                trecho=trecho,
                                url=url,
                                ordem=max(0, ordem),
                            )
                        )

            empresa = banco.query(Empresa).filter(Empresa.id == empresa_id).first()
            if empresa:
                if custo_reais > 0:
                    empresa.custo_gerado_reais = (empresa.custo_gerado_reais or Decimal("0")) + custo_reais

                empresa.mensagens_processadas = (empresa.mensagens_processadas or 0) + 1

            banco.commit()

        except Exception:
            logger.error(
                "Erro ao salvar mensagem IA | laudo_id=%s | usuario_id=%s",
                laudo_id,
                usuario_id,
                exc_info=True,
            )
            banco.rollback()


# ============================================================================
# APIs CRUD / AUXILIARES
# ============================================================================


async def obter_mensagens_laudo(
    laudo_id: int,
    cursor: int | None = Query(default=None, gt=0),
    limite: int = Query(default=80, ge=20, le=200),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    citacoes_laudo = banco.query(CitacaoLaudo).filter(CitacaoLaudo.laudo_id == laudo_id).order_by(CitacaoLaudo.ordem.asc()).all()

    citacoes_list = [
        {
            "norma": cit.referencia,
            "trecho": cit.trecho or "",
            "artigo": "",
            "url": cit.url or "",
        }
        for cit in citacoes_laudo
    ]

    consulta_mensagens = banco.query(MensagemLaudo).filter(
        MensagemLaudo.laudo_id == laudo_id,
        ~MensagemLaudo.tipo.in_(
            (
                TipoMensagem.HUMANO_INSP.value,
                TipoMensagem.HUMANO_ENG.value,
            )
        ),
    )
    if cursor:
        consulta_mensagens = consulta_mensagens.filter(MensagemLaudo.id < cursor)

    mensagens_desc = (
        consulta_mensagens.order_by(MensagemLaudo.id.desc()).limit(limite + 1).all()
    )
    tem_mais = len(mensagens_desc) > limite
    mensagens_pagina = list(reversed(mensagens_desc[:limite]))
    cursor_proximo = mensagens_pagina[0].id if tem_mais and mensagens_pagina else None

    if not mensagens_pagina and not cursor:
        historico: list[dict[str, Any]] = []

        if laudo.primeira_mensagem:
            historico.append(
                {
                    "id": None,
                    "papel": "usuario",
                    "texto": laudo.primeira_mensagem,
                    "tipo": TipoMensagem.USER.value,
                }
            )

        if laudo.parecer_ia:
            historico.append(
                {
                    "id": None,
                    "papel": "assistente",
                    "texto": laudo.parecer_ia,
                    "modo": laudo.modo_resposta or MODO_DETALHADO,
                    "tipo": TipoMensagem.IA.value,
                    "citacoes": citacoes_list,
                    "confianca_ia": normalizar_payload_confianca_ia(getattr(laudo, "confianca_ia_json", None) or {}),
                }
            )

        return {
            "itens": historico,
            "cursor_proximo": None,
            "tem_mais": False,
            "laudo_id": laudo_id,
            "limite": limite,
        }

    if not mensagens_pagina:
        return {
            "itens": [],
            "cursor_proximo": None,
            "tem_mais": False,
            "laudo_id": laudo_id,
            "limite": limite,
        }

    ultima_ia_id = (
        banco.query(MensagemLaudo.id)
        .filter(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo == TipoMensagem.IA.value,
        )
        .order_by(MensagemLaudo.id.desc())
        .limit(1)
        .scalar()
    )

    resultado: list[dict[str, Any]] = []
    for mensagem in mensagens_pagina:
        entrada = serializar_historico_mensagem(
            mensagem,
            laudo.modo_resposta or MODO_DETALHADO,
            citacoes_list if (mensagem.id == ultima_ia_id and citacoes_list) else None,
            normalizar_payload_confianca_ia(getattr(laudo, "confianca_ia_json", None) or {})
            if mensagem.id == ultima_ia_id and mensagem.tipo == TipoMensagem.IA.value
            else None,
        )
        resultado.append(entrada)

    return {
        "itens": resultado,
        "cursor_proximo": int(cursor_proximo) if cursor_proximo else None,
        "tem_mais": tem_mais,
        "laudo_id": laudo_id,
        "limite": limite,
    }


async def listar_mensagens_mesa_laudo(
    laudo_id: int,
    cursor: int | None = Query(default=None, gt=0),
    limite: int = Query(default=40, ge=10, le=120),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    consulta = banco.query(MensagemLaudo).filter(
        MensagemLaudo.laudo_id == laudo_id,
        MensagemLaudo.tipo.in_(
            (
                TipoMensagem.HUMANO_INSP.value,
                TipoMensagem.HUMANO_ENG.value,
            )
        ),
    )
    if cursor:
        consulta = consulta.filter(MensagemLaudo.id < cursor)

    mensagens_desc = consulta.order_by(MensagemLaudo.id.desc()).limit(limite + 1).all()
    tem_mais = len(mensagens_desc) > limite
    mensagens_pagina = list(reversed(mensagens_desc[:limite]))
    cursor_proximo = mensagens_pagina[0].id if tem_mais and mensagens_pagina else None

    return resposta_json_ok(
        {
            "laudo_id": laudo_id,
            "itens": [serializar_mensagem_mesa(item) for item in mensagens_pagina],
            "cursor_proximo": int(cursor_proximo) if cursor_proximo else None,
            "tem_mais": tem_mais,
        }
    )


async def enviar_mensagem_mesa_laudo(
    laudo_id: int,
    dados: DadosMesaMensagem,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    texto_limpo = (dados.texto or "").strip()
    if not texto_limpo:
        raise HTTPException(status_code=400, detail="Mensagem para a mesa está vazia.")

    referencia_mensagem_id = int(dados.referencia_mensagem_id or 0) or None
    if referencia_mensagem_id:
        referencia_existe = (
            banco.query(MensagemLaudo.id)
            .filter(
                MensagemLaudo.laudo_id == laudo.id,
                MensagemLaudo.id == referencia_mensagem_id,
            )
            .first()
        )
        if not referencia_existe:
            raise HTTPException(status_code=404, detail="Mensagem de referência não encontrada.")

    mensagem = MensagemLaudo(
        laudo_id=laudo.id,
        remetente_id=usuario.id,
        tipo=TipoMensagem.HUMANO_INSP.value,
        conteudo=compor_texto_com_referencia(texto_limpo, referencia_mensagem_id),
        custo_api_reais=Decimal("0.0000"),
    )
    banco.add(mensagem)
    laudo.atualizado_em = agora_utc()
    banco.commit()

    await notificar_mesa_whisper(
        empresa_id=usuario.empresa_id,
        laudo_id=laudo.id,
        inspetor_id=usuario.id,
        inspetor_nome=usuario_nome(usuario),
        preview=texto_limpo,
    )

    payload = serializar_mensagem_mesa(mensagem)
    return resposta_json_ok({"laudo_id": laudo.id, "mensagem": payload}, status_code=201)


async def listar_revisoes_laudo(
    laudo_id: int,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    revisoes = (
        banco.query(LaudoRevisao)
        .filter(LaudoRevisao.laudo_id == laudo_id)
        .order_by(LaudoRevisao.numero_versao.asc(), LaudoRevisao.id.asc())
        .all()
    )

    ultima = revisoes[-1] if revisoes else None
    return resposta_json_ok(
        {
            "laudo_id": laudo_id,
            "total_revisoes": len(revisoes),
            "ultima_versao": int(ultima.numero_versao) if ultima else None,
            "revisoes": [_serializar_revisao_laudo(item) for item in revisoes],
        }
    )


async def obter_diff_revisoes_laudo(
    laudo_id: int,
    base: Optional[int] = None,
    comparar: Optional[int] = None,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    revisoes_desc = (
        banco.query(LaudoRevisao)
        .filter(LaudoRevisao.laudo_id == laudo_id)
        .order_by(LaudoRevisao.numero_versao.desc(), LaudoRevisao.id.desc())
        .all()
    )
    if len(revisoes_desc) < 2:
        raise HTTPException(
            status_code=400,
            detail="É necessário ao menos duas versões para comparar o diff.",
        )

    if base is None and comparar is None:
        revisar_comparar = revisoes_desc[0]
        revisao_base = revisoes_desc[1]
    else:
        versao_base = int(base or 0)
        versao_comparar = int(comparar or 0)
        if versao_base <= 0 or versao_comparar <= 0:
            raise HTTPException(status_code=400, detail="Informe versões positivas para base e comparar.")
        if versao_base == versao_comparar:
            raise HTTPException(status_code=400, detail="As versões base e comparar precisam ser diferentes.")

        revisao_base = _obter_revisao_por_versao(banco, laudo_id, versao_base)
        revisar_comparar = _obter_revisao_por_versao(banco, laudo_id, versao_comparar)
        if not revisao_base or not revisar_comparar:
            raise HTTPException(status_code=404, detail="Versão de revisão não encontrada.")

    diff_texto = _gerar_diff_revisoes(revisao_base.conteudo or "", revisar_comparar.conteudo or "")
    resumo_diff = _resumo_diff_revisoes(diff_texto)

    return resposta_json_ok(
        {
            "laudo_id": laudo_id,
            "base": _serializar_revisao_laudo(revisao_base),
            "comparar": _serializar_revisao_laudo(revisar_comparar),
            "resumo_diff": resumo_diff,
            "diff_unificado": diff_texto,
        }
    )


async def obter_pendencias_laudo(
    laudo_id: int,
    filtro: str = "abertas",
    pagina: int = 1,
    tamanho: int = 25,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    filtro_normalizado = normalizar_filtro_pendencias(filtro)
    pagina_segura, tamanho_seguro = normalizar_paginacao_pendencias(pagina, tamanho)

    pendencias, total, abertas, total_filtrado = listar_pendencias_mesa_laudo(
        banco,
        laudo_id=laudo_id,
        filtro=filtro_normalizado,
        pagina=pagina_segura,
        tamanho=tamanho_seguro,
    )
    resolvidas = max(total - abertas, 0)
    total_exibido = (pagina_segura - 1) * tamanho_seguro + len(pendencias)
    tem_mais = total_exibido < total_filtrado

    return resposta_json_ok(
        {
            "laudo_id": laudo_id,
            "filtro": filtro_normalizado,
            "pagina": pagina_segura,
            "tamanho": tamanho_seguro,
            "abertas": abertas,
            "resolvidas": resolvidas,
            "total": total,
            "total_filtrado": total_filtrado,
            "tem_mais": tem_mais,
            "pendencias": [serializar_pendencia_mesa(item) for item in pendencias],
        }
    )


async def marcar_pendencias_laudo_como_lidas(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    resolucao_em = agora_utc()

    marcadas = (
        banco.query(MensagemLaudo)
        .filter(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
            MensagemLaudo.lida.is_(False),
        )
        .update(
            {
                "lida": True,
                "resolvida_por_id": usuario.id,
                "resolvida_em": resolucao_em,
            },
            synchronize_session=False,
        )
    )
    banco.commit()

    return resposta_json_ok({"ok": True, "laudo_id": laudo_id, "marcadas": int(marcadas)})


async def atualizar_pendencia_laudo(
    laudo_id: int,
    mensagem_id: int,
    dados: DadosPendencia,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    mensagem = (
        banco.query(MensagemLaudo)
        .filter(
            MensagemLaudo.id == mensagem_id,
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
        )
        .first()
    )
    if not mensagem:
        raise HTTPException(status_code=404, detail="Pendência não encontrada.")

    marcando_como_lida = bool(dados.lida)
    mensagem.lida = marcando_como_lida

    if marcando_como_lida:
        mensagem.resolvida_por_id = usuario.id
        mensagem.resolvida_em = agora_utc()
    else:
        mensagem.resolvida_por_id = None
        mensagem.resolvida_em = None

    banco.commit()
    banco.refresh(mensagem)

    resolvedor_nome = ""
    if mensagem.resolvida_por_id:
        resolvedor_nome = (
            getattr(mensagem.resolvida_por, "nome", None)
            or getattr(mensagem.resolvida_por, "nome_completo", None)
            or f"Usuário #{mensagem.resolvida_por_id}"
        )

    return resposta_json_ok(
        {
            "ok": True,
            "laudo_id": laudo_id,
            "mensagem_id": mensagem.id,
            "lida": bool(mensagem.lida),
            "resolvida_por_id": mensagem.resolvida_por_id,
            "resolvida_por_nome": resolvedor_nome,
            "resolvida_em": mensagem.resolvida_em.isoformat() if mensagem.resolvida_em else "",
        }
    )


async def exportar_pendencias_laudo_pdf(
    laudo_id: int,
    filtro: str = "abertas",
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    filtro_normalizado = normalizar_filtro_pendencias(filtro)

    pendencias_filtradas, total, abertas, _total_filtrado = listar_pendencias_mesa_laudo(
        banco,
        laudo_id=laudo_id,
        filtro=filtro_normalizado,
        pagina=1,
        tamanho=400,
    )
    resolvidas = max(total - abertas, 0)
    pendencias_payload = [serializar_pendencia_mesa(item) for item in pendencias_filtradas]

    nome_arquivo = f"Pendencias_Mesa_{laudo_id}_{uuid.uuid4().hex[:12]}.pdf"
    caminho_pdf = os.path.join(tempfile.gettempdir(), nome_arquivo)

    nome_empresa = ""
    if usuario.empresa:
        nome_empresa = (
            getattr(usuario.empresa, "nome_fantasia", None)
            or getattr(usuario.empresa, "razao_social", None)
            or ""
        )
    assinatura_mesa = obter_assinatura_mesa_para_pdf(
        banco,
        laudo_id=laudo_id,
        empresa_id=usuario.empresa_id,
    )

    try:
        GeradorLaudos.gerar_pdf_pendencias_mesa(
            caminho_saida=caminho_pdf,
            laudo_id=laudo_id,
            filtro=filtro_normalizado,
            empresa=nome_empresa or f"Empresa #{usuario.empresa_id}",
            inspetor=usuario_nome(usuario),
            data_geracao=agora_utc().astimezone().strftime("%d/%m/%Y %H:%M"),
            total=total,
            abertas=abertas,
            resolvidas=resolvidas,
            pendencias=pendencias_payload,
            engenheiro_nome=assinatura_mesa["nome"],
            engenheiro_cargo=assinatura_mesa["cargo"],
            engenheiro_crea=assinatura_mesa["crea"],
            carimbo_texto=assinatura_mesa["carimbo"],
        )

        return FileResponse(
            path=caminho_pdf,
            filename=f"pendencias_laudo_{laudo_id}_{filtro_normalizado}.pdf",
            media_type="application/pdf",
            background=BackgroundTask(safe_remove_file, caminho_pdf),
        )
    except Exception:
        logger.error("Falha ao gerar PDF de pendencias.", exc_info=True)
        safe_remove_file(caminho_pdf)
        return JSONResponse(
            status_code=500,
            content={"erro": "Falha ao exportar o PDF de pendencias."},
        )


async def rota_pdf(
    request: Request,
    dados: DadosPDF,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    nome_arquivo = f"Laudo_WF_{uuid.uuid4().hex[:12]}.pdf"
    caminho_pdf = os.path.join(tempfile.gettempdir(), nome_arquivo)

    laudo_id_candidato = dados.laudo_id or laudo_id_sessao(request)
    laudo: Laudo | None = None
    if laudo_id_candidato:
        laudo = obter_laudo_do_inspetor(banco, int(laudo_id_candidato), usuario)

    template_ativo: TemplateLaudo | None = None
    if laudo and isinstance(laudo.dados_formulario, dict) and laudo.dados_formulario:
        template_ativo = selecionar_template_ativo_para_tipo(
            banco,
            empresa_id=usuario.empresa_id,
            tipo_template=str(getattr(laudo, "tipo_template", "")),
        )

    try:
        if template_ativo:
            try:
                pdf_template = gerar_preview_pdf_template(
                    caminho_pdf_base=template_ativo.arquivo_pdf_base,
                    mapeamento_campos=template_ativo.mapeamento_campos_json or {},
                    dados_formulario=laudo.dados_formulario or {},
                )
                with open(caminho_pdf, "wb") as arquivo_saida:
                    arquivo_saida.write(pdf_template)
                return FileResponse(
                    path=caminho_pdf,
                    filename=f"Laudo_{template_ativo.codigo_template}_v{template_ativo.versao}.pdf",
                    media_type="application/pdf",
                    background=BackgroundTask(safe_remove_file, caminho_pdf),
                )
            except Exception:
                logger.warning(
                    "Falha ao gerar PDF pelo template ativo. Aplicando fallback legacy. "
                    "| empresa_id=%s | usuario_id=%s | laudo_id=%s | template_id=%s",
                    usuario.empresa_id,
                    usuario.id,
                    laudo.id if laudo else None,
                    template_ativo.id,
                    exc_info=True,
                )

        GeradorLaudos.gerar_pdf_inspecao(
            dados=dados.model_dump(),
            caminho_saida=caminho_pdf,
            empresa_id=usuario.empresa_id,
            usuario_id=usuario.id,
        )

        return FileResponse(
            path=caminho_pdf,
            filename="Laudo_ART_WF.pdf",
            media_type="application/pdf",
            background=BackgroundTask(safe_remove_file, caminho_pdf),
        )
    except Exception:
        logger.error("Falha ao gerar PDF.", exc_info=True)
        safe_remove_file(caminho_pdf)
        return JSONResponse(
            status_code=500,
            content={"erro": "Falha ao gerar o PDF."},
        )


async def rota_upload_doc(
    request: Request,
    arquivo: UploadFile = File(...),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    if not usuario.empresa:
        raise HTTPException(status_code=403, detail="Empresa não configurada.")

    garantir_upload_documento_habilitado(usuario, banco)

    tipo = (arquivo.content_type or "").strip().lower()
    if tipo not in MIME_DOC_PERMITIDOS:
        raise HTTPException(status_code=415, detail="Use PDF ou DOCX.")

    if tipo == "application/pdf" and not TEM_PYPDF:
        raise HTTPException(status_code=501, detail="Leitura de PDF indisponível.")

    if tipo != "application/pdf" and not TEM_DOCX:
        raise HTTPException(status_code=501, detail="Leitura de DOCX indisponível.")

    conteudo = await arquivo.read()
    if len(conteudo) > LIMITE_DOC_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo muito grande.")

    try:
        if tipo == "application/pdf":
            leitor = leitor_pdf.PdfReader(io.BytesIO(conteudo))
            texto = "\n".join((pagina.extract_text() or "") for pagina in leitor.pages)
        else:
            documento = leitor_docx.Document(io.BytesIO(conteudo))
            texto = "\n".join(paragrafo.text for paragrafo in documento.paragraphs)
    except Exception:
        raise HTTPException(status_code=422, detail="Não foi possível extrair texto.")

    texto_bruto = (texto or "").strip()
    if not texto_bruto:
        raise HTTPException(status_code=422, detail="Documento sem texto extraível.")

    texto_truncado = texto_bruto[:LIMITE_DOC_CHARS]
    nome_seguro = nome_documento_seguro(arquivo.filename or "documento")

    return resposta_json_ok(
        {
            "texto": texto_truncado,
            "chars": len(texto_truncado),
            "nome": nome_seguro,
            "truncado": len(texto_bruto) > LIMITE_DOC_CHARS,
        }
    )


async def rota_pin_laudo(
    laudo_id: int,
    request: Request,
    dados: DadosPin,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    laudo.pinado = dados.pinado
    laudo.pinado_em = agora_utc() if dados.pinado else None
    laudo.atualizado_em = agora_utc()
    banco.commit()

    return resposta_json_ok(
        {
            "pinado": laudo.pinado,
            "pinado_em": laudo.pinado_em.isoformat() if laudo.pinado_em else None,
        }
    )


async def rota_deletar_laudo(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    if laudo.status_revisao in (
        StatusRevisao.AGUARDANDO.value,
        StatusRevisao.APROVADO.value,
    ):
        raise HTTPException(
            status_code=400,
            detail="Esse laudo não pode ser excluído no estado atual.",
        )

    if laudo_id_sessao(request) == laudo_id:
        request.session.pop("laudo_ativo_id", None)
        request.session["estado_relatorio"] = "sem_relatorio"

    banco.delete(laudo)
    banco.commit()

    return resposta_json_ok({"ok": True})


async def rota_feedback(
    request: Request,
    dados: DadosFeedback,
    usuario: Usuario = Depends(exigir_inspetor),
):
    exigir_csrf(request)

    logger.info(
        "Feedback recebido | tipo=%s | usuario_id=%s | trecho='%.80s'",
        dados.tipo,
        usuario.id,
        dados.trecho,
    )

    return resposta_json_ok({"ok": True})
