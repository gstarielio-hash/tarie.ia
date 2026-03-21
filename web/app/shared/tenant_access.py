"""Helpers compartilhados de escopo multiempresa."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.shared.database import Empresa, Laudo, Usuario


def obter_empresa_id_usuario(
    usuario: Usuario,
    *,
    detalhe_sem_empresa: str = "Usuário sem empresa vinculada.",
) -> int:
    try:
        empresa_id = int(getattr(usuario, "empresa_id", 0) or 0)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detalhe_sem_empresa,
        ) from exc

    if empresa_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detalhe_sem_empresa,
        )
    return empresa_id


def obter_empresa_usuario(
    banco: Session,
    usuario: Usuario,
    *,
    detalhe_sem_empresa: str = "Usuário sem empresa vinculada.",
    detalhe_nao_encontrada: str = "Empresa não encontrada.",
) -> Empresa:
    empresa_id = obter_empresa_id_usuario(
        usuario,
        detalhe_sem_empresa=detalhe_sem_empresa,
    )
    empresa = banco.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detalhe_nao_encontrada,
        )
    return empresa


def obter_laudo_empresa(
    banco: Session,
    laudo_id: int,
    empresa_id: int,
    *,
    detalhe_nao_encontrado: str = "Laudo não encontrado.",
) -> Laudo:
    laudo = banco.get(Laudo, int(laudo_id))
    if not laudo or int(getattr(laudo, "empresa_id", 0) or 0) != int(empresa_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detalhe_nao_encontrado,
        )
    return laudo


def obter_laudo_empresa_usuario(
    banco: Session,
    laudo_id: int,
    usuario: Usuario,
    *,
    detalhe_sem_empresa: str = "Usuário sem empresa vinculada.",
    detalhe_nao_encontrado: str = "Laudo não encontrado.",
) -> Laudo:
    empresa_id = obter_empresa_id_usuario(
        usuario,
        detalhe_sem_empresa=detalhe_sem_empresa,
    )
    return obter_laudo_empresa(
        banco,
        laudo_id,
        empresa_id,
        detalhe_nao_encontrado=detalhe_nao_encontrado,
    )


__all__ = [
    "obter_empresa_id_usuario",
    "obter_empresa_usuario",
    "obter_laudo_empresa",
    "obter_laudo_empresa_usuario",
]
