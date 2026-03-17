# ==========================================
# TARIEL.IA — ROTAS_REVISOR.PY
# Responsabilidade: fachada compatível do domínio Revisor/Mesa.
# ==========================================

from __future__ import annotations

from app.domains.revisor.auth_portal import (
    logout_revisor,
    processar_login_revisor,
    processar_troca_senha_revisor,
    tela_login_revisor,
    tela_troca_senha_revisor,
)
from app.domains.revisor.base import (
    DadosPendenciaMesa,
    DadosRespostaChat,
    DadosWhisper,
    RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR,
    roteador_revisor,
)
from app.domains.revisor.mesa_api import (
    atualizar_pendencia_mesa_revisor,
    avaliar_laudo,
    baixar_anexo_mesa_revisor,
    exportar_pacote_mesa_laudo_pdf,
    marcar_whispers_lidos,
    obter_historico_chat_revisor,
    obter_laudo_completo,
    obter_pacote_mesa_laudo,
    responder_chat_campo,
    responder_chat_campo_com_anexo,
    whisper_responder,
)
from app.domains.revisor.panel import painel_revisor
from app.domains.revisor.realtime import ConnectionManager, manager
from app.domains.revisor.ws import _usuario_ws_da_sessao, websocket_whispers
from app.shared.database import SessaoLocal

__all__ = [
    "ConnectionManager",
    "DadosPendenciaMesa",
    "DadosRespostaChat",
    "DadosWhisper",
    "RESPOSTA_LAUDO_NAO_ENCONTRADO_REVISOR",
    "SessaoLocal",
    "_usuario_ws_da_sessao",
    "atualizar_pendencia_mesa_revisor",
    "avaliar_laudo",
    "baixar_anexo_mesa_revisor",
    "exportar_pacote_mesa_laudo_pdf",
    "logout_revisor",
    "manager",
    "marcar_whispers_lidos",
    "obter_historico_chat_revisor",
    "obter_laudo_completo",
    "obter_pacote_mesa_laudo",
    "painel_revisor",
    "processar_login_revisor",
    "processar_troca_senha_revisor",
    "responder_chat_campo",
    "responder_chat_campo_com_anexo",
    "roteador_revisor",
    "tela_login_revisor",
    "tela_troca_senha_revisor",
    "websocket_whispers",
    "whisper_responder",
]
