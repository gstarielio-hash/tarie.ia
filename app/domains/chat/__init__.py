"""Domínio Chat/Inspetor.

`routes.py` mantém helpers e handlers legados.
Os módulos `auth`, `laudo`, `chat`, `mesa` e `pendencias` agrupam
responsabilidades e permitem extração incremental dos roteadores.
"""

from app.domains.chat.router import (
    auth,
    chat,
    laudo,
    mesa,
    pendencias,
    roteador_inspetor,
)

__all__ = [
    "roteador_inspetor",
    "auth",
    "laudo",
    "chat",
    "mesa",
    "pendencias",
]
