"""Fachada compatível das rotas de chat do inspetor."""

from __future__ import annotations

from fastapi.routing import APIRouter

from app.domains.chat.chat_aux_routes import (
    RESPOSTA_LAUDO_NAO_ENCONTRADO,
    obter_mensagens_laudo,
    rota_feedback,
    rota_pdf,
    rota_upload_doc,
    roteador_chat_aux,
)
from app.domains.chat.chat_runtime_support import salvar_mensagem_ia, sse_notificacoes_inspetor
from app.domains.chat.chat_stream_routes import rota_chat, roteador_chat_stream
from nucleo.template_editor_word import gerar_pdf_editor_rico_bytes

roteador_chat = APIRouter()
roteador_chat.add_api_route(
    "/api/notificacoes/sse",
    sse_notificacoes_inspetor,
    methods=["GET"],
    responses={
        200: {
            "description": "Fluxo SSE de notificações do inspetor.",
            "content": {"text/event-stream": {}},
        },
    },
)
roteador_chat.include_router(roteador_chat_stream)
roteador_chat.include_router(roteador_chat_aux)

chat_api = rota_chat
listar_mensagens_laudo = obter_mensagens_laudo
upload_documento = rota_upload_doc
gerar_pdf = rota_pdf
registrar_feedback = rota_feedback

__all__ = [
    "RESPOSTA_LAUDO_NAO_ENCONTRADO",
    "chat_api",
    "gerar_pdf",
    "gerar_pdf_editor_rico_bytes",
    "listar_mensagens_laudo",
    "obter_mensagens_laudo",
    "registrar_feedback",
    "rota_chat",
    "rota_feedback",
    "rota_pdf",
    "rota_upload_doc",
    "roteador_chat",
    "salvar_mensagem_ia",
    "sse_notificacoes_inspetor",
    "upload_documento",
]
