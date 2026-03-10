"""Configuração central da aplicação (fonte única de ambiente)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


AMBIENTES_DEV = {"dev", "development", "local"}
AMBIENTES_PROD = {"producao", "production", "prod"}


def _valor_env(nome: str, padrao: str = "") -> str:
    return os.getenv(nome, padrao).strip()


def _bool_env(nome: str, padrao: bool = False) -> bool:
    bruto = _valor_env(nome, "1" if padrao else "0").lower()
    return bruto in {"1", "true", "t", "sim", "yes", "y", "on"}


@dataclass(frozen=True, slots=True)
class Settings:
    ambiente: str
    em_producao: bool
    app_versao: str
    porta: int
    host_bind: str
    debug: bool


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    ambiente = _valor_env("AMBIENTE", "").lower()
    if not ambiente:
        raise RuntimeError(
            "AMBIENTE é obrigatório. Defina no .env (ex.: AMBIENTE=dev ou AMBIENTE=producao)."
        )

    if ambiente not in (AMBIENTES_DEV | AMBIENTES_PROD):
        raise RuntimeError(
            "AMBIENTE inválido. Use: dev, development, local, producao, production ou prod."
        )

    em_producao = ambiente in AMBIENTES_PROD
    return Settings(
        ambiente=ambiente,
        em_producao=em_producao,
        app_versao=_valor_env("APP_VERSAO", "2.0-SaaS"),
        porta=int(_valor_env("PORTA", "8000") or "8000"),
        host_bind=_valor_env("HOST_BIND", "0.0.0.0") or "0.0.0.0",
        debug=_bool_env("DEBUG", not em_producao),
    )
