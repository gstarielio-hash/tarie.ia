"""Ponto único de exposição dos roteadores por domínio."""

from app.domains.admin.routes import roteador_admin
from app.domains.chat import roteador_inspetor
from app.domains.revisor.routes import roteador_revisor

__all__ = [
    "roteador_admin",
    "roteador_inspetor",
    "roteador_revisor",
]
