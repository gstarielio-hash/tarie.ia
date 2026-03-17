"""Camada de compatibilidade legada do domínio Chat/Inspetor.

Historicamente, diversos módulos e testes importavam símbolos de `routes.py`.
Após a modularização, este arquivo mantém apenas os pontos de integração
necessários para evitar quebra de contrato.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.domains.chat.ia_runtime import (
    _erro_cliente_ia_boot as _erro_cliente_ia_boot_padrao,
    cliente_ia as cliente_ia_padrao,
    obter_cliente_ia_ativo as obter_cliente_ia_runtime,
)
from app.domains.chat.notifications import inspetor_notif_manager
from app.shared.database import SessaoLocal
from nucleo.cliente_ia import ClienteIA

roteador_inspetor = APIRouter()

# Compatibilidade para testes/patch em tempo de execução.
cliente_ia: ClienteIA | None = cliente_ia_padrao
_erro_cliente_ia_boot: str | None = _erro_cliente_ia_boot_padrao


def obter_cliente_ia_ativo() -> ClienteIA:
    return obter_cliente_ia_runtime(
        cliente=cliente_ia,
        erro_boot=_erro_cliente_ia_boot,
    )


__all__ = [
    "roteador_inspetor",
    "SessaoLocal",
    "inspetor_notif_manager",
    "cliente_ia",
    "_erro_cliente_ia_boot",
    "obter_cliente_ia_ativo",
]
