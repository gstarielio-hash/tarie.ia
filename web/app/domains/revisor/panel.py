from __future__ import annotations

from typing import Any

from fastapi import Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.domains.mesa.attachments import resumo_mensagem_mesa
from app.domains.revisor.base import (
    _contar_mensagens_nao_lidas_por_laudo,
    _minutos_em_campo,
    _normalizar_termo_busca,
    _resumo_tempo_em_campo,
    roteador_revisor,
    templates,
)
from app.domains.revisor.common import _contexto_base
from app.shared.database import (
    AprendizadoVisualIa,
    Laudo,
    MensagemLaudo,
    NivelAcesso,
    StatusAprendizadoIa,
    StatusRevisao,
    TipoMensagem,
    Usuario,
    obter_banco,
)
from app.shared.security import exigir_revisor


def _contar_aprendizados_pendentes_por_laudo(
    banco: Session,
    *,
    laudo_ids: list[int],
) -> dict[int, int]:
    ids_normalizados = sorted({int(item) for item in laudo_ids if int(item) > 0})
    if not ids_normalizados:
        return {}

    registros = (
        banco.query(
            AprendizadoVisualIa.laudo_id,
            func.count(AprendizadoVisualIa.id),
        )
        .filter(
            AprendizadoVisualIa.laudo_id.in_(ids_normalizados),
            AprendizadoVisualIa.status == StatusAprendizadoIa.RASCUNHO_INSPETOR.value,
        )
        .group_by(AprendizadoVisualIa.laudo_id)
        .all()
    )
    return {
        int(laudo_id): int(total or 0)
        for laudo_id, total in registros
    }


def _classificar_fluxo_operacional(
    *,
    status_revisao: str,
    whispers_nao_lidos: int,
    pendencias_abertas: int,
    aprendizados_pendentes: int,
    tempo_em_campo_status: str = "",
) -> dict[str, str]:
    status = str(status_revisao or "").strip()
    sla = str(tempo_em_campo_status or "").strip()
    whispers = max(0, int(whispers_nao_lidos or 0))
    pendencias = max(0, int(pendencias_abertas or 0))
    aprendizados = max(0, int(aprendizados_pendentes or 0))

    if whispers > 0:
        return {
            "fila_operacional": "responder_agora",
            "fila_operacional_label": "Responder agora",
            "proxima_acao": "Responder inspetor",
            "prioridade_operacional": "critica",
            "prioridade_operacional_label": "Crítica",
            "resumo_operacional": "Whisper novo aguardando retorno técnico da mesa.",
        }
    if aprendizados > 0:
        return {
            "fila_operacional": "validar_aprendizado",
            "fila_operacional_label": "Validar aprendizado",
            "proxima_acao": "Validar aprendizado",
            "prioridade_operacional": "alta",
            "prioridade_operacional_label": "Alta",
            "resumo_operacional": "Há correções do campo aguardando validação final da mesa.",
        }
    if pendencias > 0:
        return {
            "fila_operacional": "aguardando_inspetor",
            "fila_operacional_label": "Aguardando campo",
            "proxima_acao": "Cobrar retorno do campo",
            "prioridade_operacional": "alta" if sla == "sla-critico" else "media",
            "prioridade_operacional_label": "Alta" if sla == "sla-critico" else "Média",
            "resumo_operacional": "A mesa já provocou o campo e ainda aguarda retorno do inspetor.",
        }
    if status == StatusRevisao.AGUARDANDO.value:
        return {
            "fila_operacional": "fechamento_mesa",
            "fila_operacional_label": "Fechamento",
            "proxima_acao": "Fechar revisão",
            "prioridade_operacional": "media",
            "prioridade_operacional_label": "Média",
            "resumo_operacional": "Laudo pronto para revisão final e decisão da mesa.",
        }
    if status == StatusRevisao.RASCUNHO.value:
        return {
            "fila_operacional": "acompanhamento",
            "fila_operacional_label": "Acompanhamento",
            "proxima_acao": "Acompanhar campo",
            "prioridade_operacional": "alta" if sla == "sla-critico" else "media" if sla == "sla-atencao" else "baixa",
            "prioridade_operacional_label": "Alta" if sla == "sla-critico" else "Média" if sla == "sla-atencao" else "Baixa",
            "resumo_operacional": "Fluxo em campo sem bloqueios abertos neste momento.",
        }
    return {
        "fila_operacional": "historico",
        "fila_operacional_label": "Histórico",
        "proxima_acao": "Consultar histórico",
        "prioridade_operacional": "baixa",
        "prioridade_operacional_label": "Baixa",
        "resumo_operacional": "Laudo finalizado, mantido como referência de consulta.",
    }


def _prioridade_fluxo_valor(valor: str) -> int:
    mapa = {
        "critica": 0,
        "alta": 1,
        "media": 2,
        "baixa": 3,
    }
    return mapa.get(str(valor or "").strip().lower(), 9)


@roteador_revisor.get("/painel", response_class=HTMLResponse)
async def painel_revisor(
    request: Request,
    usuario: Usuario = Depends(exigir_revisor),
    banco: Session = Depends(obter_banco),
):
    inspetores_empresa = (
        banco.query(Usuario)
        .filter(
            Usuario.empresa_id == usuario.empresa_id,
            Usuario.nivel_acesso == int(NivelAcesso.INSPETOR),
            Usuario.ativo.is_(True),
        )
        .order_by(Usuario.nome_completo.asc(), Usuario.id.asc())
        .all()
    )

    filtro_inspetor_id: int | None = None
    valor_filtro_bruto = (request.query_params.get("inspetor") or "").strip()
    if valor_filtro_bruto:
        try:
            valor_filtro = int(valor_filtro_bruto)
            if valor_filtro > 0:
                ids_inspetores = {item.id for item in inspetores_empresa}
                if valor_filtro in ids_inspetores:
                    filtro_inspetor_id = valor_filtro
        except ValueError:
            filtro_inspetor_id = None

    filtros_laudo: list[Any] = [Laudo.empresa_id == usuario.empresa_id]
    if filtro_inspetor_id is not None:
        filtros_laudo.append(Laudo.usuario_id == filtro_inspetor_id)

    filtro_busca = _normalizar_termo_busca(request.query_params.get("q") or "")
    if filtro_busca:
        padrao = f"%{filtro_busca}%"
        filtros_laudo.append(
            or_(
                Laudo.codigo_hash.ilike(padrao),
                Laudo.primeira_mensagem.ilike(padrao),
                Laudo.setor_industrial.ilike(padrao),
                Laudo.tipo_template.ilike(padrao),
            )
        )

    filtro_aprendizados = (request.query_params.get("aprendizados") or "").strip().lower()
    if filtro_aprendizados in {"pendentes", "1", "true", "sim"}:
        filtro_aprendizados = "pendentes"
        filtros_laudo.append(
            Laudo.aprendizados_visuais_ia.any(
                AprendizadoVisualIa.status == StatusAprendizadoIa.RASCUNHO_INSPETOR.value,
            )
        )
    else:
        filtro_aprendizados = ""

    filtro_operacao = (request.query_params.get("operacao") or "").strip().lower()
    operacoes_validas = {
        "responder_agora",
        "validar_aprendizado",
        "aguardando_inspetor",
        "fechamento_mesa",
        "acompanhamento",
    }
    if filtro_operacao not in operacoes_validas:
        filtro_operacao = ""

    whispers_pendentes_db = (
        banco.query(MensagemLaudo)
        .options(selectinload(MensagemLaudo.anexos_mesa))
        .join(Laudo)
        .filter(
            MensagemLaudo.tipo == TipoMensagem.HUMANO_INSP.value,
            MensagemLaudo.lida.is_(False),
            *filtros_laudo,
            Laudo.status_revisao.in_(
                [
                    StatusRevisao.RASCUNHO.value,
                    StatusRevisao.AGUARDANDO.value,
                ]
            ),
        )
        .order_by(MensagemLaudo.criado_em.desc())
        .limit(10)
        .all()
    )

    whispers_pendentes = [
        {
            "laudo_id": item.laudo_id,
            "hash": (getattr(item.laudo, "codigo_hash", "") or str(item.laudo_id))[-6:],
            "texto": resumo_mensagem_mesa(item.conteudo or "", anexos=getattr(item, "anexos_mesa", None)),
            "timestamp": item.criado_em.isoformat() if item.criado_em else "",
        }
        for item in whispers_pendentes_db
    ]

    laudos_em_andamento = (
        banco.query(Laudo)
        .filter(
            *filtros_laudo,
            Laudo.status_revisao == StatusRevisao.RASCUNHO.value,
        )
        .order_by(Laudo.criado_em.asc().nullsfirst(), Laudo.atualizado_em.asc().nullsfirst())
        .all()
    )

    laudos_pendentes = (
        banco.query(Laudo)
        .filter(
            *filtros_laudo,
            Laudo.status_revisao == StatusRevisao.AGUARDANDO.value,
        )
        .order_by(Laudo.atualizado_em.asc().nullsfirst(), Laudo.criado_em.asc())
        .all()
    )

    laudos_avaliados = (
        banco.query(Laudo)
        .filter(
            *filtros_laudo,
            Laudo.status_revisao.in_(
                [
                    StatusRevisao.APROVADO.value,
                    StatusRevisao.REJEITADO.value,
                ]
            ),
        )
        .order_by(Laudo.atualizado_em.desc().nullslast(), Laudo.criado_em.desc())
        .limit(10)
        .all()
    )

    laudo_ids_metricas = [
        *[int(item.id) for item in laudos_em_andamento],
        *[int(item.id) for item in laudos_pendentes],
        *[int(item.id) for item in laudos_avaliados],
    ]
    whispers_nao_lidos_por_laudo = _contar_mensagens_nao_lidas_por_laudo(
        banco,
        laudo_ids=laudo_ids_metricas,
        tipo=TipoMensagem.HUMANO_INSP,
    )
    pendencias_abertas_por_laudo = _contar_mensagens_nao_lidas_por_laudo(
        banco,
        laudo_ids=laudo_ids_metricas,
        tipo=TipoMensagem.HUMANO_ENG,
    )
    aprendizados_pendentes_por_laudo = _contar_aprendizados_pendentes_por_laudo(
        banco,
        laudo_ids=laudo_ids_metricas,
    )

    def _serializar_item_lista(laudo: Laudo, *, grupo: str) -> dict[str, Any]:
        laudo_id = int(laudo.id)
        referencia = laudo.criado_em or laudo.atualizado_em
        minutos_em_campo = _minutos_em_campo(referencia)
        tempo_label, tempo_status = _resumo_tempo_em_campo(referencia)
        inspetor_nome = (
            laudo.usuario.nome
            if laudo.usuario is not None
            else (f"Inspetor #{laudo.usuario_id}" if laudo.usuario_id else "Inspetor não identificado")
        )
        whispers_nao_lidos = whispers_nao_lidos_por_laudo.get(laudo_id, 0)
        pendencias_abertas = pendencias_abertas_por_laudo.get(laudo_id, 0)
        aprendizados_pendentes = aprendizados_pendentes_por_laudo.get(laudo_id, 0)
        fluxo = _classificar_fluxo_operacional(
            status_revisao=str(laudo.status_revisao or ""),
            whispers_nao_lidos=whispers_nao_lidos,
            pendencias_abertas=pendencias_abertas,
            aprendizados_pendentes=aprendizados_pendentes,
            tempo_em_campo_status=tempo_status,
        )
        return {
            "id": laudo_id,
            "hash_curto": (laudo.codigo_hash or str(laudo_id))[-6:],
            "primeira_mensagem": laudo.primeira_mensagem or ("Inspeção iniciada em campo" if grupo == "em_andamento" else "Sem descrição"),
            "setor_industrial": str(getattr(laudo, "setor_industrial", "") or ""),
            "status_revisao": str(laudo.status_revisao or ""),
            "atualizado_em": laudo.atualizado_em or laudo.criado_em,
            "criado_em": laudo.criado_em,
            "inspetor_nome": inspetor_nome,
            "whispers_nao_lidos": whispers_nao_lidos,
            "pendencias_abertas": pendencias_abertas,
            "aprendizados_pendentes": aprendizados_pendentes,
            "tempo_em_campo": tempo_label,
            "tempo_em_campo_status": tempo_status,
            "_minutos_em_campo": minutos_em_campo,
            **fluxo,
        }

    laudos_em_andamento_payload = [
        _serializar_item_lista(item, grupo="em_andamento")
        for item in laudos_em_andamento
    ]
    laudos_pendentes_payload = [
        _serializar_item_lista(item, grupo="pendente")
        for item in laudos_pendentes
    ]
    laudos_avaliados_payload = [
        _serializar_item_lista(item, grupo="historico")
        for item in laudos_avaliados
    ]

    if filtro_operacao:
        laudos_em_andamento_payload = [item for item in laudos_em_andamento_payload if item["fila_operacional"] == filtro_operacao]
        laudos_pendentes_payload = [item for item in laudos_pendentes_payload if item["fila_operacional"] == filtro_operacao]

    laudos_em_andamento_payload.sort(
        key=lambda item: (
            _prioridade_fluxo_valor(str(item.get("prioridade_operacional"))),
            -int(item.get("_minutos_em_campo") or 0),
            int(item.get("id") or 0),
        )
    )
    laudos_pendentes_payload.sort(
        key=lambda item: (
            _prioridade_fluxo_valor(str(item.get("prioridade_operacional"))),
            -int(item.get("aprendizados_pendentes") or 0),
            int(item.get("id") or 0),
        )
    )
    for item in [*laudos_em_andamento_payload, *laudos_pendentes_payload, *laudos_avaliados_payload]:
        item.pop("_minutos_em_campo", None)

    totais_operacao = {
        "responder_agora": 0,
        "validar_aprendizado": 0,
        "aguardando_inspetor": 0,
        "fechamento_mesa": 0,
        "acompanhamento": 0,
    }
    for item in [*laudos_em_andamento_payload, *laudos_pendentes_payload]:
        chave = str(item.get("fila_operacional") or "")
        if chave in totais_operacao:
            totais_operacao[chave] += 1

    total_aprendizados_pendentes = sum(aprendizados_pendentes_por_laudo.values())
    total_pendencias_abertas = sum(pendencias_abertas_por_laudo.values())
    total_whispers_pendentes = len(whispers_pendentes)

    return templates.TemplateResponse(
        request,
        "painel_revisor.html",
        {
            **_contexto_base(request),
            "usuario": usuario,
            "inspetores_empresa": inspetores_empresa,
            "filtro_inspetor_id": filtro_inspetor_id,
            "filtro_busca": filtro_busca,
            "filtro_aprendizados": filtro_aprendizados,
            "filtro_operacao": filtro_operacao,
            "whispers_pendentes": whispers_pendentes,
            "laudos_em_andamento": laudos_em_andamento_payload,
            "laudos_pendentes": laudos_pendentes_payload,
            "laudos_avaliados": laudos_avaliados_payload,
            "whispers_nao_lidos_por_laudo": whispers_nao_lidos_por_laudo,
            "pendencias_abertas_por_laudo": pendencias_abertas_por_laudo,
            "aprendizados_pendentes_por_laudo": aprendizados_pendentes_por_laudo,
            "total_aprendizados_pendentes": total_aprendizados_pendentes,
            "total_pendencias_abertas": total_pendencias_abertas,
            "total_whispers_pendentes": total_whispers_pendentes,
            "totais_operacao": totais_operacao,
        },
    )


__all__ = ["painel_revisor"]
