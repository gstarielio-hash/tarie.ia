"""Rotas de ciclo de laudo (inspetor)."""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import Depends, Form, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRouter
from sqlalchemy.orm import Session

from app.domains.chat.core_helpers import agora_utc, resposta_json_ok
from app.domains.chat.laudo_access_helpers import obter_laudo_do_inspetor
from app.domains.chat.laudo_service import (
    RESPOSTA_GATE_QUALIDADE_REPROVADO,
    RESPOSTA_LAUDO_NAO_ENCONTRADO,
    finalizar_relatorio_resposta,
    iniciar_relatorio_resposta,
    obter_gate_qualidade_laudo_resposta,
    obter_status_relatorio_resposta,
    reabrir_laudo_resposta,
)
from app.domains.chat.normalization import ALIASES_TEMPLATE
from app.domains.chat.request_parsing_helpers import InteiroOpcionalNullish
from app.domains.chat.revisao_helpers import (
    _gerar_diff_revisoes,
    _obter_revisao_por_versao,
    _resumo_diff_revisoes,
    _serializar_revisao_laudo,
)
from app.domains.chat.session_helpers import (
    exigir_csrf,
    laudo_id_sessao,
)
from app.domains.chat.schemas import DadosPin
from app.domains.chat.auth import pagina_inicial, pagina_planos
from app.shared.database import (
    Laudo,
    LaudoRevisao,
    StatusRevisao,
    Usuario,
    obter_banco,
)
from app.shared.security import exigir_inspetor

PADRAO_TIPO_TEMPLATE_FORM = "^(?:" + "|".join(re.escape(item) for item in sorted(ALIASES_TEMPLATE)) + ")$"


async def api_status_relatorio(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    payload, status_code = await obter_status_relatorio_resposta(
        request=request,
        usuario=usuario,
        banco=banco,
    )
    return resposta_json_ok(payload, status_code=status_code)


async def api_status_relatorio_delete_nao_suportado(
    usuario: Usuario = Depends(exigir_inspetor),
):
    raise HTTPException(
        status_code=405,
        detail="Method Not Allowed",
        headers={"Allow": "GET"},
    )


async def api_rota_laudo_post_nao_suportado(
    usuario: Usuario = Depends(exigir_inspetor),
):
    raise HTTPException(
        status_code=405,
        detail="Method Not Allowed",
        headers={"Allow": "POST"},
    )


async def api_iniciar_relatorio(
    request: Request,
    tipo_template: str | None = Form(default=None),
    tipotemplate: str | None = Form(default=None),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)
    payload, status_code = await iniciar_relatorio_resposta(
        request=request,
        tipo_template=tipo_template,
        tipotemplate=tipotemplate,
        usuario=usuario,
        banco=banco,
    )
    return resposta_json_ok(payload, status_code=status_code)


async def api_finalizar_relatorio(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)
    payload, status_code = await finalizar_relatorio_resposta(
        laudo_id=laudo_id,
        request=request,
        usuario=usuario,
        banco=banco,
    )
    return resposta_json_ok(payload, status_code=status_code)


async def api_obter_gate_qualidade_laudo(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)
    payload, status_code = obter_gate_qualidade_laudo_resposta(
        laudo_id=laudo_id,
        usuario=usuario,
        banco=banco,
    )
    return JSONResponse(payload, status_code=status_code)


async def api_reabrir_laudo(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)
    payload, status_code = await reabrir_laudo_resposta(
        laudo_id=laudo_id,
        request=request,
        usuario=usuario,
        banco=banco,
    )
    return resposta_json_ok(payload, status_code=status_code)


async def api_cancelar_relatorio(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    laudo_id = laudo_id_sessao(request)
    if laudo_id:
        laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)

        if laudo.status_revisao != StatusRevisao.RASCUNHO.value:
            raise HTTPException(
                status_code=400,
                detail="Apenas relatórios em rascunho podem ser cancelados.",
            )

        banco.delete(laudo)
        banco.flush()

    request.session.pop("laudo_ativo_id", None)
    request.session["estado_relatorio"] = "sem_relatorio"

    return resposta_json_ok({"success": True, "message": "❌ Relatório cancelado"})


async def api_desativar_relatorio_ativo(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    """
    Remove apenas o contexto de "laudo ativo" da sessão.
    Não exclui o laudo em rascunho do banco.
    """
    exigir_csrf(request)

    laudo_id_atual = laudo_id_sessao(request)
    laudo_existente = False

    if laudo_id_atual:
        laudo_existente = bool(
            banco.query(Laudo)
            .filter(
                Laudo.id == laudo_id_atual,
                Laudo.empresa_id == usuario.empresa_id,
                Laudo.usuario_id == usuario.id,
            )
            .first()
        )

    request.session.pop("laudo_ativo_id", None)
    request.session["estado_relatorio"] = "sem_relatorio"

    return resposta_json_ok(
        {
            "success": True,
            "message": "Sessão ativa removida da central.",
            "laudo_id": int(laudo_id_atual) if laudo_id_atual else None,
            "laudo_preservado": laudo_existente,
        }
    )


async def listar_revisoes_laudo(
    laudo_id: int,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    revisoes = banco.query(LaudoRevisao).filter(LaudoRevisao.laudo_id == laudo_id).order_by(LaudoRevisao.numero_versao.asc(), LaudoRevisao.id.asc()).all()

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
    base: Annotated[InteiroOpcionalNullish, Query()] = None,
    comparar: Annotated[InteiroOpcionalNullish, Query()] = None,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _ = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    revisoes_desc = (
        banco.query(LaudoRevisao).filter(LaudoRevisao.laudo_id == laudo_id).order_by(LaudoRevisao.numero_versao.desc(), LaudoRevisao.id.desc()).all()
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
    banco.flush()

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
    banco.flush()

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
    "/api/laudo/status",
    api_status_relatorio_delete_nao_suportado,
    methods=["DELETE"],
    include_in_schema=False,
)
roteador_laudo.add_api_route(
    "/api/laudo/iniciar",
    api_iniciar_relatorio,
    methods=["POST"],
    responses={**RESPOSTA_LAUDO_NAO_ENCONTRADO, 400: {"description": "Requisição inválida."}},
)
roteador_laudo.add_api_route(
    "/api/laudo/iniciar",
    api_rota_laudo_post_nao_suportado,
    methods=["DELETE"],
    include_in_schema=False,
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/finalizar",
    api_finalizar_relatorio,
    methods=["POST"],
    responses={
        **RESPOSTA_LAUDO_NAO_ENCONTRADO,
        400: {"description": "Laudo em estado inválido para finalização."},
        **RESPOSTA_GATE_QUALIDADE_REPROVADO,
    },
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/gate-qualidade",
    api_obter_gate_qualidade_laudo,
    methods=["GET"],
    responses={**RESPOSTA_LAUDO_NAO_ENCONTRADO, **RESPOSTA_GATE_QUALIDADE_REPROVADO},
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/reabrir",
    api_reabrir_laudo,
    methods=["POST"],
    responses={
        **RESPOSTA_LAUDO_NAO_ENCONTRADO,
        400: {"description": "Laudo sem ajustes liberados para reabertura."},
    },
)
roteador_laudo.add_api_route(
    "/api/laudo/cancelar",
    api_cancelar_relatorio,
    methods=["POST"],
    responses={400: {"description": "Requisição inválida."}},
)
roteador_laudo.add_api_route(
    "/api/laudo/cancelar",
    api_rota_laudo_post_nao_suportado,
    methods=["DELETE"],
    include_in_schema=False,
)
roteador_laudo.add_api_route(
    "/api/laudo/desativar",
    api_desativar_relatorio_ativo,
    methods=["POST"],
    responses={400: {"description": "Requisição inválida."}},
)
roteador_laudo.add_api_route(
    "/api/laudo/desativar",
    api_rota_laudo_post_nao_suportado,
    methods=["DELETE"],
    include_in_schema=False,
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/revisoes",
    listar_revisoes_laudo,
    methods=["GET"],
    responses=RESPOSTA_LAUDO_NAO_ENCONTRADO,
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/revisoes/diff",
    obter_diff_revisoes_laudo,
    methods=["GET"],
    responses=RESPOSTA_LAUDO_NAO_ENCONTRADO,
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/pin",
    rota_pin_laudo,
    methods=["PATCH"],
    responses=RESPOSTA_LAUDO_NAO_ENCONTRADO,
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}",
    rota_deletar_laudo,
    methods=["DELETE"],
    responses={
        **RESPOSTA_LAUDO_NAO_ENCONTRADO,
        400: {"description": "Laudo em estado inválido para exclusão."},
    },
)

__all__ = [
    "roteador_laudo",
    "api_status_relatorio",
    "api_iniciar_relatorio",
    "api_finalizar_relatorio",
    "api_obter_gate_qualidade_laudo",
    "api_gate_qualidade_laudo",
    "api_reabrir_laudo",
    "api_cancelar_relatorio",
    "api_desativar_relatorio_ativo",
    "listar_revisoes_laudo",
    "obter_diff_revisoes_laudo",
    "pinar_laudo",
    "excluir_laudo",
    "pagina_inicial",
    "pagina_planos",
]
