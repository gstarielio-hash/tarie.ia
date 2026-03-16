"""Helpers de parsing tolerante para requests do portal do inspetor."""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import BeforeValidator


def _normalizar_inteiro_opcional_nullish(valor: Any) -> Any:
    if valor is None:
        return None

    if isinstance(valor, str):
        limpo = valor.strip()
        if not limpo or limpo.lower() in {"null", "none", "0"}:
            return None
        return limpo

    if isinstance(valor, (int, float)) and int(valor) == 0:
        return None

    return valor


def _normalizar_bool_form_estrito(valor: Any) -> Any:
    if isinstance(valor, bool):
        return valor

    if valor is None:
        return None

    if isinstance(valor, str):
        limpo = valor.strip().lower()
        if limpo in {"true", "on"}:
            return True
        if limpo in {"false", "off", ""}:
            return False
        raise ValueError("Campo booleano deve usar true/false.")

    raise ValueError("Campo booleano deve usar true/false.")


InteiroOpcionalNullish = Annotated[int | None, BeforeValidator(_normalizar_inteiro_opcional_nullish)]
BoolFormEstrito = Annotated[bool, BeforeValidator(_normalizar_bool_form_estrito)]


__all__ = ["BoolFormEstrito", "InteiroOpcionalNullish"]
