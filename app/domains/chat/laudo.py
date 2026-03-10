"""Rotas de ciclo de laudo (inspetor)."""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.routing import APIRouter
from sqlalchemy.orm import Session

from app.domains.chat.schemas import DadosPin
from app.domains.chat.routes import (
    _gerar_diff_revisoes,
    _obter_revisao_por_versao,
    _resumo_diff_revisoes,
    _serializar_revisao_laudo,
    agora_utc,
    api_cancelar_relatorio,
    api_desativar_relatorio_ativo,
    api_finalizar_relatorio,
    api_iniciar_relatorio,
    api_obter_gate_qualidade_laudo,
    api_status_relatorio,
    exigir_csrf,
    laudo_id_sessao,
    obter_laudo_do_inspetor,
    resposta_json_ok,
)
from app.domains.chat.auth import pagina_inicial, pagina_planos
from app.shared.database import LaudoRevisao, StatusRevisao, Usuario, obter_banco
from app.shared.security import exigir_inspetor


async def listar_revisoes_laudo(
    laudo_id: int,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    revisoes = (
        banco.query(LaudoRevisao)
        .filter(LaudoRevisao.laudo_id == laudo_id)
        .order_by(LaudoRevisao.numero_versao.asc(), LaudoRevisao.id.asc())
        .all()
    )

    ultima = revisoes[-1] if revisoes else None
    return resposta_json_ok(
        {
            "laudo_id": laudo_id,
            "total_revisoes": len(revisoes),
            "ultima_versao": int(ultima.numero_versao) if ultima else None,
            "revisoes": [_serializar_revisao_laudo(item) for item in revisoes],
        }
    )


async def obter_diff_revisoes_laudo(
    laudo_id: int,
    base: Optional[int] = None,
    comparar: Optional[int] = None,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    revisoes_desc = (
        banco.query(LaudoRevisao)
        .filter(LaudoRevisao.laudo_id == laudo_id)
        .order_by(LaudoRevisao.numero_versao.desc(), LaudoRevisao.id.desc())
        .all()
    )
    if len(revisoes_desc) < 2:
        raise HTTPException(
            status_code=400,
            detail="É necessário ao menos duas versões para comparar o diff.",
        )

    if base is None and comparar is None:
        revisar_comparar = revisoes_desc[0]
        revisao_base = revisoes_desc[1]
    else:
        versao_base = int(base or 0)
        versao_comparar = int(comparar or 0)
        if versao_base <= 0 or versao_comparar <= 0:
            raise HTTPException(status_code=400, detail="Informe versões positivas para base e comparar.")
        if versao_base == versao_comparar:
            raise HTTPException(status_code=400, detail="As versões base e comparar precisam ser diferentes.")

        revisao_base = _obter_revisao_por_versao(banco, laudo_id, versao_base)
        revisar_comparar = _obter_revisao_por_versao(banco, laudo_id, versao_comparar)
        if not revisao_base or not revisar_comparar:
            raise HTTPException(status_code=404, detail="Versão de revisão não encontrada.")

    diff_texto = _gerar_diff_revisoes(revisao_base.conteudo or "", revisar_comparar.conteudo or "")
    resumo_diff = _resumo_diff_revisoes(diff_texto)

    return resposta_json_ok(
        {
            "laudo_id": laudo_id,
            "base": _serializar_revisao_laudo(revisao_base),
            "comparar": _serializar_revisao_laudo(revisar_comparar),
            "resumo_diff": resumo_diff,
            "diff_unificado": diff_texto,
        }
    )


async def rota_pin_laudo(
    laudo_id: int,
    request: Request,
    dados: DadosPin,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    laudo.pinado = dados.pinado
    laudo.pinado_em = agora_utc() if dados.pinado else None
    laudo.atualizado_em = agora_utc()
    banco.commit()

    return resposta_json_ok(
        {
            "pinado": laudo.pinado,
            "pinado_em": laudo.pinado_em.isoformat() if laudo.pinado_em else None,
        }
    )


async def rota_deletar_laudo(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    if laudo.status_revisao in (
        StatusRevisao.AGUARDANDO.value,
        StatusRevisao.APROVADO.value,
    ):
        raise HTTPException(
            status_code=400,
            detail="Esse laudo não pode ser excluído no estado atual.",
        )

    if laudo_id_sessao(request) == laudo_id:
        request.session.pop("laudo_ativo_id", None)
        request.session["estado_relatorio"] = "sem_relatorio"

    banco.delete(laudo)
    banco.commit()

    return resposta_json_ok({"ok": True})

pinar_laudo = rota_pin_laudo
excluir_laudo = rota_deletar_laudo
api_gate_qualidade_laudo = api_obter_gate_qualidade_laudo

roteador_laudo = APIRouter()

roteador_laudo.add_api_route(
    "/api/laudo/status",
    api_status_relatorio,
    methods=["GET"],
)
roteador_laudo.add_api_route(
    "/api/laudo/iniciar",
    api_iniciar_relatorio,
    methods=["POST"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/finalizar",
    api_finalizar_relatorio,
    methods=["POST"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/gate-qualidade",
    api_obter_gate_qualidade_laudo,
    methods=["GET"],
)
roteador_laudo.add_api_route(
    "/api/laudo/cancelar",
    api_cancelar_relatorio,
    methods=["POST"],
)
roteador_laudo.add_api_route(
    "/api/laudo/desativar",
    api_desativar_relatorio_ativo,
    methods=["POST"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/revisoes",
    listar_revisoes_laudo,
    methods=["GET"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/revisoes/diff",
    obter_diff_revisoes_laudo,
    methods=["GET"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/pin",
    rota_pin_laudo,
    methods=["PATCH"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}",
    rota_deletar_laudo,
    methods=["DELETE"],
)

__all__ = [
    "roteador_laudo",
    "api_status_relatorio",
    "api_iniciar_relatorio",
    "api_finalizar_relatorio",
    "api_obter_gate_qualidade_laudo",
    "api_gate_qualidade_laudo",
    "api_cancelar_relatorio",
    "api_desativar_relatorio_ativo",
    "listar_revisoes_laudo",
    "obter_diff_revisoes_laudo",
    "pinar_laudo",
    "excluir_laudo",
    "pagina_inicial",
    "pagina_planos",
]
