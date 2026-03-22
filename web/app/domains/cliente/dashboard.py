"""Fachada compatível do dashboard do portal admin-cliente."""

from __future__ import annotations

# Compat: o portal cliente ainda expõe a rotulagem de papel "Admin-CEO" via ROLE_LABELS.
from app.domains.cliente.dashboard_analytics import (
    comparativo_plano_cliente,
    resumo_empresa_cliente,
)
from app.domains.cliente.dashboard_bootstrap import (
    ROLE_LABELS,
    bootstrap_cliente,
    listar_laudos_chat_usuario,
    listar_laudos_mesa_empresa,
    serializar_usuario_cliente,
)

__all__ = [
    "ROLE_LABELS",
    "bootstrap_cliente",
    "comparativo_plano_cliente",
    "listar_laudos_chat_usuario",
    "listar_laudos_mesa_empresa",
    "resumo_empresa_cliente",
    "serializar_usuario_cliente",
]
