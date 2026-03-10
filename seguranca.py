"""Compatibilidade: use app.shared.security."""

from app.shared import security as _impl

for _nome, _valor in vars(_impl).items():
    if _nome.startswith("__"):
        continue
    globals()[_nome] = _valor

del _nome, _valor, _impl
