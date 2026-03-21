"""Runtime de engine e sessão SQLAlchemy da aplicação."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

from app.core.settings import env_int, env_str

load_dotenv()

_DIR_PROJETO = Path(__file__).resolve().parents[3]
_URL_PADRAO = f"sqlite:///{_DIR_PROJETO / 'tariel_admin.db'}"


def _normalizar_url_banco(valor: str) -> str:
    texto = str(valor or "").strip()
    if not texto:
        return _URL_PADRAO

    if texto.startswith("postgres://"):
        return "postgresql+psycopg://" + texto.removeprefix("postgres://")

    if texto.startswith("postgresql://") and not re.match(r"^postgresql\+[a-z0-9_]+://", texto):
        return "postgresql+psycopg://" + texto.removeprefix("postgresql://")

    return texto


URL_BANCO = _normalizar_url_banco(env_str("DATABASE_URL", _URL_PADRAO))
_EH_SQLITE = URL_BANCO.startswith("sqlite")
_EH_SQLITE_MEMORIA = _EH_SQLITE and (
    URL_BANCO in {"sqlite://", "sqlite:///:memory:"}
    or ":memory:" in URL_BANCO
    or "mode=memory" in URL_BANCO
)


def _criar_engine():
    kwargs: dict[str, Any] = {
        "pool_pre_ping": True,
        "future": True,
    }

    if _EH_SQLITE:
        kwargs["connect_args"] = {"check_same_thread": False}
        kwargs["poolclass"] = StaticPool if _EH_SQLITE_MEMORIA else NullPool
    else:
        kwargs["pool_size"] = env_int("DB_POOL_SIZE", 10)
        kwargs["max_overflow"] = env_int("DB_MAX_OVERFLOW", 20)
        kwargs["pool_timeout"] = env_int("DB_POOL_TIMEOUT", 30)
        kwargs["pool_recycle"] = env_int("DB_POOL_RECYCLE", 3600)

    engine = create_engine(URL_BANCO, **kwargs)

    if _EH_SQLITE:

        @event.listens_for(engine, "connect")
        def _configurar_sqlite(conn, _record):
            cursor = conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=5000")

            if not _EH_SQLITE_MEMORIA:
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")

            cursor.close()

    return engine


motor_banco = _criar_engine()
SessaoLocal = sessionmaker(
    bind=motor_banco,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=Session,
)


__all__ = [
    "SessaoLocal",
    "URL_BANCO",
    "_normalizar_url_banco",
    "motor_banco",
]
