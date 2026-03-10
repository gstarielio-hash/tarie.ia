"""Rotas da mesa avaliadora no domínio do inspetor."""

from fastapi.routing import APIRouter

from app.domains.chat.routes import (
    enviar_mensagem_mesa_laudo,
    listar_mensagens_mesa_laudo,
)

listar_mensagens_mesa = listar_mensagens_mesa_laudo
enviar_mensagem_mesa = enviar_mensagem_mesa_laudo

roteador_mesa = APIRouter()

roteador_mesa.add_api_route(
    "/api/laudo/{laudo_id}/mesa/mensagens",
    listar_mensagens_mesa_laudo,
    methods=["GET"],
)
roteador_mesa.add_api_route(
    "/api/laudo/{laudo_id}/mesa/mensagem",
    enviar_mensagem_mesa_laudo,
    methods=["POST"],
)

__all__ = [
    "roteador_mesa",
    "listar_mensagens_mesa_laudo",
    "listar_mensagens_mesa",
    "enviar_mensagem_mesa_laudo",
    "enviar_mensagem_mesa",
]
