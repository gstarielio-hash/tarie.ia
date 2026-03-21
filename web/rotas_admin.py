"""Wrapper legado de compatibilidade.

Use `app.domains.admin.routes`.
"""

from _legacy_compat import reexport_legacy_module

reexport_legacy_module("rotas_admin", "app.domains.admin.routes", globals())
