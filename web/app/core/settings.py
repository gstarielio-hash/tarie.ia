"""Configuração central da aplicação (fonte única de ambiente)."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv


load_dotenv()


AMBIENTES_DEV = {"dev", "development", "local"}
AMBIENTES_PROD = {"producao", "production", "prod"}


def env_str(nome: str, padrao: str = "") -> str:
    return os.getenv(nome, padrao).strip()


def env_int(nome: str, padrao: int) -> int:
    bruto = env_str(nome, str(padrao))
    try:
        return int(bruto)
    except (TypeError, ValueError):
        return padrao


def env_bool(nome: str, padrao: bool = False) -> bool:
    bruto = env_str(nome, "1" if padrao else "0").lower()
    return bruto in {"1", "true", "t", "sim", "yes", "y", "on"}


def env_log_level(nome: str, padrao: int) -> int:
    bruto = env_str(nome, "")
    if not bruto:
        return padrao

    texto = bruto.upper()
    valor = getattr(logging, texto, None)
    if isinstance(valor, int):
        return valor

    try:
        return int(bruto)
    except (TypeError, ValueError):
        return padrao


@dataclass(frozen=True, slots=True)
class Settings:
    ambiente: str
    em_producao: bool
    app_versao: str
    porta: int
    host_bind: str
    debug: bool
    redis_url: str
    revisor_realtime_backend: str
    revisor_realtime_channel_prefix: str


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    ambiente = env_str("AMBIENTE", "").lower()
    if not ambiente:
        raise RuntimeError(
            "AMBIENTE é obrigatório. Defina no .env (ex.: AMBIENTE=dev ou AMBIENTE=producao)."
        )

    if ambiente not in (AMBIENTES_DEV | AMBIENTES_PROD):
        raise RuntimeError(
            "AMBIENTE inválido. Use: dev, development, local, producao, production ou prod."
        )

    em_producao = ambiente in AMBIENTES_PROD
    revisor_realtime_backend = env_str("REVISOR_REALTIME_BACKEND", "memory").lower()
    if revisor_realtime_backend not in {"memory", "redis"}:
        raise RuntimeError(
            "REVISOR_REALTIME_BACKEND inválido. Use: memory ou redis."
        )

    return Settings(
        ambiente=ambiente,
        em_producao=em_producao,
        app_versao=env_str("APP_VERSAO", "2.0-SaaS"),
        porta=env_int("PORTA", 8000),
        host_bind=env_str("HOST_BIND", "0.0.0.0") or "0.0.0.0",
        debug=env_bool("DEBUG", not em_producao),
        redis_url=env_str("REDIS_URL", ""),
        revisor_realtime_backend=revisor_realtime_backend,
        revisor_realtime_channel_prefix=env_str("REVISOR_REALTIME_CHANNEL_PREFIX", "tariel:revisor") or "tariel:revisor",
    )
