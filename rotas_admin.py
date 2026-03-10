"""Compatibilidade: use app.domains.admin.routes."""

from app.domains.admin import routes as _impl

for _nome, _valor in vars(_impl).items():
    if _nome.startswith("__"):
        continue
    globals()[_nome] = _valor

del _nome, _valor, _impl
