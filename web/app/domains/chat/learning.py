"""Rotas do inspetor para aprendizado supervisionado de IA."""

from __future__ import annotations

from typing import Literal

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.domains.chat.laudo_access_helpers import obter_laudo_do_inspetor
from app.domains.chat.learning_helpers import (
    listar_aprendizados_laudo,
    normalizar_lista_textos,
    normalizar_marcacoes_aprendizado,
    salvar_evidencia_aprendizado_visual,
    serializar_aprendizado_visual,
)
from app.domains.chat.session_helpers import exigir_csrf
from app.shared.database import (
    AprendizadoVisualIa,
    MensagemLaudo,
    Usuario,
    VereditoAprendizadoIa,
    obter_banco,
)
from app.shared.security import exigir_inspetor

roteador_learning = APIRouter()


class DadosMarcacaoAprendizadoVisual(BaseModel):
    rotulo: str = Field(default="", max_length=80)
    observacao: str = Field(default="", max_length=300)
    x: float | None = Field(default=None, ge=0, le=1)
    y: float | None = Field(default=None, ge=0, le=1)
    largura: float | None = Field(default=None, ge=0, le=1)
    altura: float | None = Field(default=None, ge=0, le=1)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class DadosRegistrarAprendizadoVisual(BaseModel):
    resumo: str = Field(..., min_length=3, max_length=240)
    descricao_contexto: str = Field(default="", max_length=4000)
    correcao_inspetor: str = Field(..., min_length=3, max_length=4000)
    veredito_inspetor: Literal["conforme", "nao_conforme", "ajuste", "duvida"] = "duvida"
    referencia_mensagem_id: int | None = Field(default=None, ge=1)
    dados_imagem: str = Field(default="", max_length=14_500_000)
    nome_imagem: str = Field(default="", max_length=120)
    pontos_chave: list[str] = Field(default_factory=list, max_length=12)
    referencias_norma: list[str] = Field(default_factory=list, max_length=12)
    marcacoes: list[DadosMarcacaoAprendizadoVisual] = Field(default_factory=list, max_length=12)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")

    @field_validator("veredito_inspetor")
    @classmethod
    def validar_veredito(cls, valor: str) -> str:
        return VereditoAprendizadoIa.normalizar(valor)


def _validar_referencia_mensagem(
    banco: Session,
    *,
    laudo_id: int,
    referencia_mensagem_id: int | None,
) -> None:
    if not referencia_mensagem_id:
        return
    existe = (
        banco.query(MensagemLaudo.id)
        .filter(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.id == referencia_mensagem_id,
        )
        .first()
    )
    if not existe:
        raise HTTPException(status_code=404, detail="Mensagem de referência não encontrada para o aprendizado visual.")


@roteador_learning.get(
    "/api/laudo/{laudo_id}/aprendizados",
    responses={404: {"description": "Laudo não encontrado."}},
)
async def listar_aprendizados_visuais_inspetor(
    laudo_id: int,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    itens = listar_aprendizados_laudo(banco, laudo_id=laudo.id, empresa_id=usuario.empresa_id)
    return {
        "ok": True,
        "laudo_id": laudo.id,
        "itens": [serializar_aprendizado_visual(item) for item in itens],
    }


@roteador_learning.post(
    "/api/laudo/{laudo_id}/aprendizados",
    responses={
        201: {"description": "Aprendizado visual registrado em rascunho."},
        404: {"description": "Laudo ou mensagem de referência não encontrados."},
    },
)
async def registrar_aprendizado_visual_inspetor(
    laudo_id: int,
    dados: DadosRegistrarAprendizadoVisual,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    _validar_referencia_mensagem(
        banco,
        laudo_id=laudo.id,
        referencia_mensagem_id=dados.referencia_mensagem_id,
    )

    evidencia = salvar_evidencia_aprendizado_visual(
        empresa_id=usuario.empresa_id,
        laudo_id=laudo.id,
        dados_imagem=dados.dados_imagem,
        nome_imagem=dados.nome_imagem,
    )
    item = AprendizadoVisualIa(
        empresa_id=usuario.empresa_id,
        laudo_id=laudo.id,
        mensagem_referencia_id=dados.referencia_mensagem_id,
        criado_por_id=usuario.id,
        setor_industrial=str(laudo.setor_industrial or "geral"),
        resumo=str(dados.resumo or "").strip(),
        descricao_contexto=str(dados.descricao_contexto or "").strip() or None,
        correcao_inspetor=str(dados.correcao_inspetor or "").strip(),
        veredito_inspetor=dados.veredito_inspetor,
        pontos_chave_json=normalizar_lista_textos(dados.pontos_chave),
        referencias_norma_json=normalizar_lista_textos(dados.referencias_norma),
        marcacoes_json=normalizar_marcacoes_aprendizado(
            [item.model_dump() for item in dados.marcacoes]
        ),
        **evidencia,
    )
    banco.add(item)
    banco.flush()
    banco.commit()
    banco.refresh(item)

    return JSONResponse(
        {
            "ok": True,
            "aprendizado": serializar_aprendizado_visual(item),
        },
        status_code=201,
    )


__all__ = [
    "DadosMarcacaoAprendizadoVisual",
    "DadosRegistrarAprendizadoVisual",
    "listar_aprendizados_visuais_inspetor",
    "registrar_aprendizado_visual_inspetor",
    "roteador_learning",
]
