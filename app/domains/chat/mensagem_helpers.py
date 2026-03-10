"""Helpers de serialização e notificação de mensagens do domínio Chat/Inspetor."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.domains.chat.pendencias_helpers import formatar_data_br
from app.shared.database import MensagemLaudo, TipoMensagem
from nucleo.inspetor.confianca_ia import normalizar_payload_confianca_ia
from nucleo.inspetor.referencias_mensagem import extrair_referencia_do_texto

logger = logging.getLogger("tariel.rotas_inspetor")


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def serializar_historico_mensagem(
    mensagem: MensagemLaudo,
    modo_resposta: str,
    citacoes: list[dict[str, Any]] | None = None,
    confianca_ia: dict[str, Any] | None = None,
) -> dict[str, Any]:
    referencia_mensagem_id, texto_limpo = extrair_referencia_do_texto(mensagem.conteudo)

    if mensagem.tipo in (TipoMensagem.USER.value, TipoMensagem.HUMANO_INSP.value):
        papel = "usuario"
    elif mensagem.tipo == TipoMensagem.HUMANO_ENG.value:
        papel = "engenheiro"
    else:
        papel = "assistente"

    item: dict[str, Any] = {
        "id": mensagem.id,
        "papel": papel,
        "texto": texto_limpo,
        "tipo": mensagem.tipo,
        "modo": modo_resposta or "detalhado",
        "is_whisper": mensagem.tipo
        in (
            TipoMensagem.HUMANO_INSP.value,
            TipoMensagem.HUMANO_ENG.value,
        ),
        "remetente_id": mensagem.remetente_id,
    }
    if referencia_mensagem_id:
        item["referencia_mensagem_id"] = referencia_mensagem_id

    if citacoes:
        item["citacoes"] = citacoes
    if confianca_ia and mensagem.tipo == TipoMensagem.IA.value:
        item["confianca_ia"] = normalizar_payload_confianca_ia(confianca_ia)

    return item


def serializar_mensagem_mesa(mensagem: MensagemLaudo) -> dict[str, Any]:
    referencia_mensagem_id, texto_limpo = extrair_referencia_do_texto(mensagem.conteudo)
    payload: dict[str, Any] = {
        "id": mensagem.id,
        "laudo_id": mensagem.laudo_id,
        "tipo": mensagem.tipo,
        "texto": texto_limpo,
        "remetente_id": mensagem.remetente_id,
        "data": formatar_data_br(mensagem.criado_em),
    }
    if referencia_mensagem_id:
        payload["referencia_mensagem_id"] = referencia_mensagem_id
    return payload


async def notificar_mesa_whisper(
    *,
    empresa_id: int,
    laudo_id: int,
    inspetor_id: int,
    inspetor_nome: str,
    preview: str,
) -> None:
    try:
        from app.domains.revisor.routes import manager as manager_mesa

        payload = {
            "tipo": "whisper_ping",
            "laudo_id": laudo_id,
            "inspetor": inspetor_nome,
            "inspetor_id": inspetor_id,
            "preview": preview[:120],
            "timestamp": _agora_utc().isoformat(),
        }

        if hasattr(manager_mesa, "broadcast_empresa"):
            await manager_mesa.broadcast_empresa(
                empresa_id=empresa_id,
                mensagem=payload,
            )
        elif hasattr(manager_mesa, "ping_whisper"):
            await manager_mesa.ping_whisper(payload)

    except Exception:
        logger.warning("Falha ao notificar mesa avaliadora.", exc_info=True)


__all__ = [
    "serializar_historico_mensagem",
    "serializar_mensagem_mesa",
    "notificar_mesa_whisper",
]
