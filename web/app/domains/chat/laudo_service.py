"""Serviços neutros do ciclo de laudo do portal inspetor."""

from __future__ import annotations

import uuid
from typing import Any, TypeAlias

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.domains.chat.app_context import logger
from app.domains.chat.chat_runtime import MODO_DETALHADO
from app.domains.chat.core_helpers import agora_utc
from app.domains.chat.gate_helpers import (
    avaliar_gate_qualidade_laudo,
    garantir_gate_qualidade_laudo,
)
from app.domains.chat.ia_runtime import obter_cliente_ia_ativo
from app.domains.chat.laudo_access_helpers import obter_laudo_do_inspetor
from app.domains.chat.laudo_state_helpers import (
    laudo_permite_reabrir,
    laudo_tem_interacao,
    serializar_card_laudo,
)
from app.domains.chat.limits_helpers import garantir_limite_laudos
from app.domains.chat.normalization import (
    ALIASES_TEMPLATE,
    nome_template_humano,
    normalizar_tipo_template,
)
from app.domains.chat.session_helpers import (
    aplicar_contexto_laudo_selecionado,
    estado_relatorio_sanitizado,
)
from app.domains.chat.templates_ai import RelatorioCBMGO
from app.shared.database import (
    Laudo,
    MensagemLaudo,
    StatusRevisao,
    TipoMensagem,
    Usuario,
)

PayloadJson: TypeAlias = dict[str, Any]
ResultadoJson: TypeAlias = tuple[PayloadJson, int]

RESPOSTA_LAUDO_NAO_ENCONTRADO = {404: {"description": "Laudo não encontrado."}}
RESPOSTA_GATE_QUALIDADE_REPROVADO = {
    422: {
        "description": "Gate de qualidade reprovado.",
        "content": {"application/json": {"schema": {"type": "object"}}},
    }
}


async def _resolver_tipo_template_bruto(
    *,
    request: Request,
    tipo_template: str | None,
    tipotemplate: str | None,
) -> str:
    tipo_template_bruto = (tipo_template or tipotemplate or "").strip().lower()

    if not tipo_template_bruto:
        payload_json: PayloadJson = {}
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

    return tipo_template_bruto or "padrao"


async def obter_status_relatorio_resposta(
    *,
    request: Request,
    usuario: Usuario,
    banco: Session,
) -> ResultadoJson:
    payload = estado_relatorio_sanitizado(
        request,
        banco,
        usuario,
        mutar_sessao=False,
    )

    laudo_card = None
    laudo_id = payload.get("laudo_id")
    if laudo_id:
        laudo = obter_laudo_do_inspetor(banco, int(laudo_id), usuario)
        if laudo_tem_interacao(banco, laudo.id) or laudo.status_revisao != StatusRevisao.RASCUNHO.value:
            laudo_card = serializar_card_laudo(banco, laudo)

    return (
        {
            **payload,
            "laudo_card": laudo_card,
        },
        200,
    )


async def iniciar_relatorio_resposta(
    *,
    request: Request,
    tipo_template: str | None,
    tipotemplate: str | None,
    usuario: Usuario,
    banco: Session,
) -> ResultadoJson:
    tipo_template_bruto = await _resolver_tipo_template_bruto(
        request=request,
        tipo_template=tipo_template,
        tipotemplate=tipotemplate,
    )

    if tipo_template_bruto not in ALIASES_TEMPLATE:
        raise HTTPException(status_code=400, detail="Tipo de relatório inválido.")

    tipo_template_normalizado = normalizar_tipo_template(tipo_template_bruto)

    garantir_limite_laudos(usuario, banco)

    laudo = Laudo(
        empresa_id=usuario.empresa_id,
        usuario_id=usuario.id,
        tipo_template=tipo_template_normalizado,
        status_revisao=StatusRevisao.RASCUNHO.value,
        setor_industrial=nome_template_humano(tipo_template_normalizado),
        primeira_mensagem=None,
        modo_resposta=MODO_DETALHADO,
        codigo_hash=uuid.uuid4().hex,
        is_deep_research=False,
    )

    banco.add(laudo)
    banco.flush()
    banco.refresh(laudo)

    aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)

    logger.info(
        "Relatório iniciado | usuario_id=%s | tipo=%s | laudo_id=%s",
        usuario.id,
        tipo_template_normalizado,
        laudo.id,
    )

    return (
        {
            "success": True,
            "laudo_id": laudo.id,
            "hash": laudo.codigo_hash[-6:],
            "message": f"✅ Inspeção {nome_template_humano(tipo_template_normalizado)} criada. Envie a primeira mensagem para iniciar o laudo.",
            "estado": "sem_relatorio",
            "tipo_template": tipo_template_normalizado,
        },
        200,
    )


async def finalizar_relatorio_resposta(
    *,
    laudo_id: int,
    request: Request,
    usuario: Usuario,
    banco: Session,
) -> ResultadoJson:
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
    laudo.encerrado_pelo_inspetor_em = agora_utc()
    laudo.reabertura_pendente_em = None
    laudo.atualizado_em = agora_utc()
    banco.flush()
    contexto = aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)

    logger.info("Relatório finalizado | usuario_id=%s | laudo_id=%s", usuario.id, laudo_id)

    return (
        {
            "success": True,
            "message": "✅ Relatório enviado para engenharia! Já aparece na Mesa de Avaliação.",
            "laudo_id": laudo.id,
            "estado": contexto["estado"],
            "permite_reabrir": contexto["permite_reabrir"],
            "laudo_card": serializar_card_laudo(banco, laudo),
        },
        200,
    )


def obter_gate_qualidade_laudo_resposta(
    *,
    laudo_id: int,
    usuario: Usuario,
    banco: Session,
) -> ResultadoJson:
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)
    resultado = avaliar_gate_qualidade_laudo(banco, laudo)

    status_http = 200 if bool(resultado.get("aprovado", False)) else 422
    return resultado, status_http


async def reabrir_laudo_resposta(
    *,
    laudo_id: int,
    request: Request,
    usuario: Usuario,
    banco: Session,
) -> ResultadoJson:
    laudo = obter_laudo_do_inspetor(banco, laudo_id, usuario)

    if not laudo_permite_reabrir(banco, laudo):
        raise HTTPException(
            status_code=400,
            detail="Este laudo ainda não possui ajustes liberados para reabertura.",
        )

    laudo.status_revisao = StatusRevisao.RASCUNHO.value
    laudo.reaberto_em = agora_utc()
    laudo.reabertura_pendente_em = None
    laudo.atualizado_em = agora_utc()
    banco.flush()

    contexto = aplicar_contexto_laudo_selecionado(request, banco, laudo, usuario)

    return (
        {
            "success": True,
            "message": "Inspeção reaberta. Você já pode continuar o laudo.",
            "laudo_id": laudo.id,
            "estado": contexto["estado"],
            "permite_reabrir": contexto["permite_reabrir"],
            "laudo_card": serializar_card_laudo(banco, laudo),
        },
        200,
    )


__all__ = [
    "RESPOSTA_GATE_QUALIDADE_REPROVADO",
    "RESPOSTA_LAUDO_NAO_ENCONTRADO",
    "ResultadoJson",
    "finalizar_relatorio_resposta",
    "iniciar_relatorio_resposta",
    "obter_gate_qualidade_laudo_resposta",
    "obter_status_relatorio_resposta",
    "reabrir_laudo_resposta",
]
