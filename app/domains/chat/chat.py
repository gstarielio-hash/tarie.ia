"""Rotas de chat IA (inspetor)."""

from fastapi.routing import APIRouter

from app.domains.chat.routes import (
    obter_mensagens_laudo,
    rota_chat,
    rota_feedback,
    rota_pdf,
    rota_upload_doc,
    sse_notificacoes_inspetor,
)

chat_api = rota_chat
listar_mensagens_laudo = obter_mensagens_laudo
upload_documento = rota_upload_doc
gerar_pdf = rota_pdf
registrar_feedback = rota_feedback

roteador_chat = APIRouter()

roteador_chat.add_api_route(
    "/api/notificacoes/sse",
    sse_notificacoes_inspetor,
    methods=["GET"],
)
roteador_chat.add_api_route(
    "/api/chat",
    rota_chat,
    methods=["POST"],
)
roteador_chat.add_api_route(
    "/api/laudo/{laudo_id}/mensagens",
    obter_mensagens_laudo,
    methods=["GET"],
)
roteador_chat.add_api_route(
    "/api/gerar_pdf",
    rota_pdf,
    methods=["POST"],
)
roteador_chat.add_api_route(
    "/api/upload_doc",
    rota_upload_doc,
    methods=["POST"],
)
roteador_chat.add_api_route(
    "/api/feedback",
    rota_feedback,
    methods=["POST"],
)

__all__ = [
    "roteador_chat",
    "sse_notificacoes_inspetor",
    "rota_chat",
    "chat_api",
    "obter_mensagens_laudo",
    "listar_mensagens_laudo",
    "rota_upload_doc",
    "upload_documento",
    "rota_pdf",
    "gerar_pdf",
    "rota_feedback",
    "registrar_feedback",
]
