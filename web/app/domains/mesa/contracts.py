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


class ResumoMensagensMesa(BaseModel):
    total: int = Field(default=0, ge=0)
    inspetor: int = Field(default=0, ge=0)
    ia: int = Field(default=0, ge=0)
    mesa: int = Field(default=0, ge=0)
    sistema_outros: int = Field(default=0, ge=0)


class ResumoEvidenciasMesa(BaseModel):
    total: int = Field(default=0, ge=0)
    textuais: int = Field(default=0, ge=0)
    fotos: int = Field(default=0, ge=0)
    documentos: int = Field(default=0, ge=0)


class ResumoPendenciasMesa(BaseModel):
    total: int = Field(default=0, ge=0)
    abertas: int = Field(default=0, ge=0)
    resolvidas: int = Field(default=0, ge=0)


class AnexoPacoteMesa(BaseModel):
    id: int = Field(..., ge=1)
    nome: str = Field(..., min_length=1, max_length=160)
    mime_type: str = Field(..., min_length=3, max_length=120)
    categoria: str = Field(..., min_length=4, max_length=20)
    tamanho_bytes: int = Field(default=0, ge=0)
    eh_imagem: bool = False


class MensagemPacoteMesa(BaseModel):
    id: int = Field(..., ge=1)
    tipo: str = Field(..., min_length=1, max_length=20)
    texto: str = Field(default="", max_length=8000)
    criado_em: datetime
    remetente_id: int | None = Field(default=None, ge=1)
    lida: bool = False
    referencia_mensagem_id: int | None = Field(default=None, ge=1)
    resolvida_em: datetime | None = None
    resolvida_por_id: int | None = Field(default=None, ge=1)
    resolvida_por_nome: str | None = Field(default=None, max_length=160)
    anexos: list[AnexoPacoteMesa] = Field(default_factory=list)


class RevisaoPacoteMesa(BaseModel):
    numero_versao: int = Field(..., ge=1)
    origem: str = Field(..., min_length=1, max_length=20)
    resumo: str | None = Field(default=None, max_length=240)
    confianca_geral: str | None = Field(default=None, max_length=32)
    criado_em: datetime


class PacoteMesaLaudo(BaseModel):
    laudo_id: int = Field(..., ge=1)
    codigo_hash: str = Field(..., min_length=6, max_length=32)
    tipo_template: str = Field(..., min_length=1, max_length=80)
    setor_industrial: str = Field(..., min_length=1, max_length=120)
    status_revisao: str = Field(..., min_length=1, max_length=30)
    status_conformidade: str = Field(..., min_length=1, max_length=30)
    criado_em: datetime
    atualizado_em: datetime | None = None
    tempo_em_campo_minutos: int = Field(default=0, ge=0)
    ultima_interacao_em: datetime | None = None
    inspetor_id: int | None = Field(default=None, ge=1)
    revisor_id: int | None = Field(default=None, ge=1)
    dados_formulario: dict | None = None
    parecer_ia: str | None = None
    resumo_mensagens: ResumoMensagensMesa
    resumo_evidencias: ResumoEvidenciasMesa
    resumo_pendencias: ResumoPendenciasMesa
    pendencias_abertas: list[MensagemPacoteMesa] = Field(default_factory=list)
    pendencias_resolvidas_recentes: list[MensagemPacoteMesa] = Field(default_factory=list)
    whispers_recentes: list[MensagemPacoteMesa] = Field(default_factory=list)
    revisoes_recentes: list[RevisaoPacoteMesa] = Field(default_factory=list)
