"""Helpers de serialização e notificação de mensagens do domínio Chat/Inspetor."""

from __future__ import annotations

import logging
from typing import Any

from app.domains.mesa.attachments import (
    serializar_anexos_mesa,
    texto_mensagem_mesa_visivel,
)
from app.domains.chat.pendencias_helpers import formatar_data_br, nome_resolvedor_pendencia
from app.shared.database import MensagemLaudo, TipoMensagem
from nucleo.inspetor.confianca_ia import normalizar_payload_confianca_ia
from nucleo.inspetor.referencias_mensagem import extrair_referencia_do_texto

logger = logging.getLogger("tariel.rotas_inspetor")


def serializar_historico_mensagem(
    mensagem: MensagemLaudo,
    modo_resposta: str,
    citacoes: list[dict[str, Any]] | None = None,
    confianca_ia: dict[str, Any] | None = None,
) -> dict[str, Any]:
    referencia_mensagem_id, texto_limpo = extrair_referencia_do_texto(mensagem.conteudo)
    anexos_payload = serializar_anexos_mesa(getattr(mensagem, "anexos_mesa", None), portal="revisao")

    if mensagem.tipo in (TipoMensagem.USER.value, TipoMensagem.HUMANO_INSP.value):
        papel = "usuario"
    elif mensagem.tipo == TipoMensagem.HUMANO_ENG.value:
        papel = "engenheiro"
    else:
        papel = "assistente"

    item: dict[str, Any] = {
        "id": mensagem.id,
        "papel": papel,
        "texto": texto_mensagem_mesa_visivel(mensagem.conteudo, anexos=getattr(mensagem, "anexos_mesa", None))
        if mensagem.is_whisper
        else texto_limpo,
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
    if anexos_payload:
        item["anexos"] = anexos_payload

    if citacoes:
        item["citacoes"] = citacoes
    if confianca_ia and mensagem.tipo == TipoMensagem.IA.value:
        item["confianca_ia"] = normalizar_payload_confianca_ia(confianca_ia)

    return item


def serializar_mensagem_mesa(mensagem: MensagemLaudo) -> dict[str, Any]:
    referencia_mensagem_id, _texto_limpo = extrair_referencia_do_texto(mensagem.conteudo)
    anexos_payload = serializar_anexos_mesa(getattr(mensagem, "anexos_mesa", None), portal="app")
    payload: dict[str, Any] = {
        "id": mensagem.id,
        "laudo_id": mensagem.laudo_id,
        "tipo": mensagem.tipo,
        "texto": texto_mensagem_mesa_visivel(mensagem.conteudo, anexos=getattr(mensagem, "anexos_mesa", None)),
        "remetente_id": mensagem.remetente_id,
        "data": formatar_data_br(mensagem.criado_em),
        "lida": bool(mensagem.lida),
        "resolvida_em": mensagem.resolvida_em.isoformat() if mensagem.resolvida_em else "",
        "resolvida_em_label": formatar_data_br(mensagem.resolvida_em, incluir_ano=True) if mensagem.resolvida_em else "",
        "resolvida_por_nome": nome_resolvedor_pendencia(mensagem),
    }
    if referencia_mensagem_id:
        payload["referencia_mensagem_id"] = referencia_mensagem_id
    if anexos_payload:
        payload["anexos"] = anexos_payload
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
        from app.domains.revisor.realtime import notificar_mesa_whisper_empresa

        await notificar_mesa_whisper_empresa(
            empresa_id=empresa_id,
            laudo_id=laudo_id,
            inspetor_id=inspetor_id,
            inspetor_nome=inspetor_nome,
            preview=preview,
        )

    except Exception:
        logger.warning("Falha ao notificar mesa avaliadora.", exc_info=True)


__all__ = [
    "serializar_historico_mensagem",
    "serializar_mensagem_mesa",
    "notificar_mesa_whisper",
]
