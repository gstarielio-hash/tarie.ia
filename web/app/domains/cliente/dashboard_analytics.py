"""Fachada compatível do analytics do portal admin-cliente."""

from __future__ import annotations

from app.domains.cliente.dashboard_company_summary import resumo_empresa_cliente
from app.domains.cliente.dashboard_plan_analytics import comparativo_plano_cliente

__all__ = [
    "comparativo_plano_cliente",
    "resumo_empresa_cliente",
]
