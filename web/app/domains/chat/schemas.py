"""Schemas do domínio Chat/Inspetor.

Separados de `routes.py` para reduzir acoplamento e facilitar evolução
dos módulos (`auth`, `laudo`, `chat`, `mesa`, `pendencias`).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator

from app.domains.chat.media_helpers import nome_documento_seguro
from app.domains.chat.normalization import normalizar_setor

LIMITE_MSG_CHARS = 8_000
LIMITE_HISTORICO = 20
LIMITE_IMG_BASE64 = 14_500_000
LIMITE_DOC_CHARS = 40_000
LIMITE_FEEDBACK = 500
LIMITE_NOME_DOCUMENTO = 120


class MensagemHistorico(BaseModel):
    papel: Literal["usuario", "assistente"]
    texto: str = Field(..., max_length=LIMITE_MSG_CHARS)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class DadosChat(BaseModel):
    mensagem: str = Field(default="", max_length=LIMITE_MSG_CHARS)
    dados_imagem: str = Field(default="", max_length=LIMITE_IMG_BASE64)
    setor: str = Field(default="geral", max_length=50)
    historico: list[MensagemHistorico] = Field(default_factory=list, max_length=LIMITE_HISTORICO)
    modo: Literal["curto", "detalhado", "deep_research"] = Field(default="detalhado")
    texto_documento: str = Field(default="", max_length=LIMITE_DOC_CHARS)
    nome_documento: str = Field(default="", max_length=LIMITE_NOME_DOCUMENTO)
    laudo_id: int | None = None
    referencia_mensagem_id: int | None = Field(default=None, ge=1)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")

    @field_validator("setor")
    @classmethod
    def validar_setor(cls, valor: str) -> str:
        return normalizar_setor(valor)

    @field_validator("nome_documento")
    @classmethod
    def validar_nome_documento(cls, valor: str) -> str:
        return nome_documento_seguro(valor)


class DadosMesaMensagem(BaseModel):
    texto: str = Field(..., min_length=1, max_length=LIMITE_MSG_CHARS)
    referencia_mensagem_id: int | None = Field(default=None, ge=1)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class DadosPDF(BaseModel):
    diagnostico: str = Field(..., min_length=1, max_length=40_000)
    inspetor: str = Field(..., min_length=1, max_length=200)
    empresa: str = Field(default="", max_length=200)
    setor: str = Field(default="geral", max_length=50)
    data: str = Field(default="", max_length=20)
    laudo_id: int | None = Field(default=None, ge=1)
    tipo_template: str = Field(default="", max_length=80)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")

    @field_validator("setor")
    @classmethod
    def validar_setor(cls, valor: str) -> str:
        return normalizar_setor(valor)


class DadosPin(BaseModel):
    pinado: StrictBool

    model_config = ConfigDict(extra="ignore")


class DadosPendencia(BaseModel):
    lida: StrictBool = True

    model_config = ConfigDict(extra="ignore")


class DadosFeedback(BaseModel):
    tipo: Literal["positivo", "negativo"]
    trecho: str = Field(default="", max_length=LIMITE_FEEDBACK)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")
