"""Contexto compartilhado do domínio Chat/Inspetor."""

from __future__ import annotations

import logging
import os

from fastapi.templating import Jinja2Templates

from app.core.settings import get_settings

try:
    from configuracoes import configuracoes
except ImportError:
    configuracoes = None

logger = logging.getLogger("tariel.rotas_inspetor")
_settings = get_settings()
templates = Jinja2Templates(directory="templates")
PADRAO_SUPORTE_WHATSAPP = os.getenv("SUPORTE_WHATSAPP", "5516999999999").strip()


__all__ = [
    "logger",
    "_settings",
    "templates",
    "configuracoes",
    "PADRAO_SUPORTE_WHATSAPP",
]
