"""Wrapper legado de compatibilidade.

Use `app.shared.security`.
"""

from _legacy_compat import reexport_legacy_module

reexport_legacy_module("seguranca", "app.shared.security", globals())
