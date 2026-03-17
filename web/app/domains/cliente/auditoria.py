"""Helpers de auditoria do portal admin-cliente."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.shared.database import RegistroAuditoriaEmpresa, agora_utc

logger = logging.getLogger("tariel.cliente.auditoria")


def registrar_auditoria_empresa(
    banco: Session,
    *,
    empresa_id: int,
    ator_usuario_id: int | None,
    acao: str,
    resumo: str,
    detalhe: str = "",
    alvo_usuario_id: int | None = None,
    portal: str = "cliente",
    payload: dict[str, Any] | None = None,
) -> RegistroAuditoriaEmpresa:
    timestamp = agora_utc()
    registro = RegistroAuditoriaEmpresa(
        empresa_id=int(empresa_id),
        ator_usuario_id=int(ator_usuario_id) if ator_usuario_id else None,
        alvo_usuario_id=int(alvo_usuario_id) if alvo_usuario_id else None,
        portal=str(portal or "cliente")[:30],
        acao=str(acao or "acao").strip()[:80],
        resumo=str(resumo or "Ação registrada").strip()[:220],
        detalhe=(str(detalhe or "").strip() or None),
        payload_json=payload or None,
        criado_em=timestamp,
        atualizado_em=timestamp,
    )
    banco.add(registro)
    banco.commit()
    banco.refresh(registro)
    return registro


def listar_auditoria_empresa(
    banco: Session,
    *,
    empresa_id: int,
    portal: str = "cliente",
    limite: int = 12,
) -> list[RegistroAuditoriaEmpresa]:
    limite_normalizado = max(1, min(int(limite or 12), 50))
    consulta = (
        select(RegistroAuditoriaEmpresa)
        .options(
            selectinload(RegistroAuditoriaEmpresa.ator_usuario),
            selectinload(RegistroAuditoriaEmpresa.alvo_usuario),
        )
        .where(
            RegistroAuditoriaEmpresa.empresa_id == int(empresa_id),
            RegistroAuditoriaEmpresa.portal == str(portal or "cliente"),
        )
        .order_by(RegistroAuditoriaEmpresa.criado_em.desc(), RegistroAuditoriaEmpresa.id.desc())
        .limit(limite_normalizado)
    )
    return list(banco.scalars(consulta).all())


def serializar_registro_auditoria(registro: RegistroAuditoriaEmpresa) -> dict[str, Any]:
    criado_em = getattr(registro, "criado_em", None)
    ator = getattr(registro, "ator_usuario", None)
    alvo = getattr(registro, "alvo_usuario", None)

    return {
        "id": int(registro.id),
        "acao": str(registro.acao or ""),
        "portal": str(registro.portal or "cliente"),
        "resumo": str(registro.resumo or ""),
        "detalhe": str(registro.detalhe or ""),
        "payload": registro.payload_json or {},
        "criado_em": criado_em.isoformat() if criado_em else "",
        "criado_em_label": (
            criado_em.astimezone().strftime("%d/%m/%Y %H:%M")
            if criado_em
            else "Agora"
        ),
        "ator_usuario_id": int(registro.ator_usuario_id) if registro.ator_usuario_id else None,
        "ator_nome": getattr(ator, "nome", None) or getattr(ator, "nome_completo", None) or "Sistema",
        "alvo_usuario_id": int(registro.alvo_usuario_id) if registro.alvo_usuario_id else None,
        "alvo_nome": getattr(alvo, "nome", None) or getattr(alvo, "nome_completo", None) or "",
    }
