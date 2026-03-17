"""Runtime do cliente de IA para o domínio Chat/Inspetor."""

from __future__ import annotations

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


def obter_cliente_ia_ativo(
    *,
    cliente: ClienteIA | None = None,
    erro_boot: str | None = None,
) -> ClienteIA:
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
