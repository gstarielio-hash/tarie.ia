"""Domínio Chat/Inspetor.

`routes.py` mantém a implementação completa e o `roteador_inspetor`.
Os módulos `auth`, `laudo`, `chat`, `mesa` e `pendencias` agrupam
handlers por responsabilidade para facilitar navegação e evolução.
"""

from app.domains.chat import auth, chat, laudo, mesa, pendencias
from app.domains.chat.routes import roteador_inspetor

__all__ = [
    "roteador_inspetor",
    "auth",
    "laudo",
    "chat",
    "mesa",
    "pendencias",
]
