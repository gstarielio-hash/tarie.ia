"""Helpers de acesso/autorização de laudo no domínio Chat/Inspetor."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.shared.database import Laudo, Usuario


def obter_laudo_empresa(banco: Session, laudo_id: int, empresa_id: int) -> Laudo:
    laudo = banco.query(Laudo).filter(Laudo.id == laudo_id, Laudo.empresa_id == empresa_id).first()
    if not laudo:
        raise HTTPException(status_code=404, detail="Laudo não encontrado.")
    return laudo


def obter_laudo_do_inspetor(banco: Session, laudo_id: int, usuario: Usuario) -> Laudo:
    laudo = obter_laudo_empresa(banco, laudo_id, usuario.empresa_id)
    if bool(getattr(usuario, "eh_admin_cliente", False)):
        return laudo
    if laudo.usuario_id not in (None, usuario.id):
        raise HTTPException(
            status_code=403,
            detail="Laudo não pertence ao inspetor autenticado.",
        )
    return laudo


__all__ = [
    "obter_laudo_empresa",
    "obter_laudo_do_inspetor",
]
