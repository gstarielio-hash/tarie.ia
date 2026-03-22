from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime
from sqlalchemy.orm import DeclarativeBase


def agora_utc() -> datetime:
    return datetime.now(timezone.utc)


class MixinAuditoria:
    criado_em = Column(
        DateTime(timezone=True),
        nullable=False,
        default=agora_utc,
        comment="Timestamp UTC de criação",
    )
    atualizado_em = Column(
        DateTime(timezone=True),
        nullable=True,
        onupdate=agora_utc,
        comment="Timestamp UTC da última atualização",
    )


class Base(DeclarativeBase):
    pass
