"""Compatibilidade: use app.domains.revisor.routes."""

from app.domains.revisor import routes as _impl

for _nome, _valor in vars(_impl).items():
    if _nome.startswith("__"):
        continue
    globals()[_nome] = _valor

del _nome, _valor, _impl
