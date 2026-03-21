"""Runtime do cliente de IA para o domínio Chat/Inspetor."""

from __future__ import annotations

import sys

from nucleo.cliente_ia import ClienteIA

from app.domains.chat.app_context import logger

cliente_ia: ClienteIA | None = None
_erro_cliente_ia_boot: str | None = None

try:
    cliente_ia = ClienteIA()
except Exception as erro:
    _erro_cliente_ia_boot = str(erro)
    logger.warning(
        "Cliente IA indisponível no boot. Recursos de IA ficarão desativados até configuração correta.",
        exc_info=not isinstance(erro, OSError),
    )


def _resolver_cliente_ia_compat() -> tuple[ClienteIA | None, str | None]:
    """Respeita patches legados em routes.py sem reintroduzir import estático."""

    modulo_rotas = sys.modules.get("app.domains.chat.routes")
    if modulo_rotas is None:
        return cliente_ia, _erro_cliente_ia_boot

    return (
        getattr(modulo_rotas, "cliente_ia", cliente_ia),
        getattr(modulo_rotas, "_erro_cliente_ia_boot", _erro_cliente_ia_boot),
    )


def obter_cliente_ia_ativo(
    *,
    cliente: ClienteIA | None = None,
    erro_boot: str | None = None,
) -> ClienteIA:
    if cliente is None and erro_boot is None:
        cliente_ativo, erro_ativo = _resolver_cliente_ia_compat()
    else:
        cliente_ativo = cliente if cliente is not None else cliente_ia
        erro_ativo = erro_boot if erro_boot is not None else _erro_cliente_ia_boot

    if cliente_ativo is None:
        detalhe = "Módulo de IA indisponível. Configure CHAVE_API_GEMINI e reinicie o serviço."
        if erro_ativo:
            detalhe = f"{detalhe} Motivo: {erro_ativo}"

        from fastapi import HTTPException

        raise HTTPException(status_code=503, detail=detalhe)

    return cliente_ativo


__all__ = [
    "cliente_ia",
    "_erro_cliente_ia_boot",
    "obter_cliente_ia_ativo",
]
