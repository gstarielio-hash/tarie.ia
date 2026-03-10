"""Domínio Chat/Inspetor.

`routes.py` mantém helpers e handlers legados.
Os módulos `auth`, `laudo`, `chat`, `mesa` e `pendencias` agrupam
responsabilidades e permitem extração incremental dos roteadores.
"""

from app.domains.chat import auth, chat, laudo, mesa, pendencias
from app.domains.chat.auth import roteador_auth
from app.domains.chat.laudo import roteador_laudo
from app.domains.chat.pendencias import roteador_pendencias
from app.domains.chat.routes import roteador_inspetor

# Fase 3.1: rotas de autenticação/páginas já vivem em router dedicado.
roteador_inspetor.include_router(roteador_auth)
roteador_inspetor.include_router(roteador_laudo)
roteador_inspetor.include_router(roteador_pendencias)

__all__ = [
    "roteador_inspetor",
    "auth",
    "laudo",
    "chat",
    "mesa",
    "pendencias",
]
