"""Wrapper legado de compatibilidade.

Use `app.domains.chat` e `app.domains.chat.routes`.
"""

from _legacy_compat import reexport_legacy_module

reexport_legacy_module(
    "rotas_inspetor",
    ("app.domains.chat", "app.domains.chat.routes"),
    globals(),
)
