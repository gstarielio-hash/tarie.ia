from __future__ import annotations

from typing import Literal

from fastapi import Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.domains.chat.core_helpers import agora_utc
from app.domains.chat.learning import DadosMarcacaoAprendizadoVisual
from app.domains.chat.learning_helpers import (
    listar_aprendizados_laudo,
    normalizar_lista_textos,
    normalizar_marcacoes_aprendizado,
    obter_aprendizado_visual,
    serializar_aprendizado_visual,
)
from app.domains.revisor.base import roteador_revisor
from app.domains.revisor.common import _obter_laudo_empresa, _validar_csrf
from app.shared.database import StatusAprendizadoIa, Usuario, VereditoAprendizadoIa, obter_banco
from app.shared.security import exigir_revisor


class DadosValidarAprendizadoVisual(BaseModel):
    acao: Literal["aprovar", "rejeitar"]
    parecer_mesa: str = Field(default="", max_length=4000)
    resumo_final: str = Field(default="", max_length=240)
    sintese_consolidada: str = Field(default="", max_length=4000)
    veredito_mesa: Literal["conforme", "nao_conforme", "ajuste", "duvida"] | None = None
    pontos_chave: list[str] = Field(default_factory=list, max_length=12)
    referencias_norma: list[str] = Field(default_factory=list, max_length=12)
    marcacoes: list[DadosMarcacaoAprendizadoVisual] = Field(default_factory=list, max_length=12)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")

    @field_validator("veredito_mesa")
    @classmethod
    def validar_veredito(cls, valor: str | None) -> str | None:
        if valor in (None, ""):
            return None
        return VereditoAprendizadoIa.normalizar(valor)


@roteador_revisor.get(
    "/api/laudo/{laudo_id}/aprendizados",
    responses={404: {"description": "Laudo não encontrado."}},
)
async def listar_aprendizados_visuais_revisor(
    laudo_id: int,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    laudo = _obter_laudo_empresa(banco, laudo_id, usuario.empresa_id)
    itens = listar_aprendizados_laudo(banco, laudo_id=laudo.id, empresa_id=usuario.empresa_id)
    return {
        "ok": True,
        "laudo_id": laudo.id,
        "itens": [serializar_aprendizado_visual(item) for item in itens],
    }


@roteador_revisor.post(
    "/api/aprendizados/{aprendizado_id}/validar",
    responses={
        200: {"description": "Aprendizado visual atualizado pela mesa."},
        403: {"description": "CSRF inválido."},
        404: {"description": "Aprendizado visual não encontrado."},
    },
)
async def validar_aprendizado_visual_revisor(
    aprendizado_id: int,
    dados: DadosValidarAprendizadoVisual,
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    token = request.headers.get("X-CSRF-Token", "")
    if not _validar_csrf(request, token):
        raise HTTPException(status_code=403, detail="CSRF inválido.")

    item = obter_aprendizado_visual(
        banco,
        aprendizado_id=aprendizado_id,
        empresa_id=usuario.empresa_id,
    )
    _obter_laudo_empresa(banco, item.laudo_id, usuario.empresa_id)

    item.validado_por_id = usuario.id
    item.validado_em = agora_utc()
    item.parecer_mesa = str(dados.parecer_mesa or "").strip() or item.parecer_mesa
    if str(dados.resumo_final or "").strip():
        item.resumo = str(dados.resumo_final).strip()
    if str(dados.sintese_consolidada or "").strip():
        item.sintese_consolidada = str(dados.sintese_consolidada).strip()
    elif item.parecer_mesa and not item.sintese_consolidada:
        item.sintese_consolidada = item.parecer_mesa
    if dados.veredito_mesa:
        item.veredito_mesa = dados.veredito_mesa
    if dados.pontos_chave:
        item.pontos_chave_json = normalizar_lista_textos(dados.pontos_chave)
    if dados.referencias_norma:
        item.referencias_norma_json = normalizar_lista_textos(dados.referencias_norma)
    if dados.marcacoes:
        item.marcacoes_json = normalizar_marcacoes_aprendizado(
            [marcacao.model_dump() for marcacao in dados.marcacoes]
        )

    item.status = (
        StatusAprendizadoIa.VALIDADO_MESA.value
        if dados.acao == "aprovar"
        else StatusAprendizadoIa.REJEITADO_MESA.value
    )
    banco.flush()
    banco.refresh(item)

    return JSONResponse(
        {
            "ok": True,
            "aprendizado": serializar_aprendizado_visual(item),
        }
    )


__all__ = [
    "DadosValidarAprendizadoVisual",
    "listar_aprendizados_visuais_revisor",
    "validar_aprendizado_visual_revisor",
]
