"""Suporte mobile/sync da Mesa Avaliadora."""

from __future__ import annotations

import re
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.domains.chat.laudo_state_helpers import (
    laudo_permite_edicao_inspetor,
    laudo_permite_reabrir,
    laudo_possui_historico_visivel,
    obter_estado_api_laudo,
    serializar_card_laudo,
)
from app.domains.mesa.attachments import resumo_mensagem_mesa
from app.shared.database import Laudo, MensagemLaudo, TipoMensagem, Usuario

_PADRAO_CLIENT_MESSAGE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{7,63}$")
_TIPOS_MESA = (
    TipoMensagem.HUMANO_INSP.value,
    TipoMensagem.HUMANO_ENG.value,
)


def normalizar_client_message_id(valor: object) -> str | None:
    client_message_id = str(valor or "").strip()
    if not client_message_id:
        return None
    if not _PADRAO_CLIENT_MESSAGE_ID.fullmatch(client_message_id):
        raise HTTPException(status_code=400, detail="client_message_id inválido.")
    return client_message_id


def obter_request_id(request: Request) -> str:
    for nome_header in ("X-Client-Request-Id", "X-Request-Id"):
        valor = str(request.headers.get(nome_header, "")).strip()
        if valor:
            return valor[:120]
    return uuid.uuid4().hex


def normalizar_cursor_atualizado_em(cursor: datetime | None) -> datetime | None:
    if cursor is None:
        return None
    if cursor.tzinfo is None:
        return cursor.replace(tzinfo=timezone.utc)
    return cursor.astimezone(timezone.utc)


def _normalizar_datetime_utc(valor: datetime | None) -> datetime | None:
    if valor is None:
        return None
    if valor.tzinfo is None:
        return valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(timezone.utc)


def carregar_mensagem_idempotente(
    banco: Session,
    *,
    laudo_id: int,
    remetente_id: int | None,
    client_message_id: str | None,
) -> MensagemLaudo | None:
    if not client_message_id:
        return None

    consulta = (
        select(MensagemLaudo)
        .where(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.remetente_id == remetente_id,
            MensagemLaudo.client_message_id == client_message_id,
        )
        .options(selectinload(MensagemLaudo.anexos_mesa))
    )
    return banco.scalar(consulta)


def carregar_mensagens_mesa_por_laudo_ids(
    banco: Session,
    laudo_ids: list[int],
) -> dict[int, list[MensagemLaudo]]:
    ids_validos = sorted({int(laudo_id) for laudo_id in laudo_ids if int(laudo_id or 0) > 0})
    if not ids_validos:
        return {}

    mensagens = list(
        banco.scalars(
            select(MensagemLaudo)
            .where(
                MensagemLaudo.laudo_id.in_(ids_validos),
                MensagemLaudo.tipo.in_(_TIPOS_MESA),
            )
            .options(selectinload(MensagemLaudo.anexos_mesa))
            .order_by(MensagemLaudo.laudo_id.asc(), MensagemLaudo.id.asc())
        ).all()
    )
    agrupadas: defaultdict[int, list[MensagemLaudo]] = defaultdict(list)
    for mensagem in mensagens:
        agrupadas[int(mensagem.laudo_id)].append(mensagem)
    return dict(agrupadas)


def serializar_resumo_mesa_laudo(
    laudo: Laudo,
    mensagens: list[MensagemLaudo],
) -> dict[str, Any]:
    pendencias_abertas = [
        mensagem
        for mensagem in mensagens
        if mensagem.tipo == TipoMensagem.HUMANO_ENG.value and mensagem.resolvida_em is None
    ]
    pendencias_resolvidas = [
        mensagem
        for mensagem in mensagens
        if mensagem.tipo == TipoMensagem.HUMANO_ENG.value and mensagem.resolvida_em is not None
    ]
    mensagens_nao_lidas = [
        mensagem
        for mensagem in mensagens
        if mensagem.tipo == TipoMensagem.HUMANO_ENG.value and not bool(mensagem.lida)
    ]
    ultima_mensagem = mensagens[-1] if mensagens else None
    atualizado_em = _normalizar_datetime_utc(laudo.atualizado_em or laudo.criado_em)
    payload: dict[str, Any] = {
        "atualizado_em": atualizado_em.isoformat() if atualizado_em else "",
        "total_mensagens": len(mensagens),
        "mensagens_nao_lidas": len(mensagens_nao_lidas),
        "pendencias_abertas": len(pendencias_abertas),
        "pendencias_resolvidas": len(pendencias_resolvidas),
        "ultima_mensagem_id": int(ultima_mensagem.id) if ultima_mensagem else None,
        "ultima_mensagem_em": ultima_mensagem.criado_em.isoformat() if ultima_mensagem and ultima_mensagem.criado_em else "",
        "ultima_mensagem_preview": resumo_mensagem_mesa(
            ultima_mensagem.conteudo,
            anexos=getattr(ultima_mensagem, "anexos_mesa", None),
        )
        if ultima_mensagem
        else "",
        "ultima_mensagem_tipo": str(ultima_mensagem.tipo or "") if ultima_mensagem else "",
        "ultima_mensagem_remetente_id": int(ultima_mensagem.remetente_id)
        if ultima_mensagem and ultima_mensagem.remetente_id
        else None,
    }
    if ultima_mensagem and ultima_mensagem.client_message_id:
        payload["ultima_mensagem_client_message_id"] = str(ultima_mensagem.client_message_id)
    return payload


def serializar_estado_resumo_mesa_laudo(
    banco: Session,
    *,
    laudo: Laudo,
    mensagens: list[MensagemLaudo],
) -> dict[str, Any]:
    return {
        "laudo_id": int(laudo.id),
        "estado": obter_estado_api_laudo(banco, laudo),
        "permite_edicao": laudo_permite_edicao_inspetor(laudo),
        "permite_reabrir": laudo_permite_reabrir(banco, laudo),
        "laudo_card": serializar_card_laudo(banco, laudo)
        if laudo_possui_historico_visivel(banco, laudo)
        else None,
        "resumo": serializar_resumo_mesa_laudo(laudo, mensagens),
    }


def montar_feed_mesa_mobile(
    banco: Session,
    *,
    usuario: Usuario,
    laudo_ids: list[int],
    cursor_atualizado_em: datetime | None,
) -> dict[str, Any]:
    ids_validos = sorted({int(laudo_id) for laudo_id in laudo_ids if int(laudo_id or 0) > 0})
    if not ids_validos:
        return {
            "cursor_atual": "",
            "laudo_ids": [],
            "itens": [],
        }

    laudos = list(
        banco.scalars(
            select(Laudo)
            .where(
                Laudo.empresa_id == usuario.empresa_id,
                Laudo.usuario_id == usuario.id,
                Laudo.id.in_(ids_validos),
            )
            .order_by(Laudo.id.asc())
        ).all()
    )
    if not laudos:
        return {
            "cursor_atual": "",
            "laudo_ids": [],
            "itens": [],
        }

    mensagens_por_laudo = carregar_mensagens_mesa_por_laudo_ids(
        banco,
        [int(laudo.id) for laudo in laudos],
    )
    cursor_normalizado = normalizar_cursor_atualizado_em(cursor_atualizado_em)
    referencias_monitoradas: list[datetime] = []
    for laudo in laudos:
        referencia = _normalizar_datetime_utc(laudo.atualizado_em or laudo.criado_em)
        if referencia is not None:
            referencias_monitoradas.append(referencia)

    cursor_atual = cursor_normalizado
    for referencia in referencias_monitoradas:
        if cursor_atual is None or referencia > cursor_atual:
            cursor_atual = referencia

    laudos_alterados = (
        laudos
        if cursor_normalizado is None
        else [
            laudo
            for laudo in laudos
            if (
                referencia := _normalizar_datetime_utc(
                    laudo.atualizado_em or laudo.criado_em,
                )
            )
            is not None
            and referencia > cursor_normalizado
        ]
    )

    return {
        "cursor_atual": cursor_atual.isoformat() if cursor_atual else "",
        "laudo_ids": [int(laudo.id) for laudo in laudos],
        "itens": [
            serializar_estado_resumo_mesa_laudo(
                banco,
                laudo=laudo,
                mensagens=mensagens_por_laudo.get(int(laudo.id), []),
            )
            for laudo in laudos_alterados
        ],
    }


__all__ = [
    "carregar_mensagem_idempotente",
    "carregar_mensagens_mesa_por_laudo_ids",
    "montar_feed_mesa_mobile",
    "normalizar_client_message_id",
    "normalizar_cursor_atualizado_em",
    "obter_request_id",
    "serializar_estado_resumo_mesa_laudo",
    "serializar_resumo_mesa_laudo",
]
