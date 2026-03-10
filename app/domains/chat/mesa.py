"""Façade de rotas da mesa avaliadora no domínio do inspetor."""

from app.domains.chat.routes import (
    enviar_mensagem_mesa_laudo,
    listar_mensagens_mesa_laudo,
)

listar_mensagens_mesa = listar_mensagens_mesa_laudo
enviar_mensagem_mesa = enviar_mensagem_mesa_laudo

__all__ = [
    "listar_mensagens_mesa_laudo",
    "listar_mensagens_mesa",
    "enviar_mensagem_mesa_laudo",
    "enviar_mensagem_mesa",
]
