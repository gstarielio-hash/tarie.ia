"""Wrapper legado de compatibilidade.

Use `app.shared.database`.
"""

from _legacy_compat import reexport_legacy_module

reexport_legacy_module("banco_dados", "app.shared.database", globals())
