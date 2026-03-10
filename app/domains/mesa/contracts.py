"""Contratos do domínio Mesa Avaliadora."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class EventoMesa(StrEnum):
    CANAL_ABERTO = "canal_aberto"
    MENSAGEM_ENVIADA = "mensagem_enviada"
    MENSAGEM_RECEBIDA = "mensagem_recebida"
    PENDENCIA_CRIADA = "pendencia_criada"
    PENDENCIA_RESOLVIDA = "pendencia_resolvida"


class MensagemMesa(BaseModel):
    laudo_id: int = Field(..., ge=1)
    autor_id: int = Field(..., ge=1)
    texto: str = Field(..., min_length=1, max_length=8000)
    referencia_mensagem_id: int | None = Field(default=None, ge=1)
    criado_em: datetime


class NotificacaoMesa(BaseModel):
    evento: EventoMesa
    laudo_id: int = Field(..., ge=1)
    origem: str = Field(..., min_length=2, max_length=40)
    resumo: str = Field(..., min_length=1, max_length=300)
