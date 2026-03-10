"""Rotas de ciclo de laudo (inspetor)."""

from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import Depends, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRouter
from sqlalchemy.orm import Session

from app.domains.chat.schemas import DadosPin
from app.domains.chat.templates_ai import RelatorioCBMGO
from app.domains.chat.routes import (
    ALIASES_TEMPLATE,
    MODO_DETALHADO,
    _gerar_diff_revisoes,
    _obter_revisao_por_versao,
    _resumo_diff_revisoes,
    _serializar_revisao_laudo,
    agora_utc,
    avaliar_gate_qualidade_laudo,
    exigir_csrf,
    garantir_gate_qualidade_laudo,
    garantir_limite_laudos,
    laudo_id_sessao,
    logger,
    nome_template_humano,
    normalizar_tipo_template,
    obter_cliente_ia_ativo,
    obter_laudo_do_inspetor,
    resposta_json_ok,
    estado_relatorio_sanitizado,
)
from app.domains.chat.auth import pagina_inicial, pagina_planos
from app.shared.database import (
    Laudo,
    LaudoRevisao,
    MensagemLaudo,
    StatusRevisao,
    TipoMensagem,
    Usuario,
    obter_banco,
)
from app.shared.security import exigir_inspetor


async def api_status_relatorio(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    return resposta_json_ok(estado_relatorio_sanitizado(request, banco, usuario))


async def api_iniciar_relatorio(
    request: Request,
    tipo_template: str | None = Form(default=None),
    tipotemplate: str | None = Form(default=None),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    tipo_template_bruto = (tipo_template or tipotemplate or "").strip().lower()

    if not tipo_template_bruto:
        payload_json: dict[str, Any] = {}
        try:
            payload_json = await request.json()
        except Exception:
            payload_json = {}

        tipo_template_bruto = str(
            payload_json.get("tipo_template")
            or payload_json.get("tipotemplate")
            or payload_json.get("template")
            or ""
        ).strip().lower()

    if not tipo_template_bruto:
        raise HTTPException(status_code=400, detail="Tipo de relatório não informado.")

    if tipo_template_bruto not in ALIASES_TEMPLATE:
        raise HTTPException(status_code=400, detail="Tipo de relatório inválido.")

    tipo_template_normalizado = normalizar_tipo_template(tipo_template_bruto)

    garantir_limite_laudos(usuario, banco)

    laudo_id_ativo = laudo_id_sessao(request)
    if laudo_id_ativo:
        laudo_ativo = (
            banco.query(Laudo)
            .filter(
                Laudo.id == laudo_id_ativo,
                Laudo.empresa_id == usuario.empresa_id,
                Laudo.usuario_id == usuario.id,
                Laudo.status_revisao == StatusRevisao.RASCUNHO.value,
            )
            .first()
        )
        if laudo_ativo:
            return resposta_json_ok(
                {
                    "success": True,
                    "laudo_id": laudo_ativo.id,
                    "hash": laudo_ativo.codigo_hash[-6:],
                    "message": "Já existe um relatório ativo em andamento.",
                    "estado": "relatorio_ativo",
                    "tipo_template": laudo_ativo.tipo_template,
                }
            )

    laudo = Laudo(
        empresa_id=usuario.empresa_id,
        usuario_id=usuario.id,
        tipo_template=tipo_template_normalizado,
        status_revisao=StatusRevisao.RASCUNHO.value,
        setor_industrial=nome_template_humano(tipo_template_normalizado),
        primeira_mensagem=f"Relatório {tipo_template_normalizado.upper()} iniciado",
        modo_resposta=MODO_DETALHADO,
        codigo_hash=uuid.uuid4().hex,
        is_deep_research=False,
    )

    banco.add(laudo)
    banco.commit()
    banco.refresh(laudo)

    request.session["laudo_ativo_id"] = laudo.id
    request.session["estado_relatorio"] = "relatorio_ativo"

    logger.info(
        "Relatório iniciado | usuario_id=%s | tipo=%s | laudo_id=%s",
        usuario.id,
        tipo_template_normalizado,
        laudo.id,
    )

    return resposta_json_ok(
        {
            "success": True,
            "laudo_id": laudo.id,
            "hash": laudo.codigo_hash[-6:],
            "message": f"✅ Relatório {nome_template_humano(tipo_template_normalizado)} iniciado!",
            "estado": "relatorio_ativo",
            "tipo_template": tipo_template_normalizado,
        }
    )


async def api_finalizar_relatorio(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    if laudo.status_revisao != StatusRevisao.RASCUNHO.value:
        raise HTTPException(status_code=400, detail="Laudo já foi enviado ou finalizado.")

    if laudo.tipo_template == "cbmgo" and not laudo.dados_formulario:
        try:
            mensagens = (
                banco.query(MensagemLaudo)
                .filter(MensagemLaudo.laudo_id == laudo_id)
                .order_by(MensagemLaudo.criado_em.asc())
                .all()
            )

            historico = [
                {
                    "papel": "usuario" if m.tipo == TipoMensagem.USER.value else "assistente",
                    "texto": m.conteudo,
                }
                for m in mensagens
                if m.tipo in (TipoMensagem.USER.value, TipoMensagem.IA.value)
            ]

            cliente_ia_ativo = obter_cliente_ia_ativo()
            dados_json = await cliente_ia_ativo.gerar_json_estruturado(
                schema_pydantic=RelatorioCBMGO,
                historico=historico,
                dados_imagem="",
                texto_documento="",
            )
            laudo.dados_formulario = dados_json
        except Exception:
            logger.warning(
                "Falha ao gerar JSON estruturado CBM-GO na finalização | laudo_id=%s",
                laudo_id,
                exc_info=True,
            )

    garantir_gate_qualidade_laudo(banco, laudo)

    laudo.status_revisao = StatusRevisao.AGUARDANDO.value
    laudo.atualizado_em = agora_utc()
    banco.commit()

    if laudo_id_sessao(request) == laudo.id:
        request.session.pop("laudo_ativo_id", None)
    request.session["estado_relatorio"] = "sem_relatorio"

    logger.info("Relatório finalizado | usuario_id=%s | laudo_id=%s", usuario.id, laudo_id)

    return resposta_json_ok(
        {
            "success": True,
            "message": "✅ Relatório enviado para engenharia! Já aparece na Mesa de Avaliação.",
        }
    )


async def api_obter_gate_qualidade_laudo(
    laudo_id: int,
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    resultado = avaliar_gate_qualidade_laudo(banco, laudo)

    status_http = 200 if bool(resultado.get("aprovado", False)) else 422
    return JSONResponse(resultado, status_code=status_http)


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
        banco.commit()

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
