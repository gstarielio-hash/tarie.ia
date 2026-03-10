"""Domínio Chat/Inspetor.

`router.py` monta o roteador principal com os submódulos:
`auth`, `laudo`, `chat`, `mesa` e `pendencias`.
`routes.py` é apenas uma camada de compatibilidade legada
(exports mínimos para testes e integrações antigas).
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
