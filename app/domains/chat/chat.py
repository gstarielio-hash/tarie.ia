"""Façade de rotas do chat IA (inspetor)."""

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

__all__ = [
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
