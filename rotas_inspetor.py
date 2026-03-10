"""Compatibilidade: use app.domains.chat.routes."""

from app.domains.chat import routes as _impl

for _nome, _valor in vars(_impl).items():
    if _nome.startswith("__"):
        continue
    globals()[_nome] = _valor

del _nome, _valor, _impl
