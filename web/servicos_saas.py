"""Wrapper legado de compatibilidade.

Use `app.domains.admin.services`.
"""

from _legacy_compat import reexport_legacy_module

reexport_legacy_module("servicos_saas", "app.domains.admin.services", globals())
