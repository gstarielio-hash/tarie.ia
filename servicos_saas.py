"""Compatibilidade: use app.domains.admin.services."""

from app.domains.admin import services as _impl

for _nome, _valor in vars(_impl).items():
    if _nome.startswith("__"):
        continue
    globals()[_nome] = _valor

del _nome, _valor, _impl
