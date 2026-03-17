"""Agregador do roteador do domínio Chat/Inspetor."""

from __future__ import annotations

import app.domains.chat.auth as auth
import app.domains.chat.chat as chat
import app.domains.chat.laudo as laudo
import app.domains.chat.mesa as mesa
import app.domains.chat.pendencias as pendencias
from app.domains.chat.auth import roteador_auth
from app.domains.chat.chat import roteador_chat
from app.domains.chat.laudo import roteador_laudo
from app.domains.chat.mesa import roteador_mesa
from app.domains.chat.pendencias import roteador_pendencias
from app.domains.chat.routes import roteador_inspetor as _roteador_inspetor_base


def _incluir_subrouters_uma_vez() -> None:
    if getattr(_roteador_inspetor_base, "_chat_subrouters_incluidos", False):
        return

    _roteador_inspetor_base.include_router(roteador_auth)
    _roteador_inspetor_base.include_router(roteador_laudo)
    _roteador_inspetor_base.include_router(roteador_chat)
    _roteador_inspetor_base.include_router(roteador_mesa)
    _roteador_inspetor_base.include_router(roteador_pendencias)
    setattr(_roteador_inspetor_base, "_chat_subrouters_incluidos", True)


_incluir_subrouters_uma_vez()

roteador_inspetor = _roteador_inspetor_base


__all__ = [
    "roteador_inspetor",
    "auth",
    "laudo",
    "chat",
    "mesa",
    "pendencias",
]
