"""Helpers de limites/plano para o domínio Chat/Inspetor."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.shared.database import Laudo, Usuario


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def contar_laudos_mes(banco: Session, empresa_id: int) -> int:
    inicio_mes = _agora_utc().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return banco.query(func.count(Laudo.id)).filter(Laudo.empresa_id == empresa_id, Laudo.criado_em >= inicio_mes).scalar() or 0


def obter_limite_empresa(usuario: Usuario, banco: Session):
    if not usuario.empresa:
        return None
    return usuario.empresa.obter_limites(banco)


def garantir_limite_laudos(usuario: Usuario, banco: Session) -> None:
    limite = obter_limite_empresa(usuario, banco)
    if not limite or limite.laudos_mes is None:
        return

    usados = contar_laudos_mes(banco, usuario.empresa_id)
    if usados >= limite.laudos_mes:
        raise HTTPException(
            status_code=402,
            detail="Limite de laudos mensais atingido.",
        )


def garantir_upload_documento_habilitado(usuario: Usuario, banco: Session) -> None:
    limite = obter_limite_empresa(usuario, banco)
    if not limite or not getattr(limite, "upload_doc", False):
        raise HTTPException(status_code=403, detail="Upload de documento bloqueado pelo plano.")


def garantir_deep_research_habilitado(usuario: Usuario, banco: Session) -> None:
    limite = obter_limite_empresa(usuario, banco)
    if not limite or not getattr(limite, "deep_research", False):
        raise HTTPException(status_code=403, detail="Deep Research indisponível para o plano atual.")


__all__ = [
    "contar_laudos_mes",
    "obter_limite_empresa",
    "garantir_limite_laudos",
    "garantir_upload_documento_habilitado",
    "garantir_deep_research_habilitado",
]
