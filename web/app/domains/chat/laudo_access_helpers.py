"""Helpers de acesso/autorização de laudo no domínio Chat/Inspetor."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.shared.database import Laudo, Usuario
from app.shared.tenant_access import (
    obter_laudo_empresa as obter_laudo_empresa_tenant,
    obter_laudo_empresa_usuario,
)


def obter_laudo_empresa(banco: Session, laudo_id: int, empresa_id: int) -> Laudo:
    return obter_laudo_empresa_tenant(banco, laudo_id, empresa_id)


def obter_laudo_do_inspetor(banco: Session, laudo_id: int, usuario: Usuario) -> Laudo:
    laudo = obter_laudo_empresa_usuario(banco, laudo_id, usuario)
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
