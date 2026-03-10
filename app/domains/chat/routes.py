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

import io  # noqa: F401
import tempfile  # noqa: F401
from decimal import Decimal, InvalidOperation  # noqa: F401
from typing import Any  # noqa: F401

from fastapi import (
    APIRouter,
    File,  # noqa: F401
    HTTPException,  # noqa: F401
    Query,  # noqa: F401
    UploadFile,  # noqa: F401
)
from fastapi.responses import (
    FileResponse,  # noqa: F401
    JSONResponse,  # noqa: F401
    StreamingResponse,  # noqa: F401
)
from starlette.background import BackgroundTask  # noqa: F401

from app.shared.database import (
    CitacaoLaudo,  # noqa: F401
    Empresa,  # noqa: F401
    SessaoLocal,  # noqa: F401
)
from app.shared.security import (
    PORTAL_INSPETOR,  # noqa: F401
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
from app.domains.chat.app_context import (
    PADRAO_SUPORTE_WHATSAPP,  # noqa: F401
    _settings,  # noqa: F401
    configuracoes,  # noqa: F401
    logger,  # noqa: F401
    templates,  # noqa: F401
)
from app.domains.chat.chat_runtime import (
    LIMITE_DOC_BYTES,  # noqa: F401
    LIMITE_DOC_CHARS,  # noqa: F401
    LIMITE_FEEDBACK,  # noqa: F401
    LIMITE_HISTORICO,  # noqa: F401
    LIMITE_MSG_CHARS,  # noqa: F401
    LIMITE_PARECER,  # noqa: F401
    MIME_DOC_PERMITIDOS,  # noqa: F401
    MODO_CURTO,  # noqa: F401
    MODO_DEEP,  # noqa: F401
    MODO_DETALHADO,  # noqa: F401
    PREFIXO_CITACOES,  # noqa: F401
    PREFIXO_METADATA,  # noqa: F401
    PREFIXO_MODO_HUMANO,  # noqa: F401
    TEM_DOCX,  # noqa: F401
    TEM_PYPDF,  # noqa: F401
    TIMEOUT_FILA_STREAM_SEGUNDOS,  # noqa: F401
    TIMEOUT_KEEPALIVE_SSE_SEGUNDOS,  # noqa: F401
    executor_stream,  # noqa: F401
    leitor_docx,  # noqa: F401
    leitor_pdf,  # noqa: F401
)
from app.domains.chat.ia_runtime import (
    _erro_cliente_ia_boot as _erro_cliente_ia_boot_padrao,
    cliente_ia as cliente_ia_padrao,
    obter_cliente_ia_ativo as obter_cliente_ia_runtime,
)
from app.domains.chat.notifications import (
    GerenciadorSSEUsuario,  # noqa: F401
    inspetor_notif_manager,  # noqa: F401
)
from app.domains.chat.core_helpers import (
    agora_utc,  # noqa: F401
    evento_sse,  # noqa: F401
    json_seguro,  # noqa: F401
    obter_preview_primeira_mensagem,  # noqa: F401
    resposta_json_ok,  # noqa: F401
)
from app.domains.chat.laudo_access_helpers import (
    obter_laudo_do_inspetor,  # noqa: F401
    obter_laudo_empresa,  # noqa: F401
)
from app.domains.chat.auth_helpers import (
    CHAVE_TROCA_SENHA_LEMBRAR,  # noqa: F401
    CHAVE_TROCA_SENHA_PORTAL,  # noqa: F401
    CHAVE_TROCA_SENHA_UID,  # noqa: F401
    NIVEIS_PERMITIDOS_APP,  # noqa: F401
    PORTAL_TROCA_SENHA_INSPETOR,  # noqa: F401
    _iniciar_fluxo_troca_senha,  # noqa: F401
    _limpar_fluxo_troca_senha,  # noqa: F401
    _render_troca_senha,  # noqa: F401
    _usuario_pendente_troca_senha,  # noqa: F401
    _validar_nova_senha,  # noqa: F401
    redirecionar_por_nivel,  # noqa: F401
    usuario_nome,  # noqa: F401
)
from app.domains.chat.limits_helpers import (
    contar_laudos_mes,  # noqa: F401
    garantir_deep_research_habilitado,  # noqa: F401
    garantir_limite_laudos,  # noqa: F401
    garantir_upload_documento_habilitado,  # noqa: F401
    obter_limite_empresa,  # noqa: F401
)
from app.domains.chat.template_helpers import (
    montar_limites_para_template,  # noqa: F401
    selecionar_template_ativo_para_tipo,  # noqa: F401
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

roteador_inspetor = APIRouter()

cliente_ia: ClienteIA | None = cliente_ia_padrao
_erro_cliente_ia_boot: str | None = _erro_cliente_ia_boot_padrao

# ============================================================================
# HELPERS GERAIS (compat layer)
# ============================================================================


def obter_cliente_ia_ativo() -> ClienteIA:
    return obter_cliente_ia_runtime(
        cliente=cliente_ia,
        erro_boot=_erro_cliente_ia_boot,
    )


# ============================================================================
# APIs CRUD / AUXILIARES
# ============================================================================
