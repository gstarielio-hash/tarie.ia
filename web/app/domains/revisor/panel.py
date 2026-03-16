from __future__ import annotations

from typing import Any

from fastapi import Depends, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import or_
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
    Laudo,
    MensagemLaudo,
    NivelAcesso,
    StatusRevisao,
    TipoMensagem,
    Usuario,
    obter_banco,
)
from app.shared.security import exigir_revisor


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

    laudos_em_andamento_payload = []
    for item in laudos_em_andamento:
        referencia = item.criado_em or item.atualizado_em
        minutos_em_campo = _minutos_em_campo(referencia)
        tempo_label, tempo_status = _resumo_tempo_em_campo(referencia)
        inspetor_nome = (
            item.usuario.nome
            if item.usuario is not None
            else (f"Inspetor #{item.usuario_id}" if item.usuario_id else "Inspetor não identificado")
        )
        atualizado_em = item.atualizado_em or item.criado_em
        laudos_em_andamento_payload.append(
            {
                "id": item.id,
                "hash_curto": (item.codigo_hash or str(item.id))[-6:],
                "primeira_mensagem": item.primeira_mensagem,
                "atualizado_em": atualizado_em,
                "inspetor_nome": inspetor_nome,
                "tempo_em_campo": tempo_label,
                "tempo_em_campo_status": tempo_status,
                "_minutos_em_campo": minutos_em_campo,
            }
        )

    prioridade_sla = {
        "sla-critico": 0,
        "sla-atencao": 1,
        "sla-ok": 2,
    }
    laudos_em_andamento_payload.sort(
        key=lambda item: (
            prioridade_sla.get(str(item.get("tempo_em_campo_status")), 99),
            -int(item.get("_minutos_em_campo") or 0),
            int(item.get("id") or 0),
        )
    )
    for item in laudos_em_andamento_payload:
        item.pop("_minutos_em_campo", None)

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

    for item in laudos_em_andamento_payload:
        laudo_id = int(item.get("id") or 0)
        item["whispers_nao_lidos"] = whispers_nao_lidos_por_laudo.get(laudo_id, 0)
        item["pendencias_abertas"] = pendencias_abertas_por_laudo.get(laudo_id, 0)

    return templates.TemplateResponse(
        request,
        "painel_revisor.html",
        {
            **_contexto_base(request),
            "usuario": usuario,
            "inspetores_empresa": inspetores_empresa,
            "filtro_inspetor_id": filtro_inspetor_id,
            "filtro_busca": filtro_busca,
            "whispers_pendentes": whispers_pendentes,
            "laudos_em_andamento": laudos_em_andamento_payload,
            "laudos_pendentes": laudos_pendentes,
            "laudos_avaliados": laudos_avaliados,
            "whispers_nao_lidos_por_laudo": whispers_nao_lidos_por_laudo,
            "pendencias_abertas_por_laudo": pendencias_abertas_por_laudo,
        },
    )


__all__ = ["painel_revisor"]
