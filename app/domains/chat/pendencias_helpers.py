"""Helpers de pendências e formatação no domínio Chat/Inspetor."""

from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from app.domains.mesa.attachments import serializar_anexos_mesa, texto_mensagem_mesa_visivel
from sqlalchemy.orm import Session, selectinload

from app.shared.database import MensagemLaudo, NivelAcesso, StatusRevisao, TipoMensagem, Usuario

ASSINATURA_MESA_NOME_PADRAO = os.getenv("MESA_ENG_NOME_PADRAO", "Mesa Avaliadora WF").strip()
ASSINATURA_MESA_CARGO_PADRAO = os.getenv("MESA_ENG_CARGO_PADRAO", "Engenheiro Revisor").strip()
ASSINATURA_MESA_CREA_PADRAO = os.getenv("MESA_ENG_CREA_PADRAO", "").strip()
ASSINATURA_MESA_CARIMBO_PADRAO = os.getenv("MESA_ENG_CARIMBO_PADRAO", "CARIMBO DIGITAL WF").strip()

MAPA_FILTRO_PENDENCIAS_LABEL = {
    "abertas": "Abertas",
    "resolvidas": "Resolvidas",
    "todas": "Todas",
}


def normalizar_filtro_pendencias(valor: str) -> str:
    filtro = (valor or "").strip().lower()
    if filtro in {"abertas", "resolvidas", "todas"}:
        return filtro
    return "abertas"


def normalizar_paginacao_pendencias(
    pagina: int,
    tamanho: int,
    *,
    tamanho_padrao: int = 25,
    tamanho_maximo: int = 120,
) -> tuple[int, int]:
    pagina_segura = pagina if isinstance(pagina, int) and pagina > 0 else 1

    if not isinstance(tamanho, int) or tamanho <= 0:
        tamanho_seguro = tamanho_padrao
    else:
        tamanho_seguro = min(tamanho, tamanho_maximo)

    return pagina_segura, tamanho_seguro


def listar_pendencias_mesa_laudo(
    banco: Session,
    *,
    laudo_id: int,
    filtro: str,
    pagina: int = 1,
    tamanho: int = 25,
) -> tuple[list[MensagemLaudo], int, int, int]:
    pagina_segura, tamanho_seguro = normalizar_paginacao_pendencias(pagina, tamanho)

    consulta_base = banco.query(MensagemLaudo).filter(
        MensagemLaudo.laudo_id == laudo_id,
        MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
    )
    consulta_base = consulta_base.options(selectinload(MensagemLaudo.anexos_mesa))

    total = consulta_base.count()
    abertas_total = consulta_base.filter(MensagemLaudo.lida.is_(False)).count()

    if filtro == "abertas":
        consulta_filtrada = consulta_base.filter(MensagemLaudo.lida.is_(False))
    elif filtro == "resolvidas":
        consulta_filtrada = consulta_base.filter(MensagemLaudo.lida.is_(True))
    else:
        consulta_filtrada = consulta_base

    total_filtrado = consulta_filtrada.count()
    deslocamento = (pagina_segura - 1) * tamanho_seguro
    pendencias_filtradas = (
        consulta_filtrada
        .order_by(MensagemLaudo.criado_em.desc())
        .offset(deslocamento)
        .limit(tamanho_seguro)
        .all()
    )
    return pendencias_filtradas, total, abertas_total, total_filtrado


def nome_resolvedor_pendencia(item: MensagemLaudo) -> str:
    if not item.resolvida_por_id:
        return ""

    if item.resolvida_por:
        return (
            getattr(item.resolvida_por, "nome", None)
            or getattr(item.resolvida_por, "nome_completo", None)
            or f"Usuario #{item.resolvida_por_id}"
        )

    return f"Usuario #{item.resolvida_por_id}"


def serializar_pendencia_mesa(item: MensagemLaudo) -> dict[str, object]:
    return {
        "id": item.id,
        "texto": texto_mensagem_mesa_visivel(item.conteudo or "", anexos=getattr(item, "anexos_mesa", None)),
        "lida": bool(item.lida),
        "data": item.criado_em.isoformat() if item.criado_em else "",
        "data_label": (
            item.criado_em.astimezone().strftime("%d/%m %H:%M")
            if item.criado_em
            else ""
        ),
        "resolvida_por_id": item.resolvida_por_id,
        "resolvida_por_nome": nome_resolvedor_pendencia(item),
        "resolvida_em": item.resolvida_em.isoformat() if item.resolvida_em else "",
        "resolvida_em_label": (
            item.resolvida_em.astimezone().strftime("%d/%m %H:%M")
            if item.resolvida_em
            else ""
        ),
        "anexos": serializar_anexos_mesa(getattr(item, "anexos_mesa", None), portal="app"),
    }


def obter_assinatura_mesa_para_pdf(
    banco: Session,
    *,
    laudo_id: int,
    empresa_id: int,
) -> dict[str, str]:
    nome_padrao = ASSINATURA_MESA_NOME_PADRAO or "Mesa Avaliadora WF"
    cargo_padrao = ASSINATURA_MESA_CARGO_PADRAO or "Engenheiro Revisor"
    crea_padrao = ASSINATURA_MESA_CREA_PADRAO or "Nao informado"
    carimbo_padrao = ASSINATURA_MESA_CARIMBO_PADRAO or "CARIMBO DIGITAL WF"

    revisor_remetente = (
        banco.query(Usuario)
        .join(MensagemLaudo, MensagemLaudo.remetente_id == Usuario.id)
        .filter(
            MensagemLaudo.laudo_id == laudo_id,
            MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
            Usuario.empresa_id == empresa_id,
            Usuario.nivel_acesso >= int(NivelAcesso.REVISOR),
        )
        .order_by(MensagemLaudo.criado_em.desc())
        .first()
    )

    revisor_resolvedor = None
    if not revisor_remetente:
        revisor_resolvedor = (
            banco.query(Usuario)
            .join(MensagemLaudo, MensagemLaudo.resolvida_por_id == Usuario.id)
            .filter(
                MensagemLaudo.laudo_id == laudo_id,
                MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
                Usuario.empresa_id == empresa_id,
                Usuario.nivel_acesso >= int(NivelAcesso.REVISOR),
            )
            .order_by(MensagemLaudo.resolvida_em.desc())
            .first()
        )

    engenheiro = revisor_remetente or revisor_resolvedor
    nome_assinatura = (
        getattr(engenheiro, "nome", None)
        or getattr(engenheiro, "nome_completo", None)
        or nome_padrao
    )
    crea_assinatura = str(getattr(engenheiro, "crea", "") if engenheiro else "").strip()[:40] or crea_padrao

    return {
        "nome": nome_assinatura,
        "cargo": cargo_padrao,
        "crea": crea_assinatura,
        "carimbo": carimbo_padrao,
    }


def montar_texto_relatorio_pendencias(
    *,
    laudo_id: int,
    filtro: str,
    pendencias_filtradas: list[MensagemLaudo],
    total: int,
    abertas: int,
    resolvidas: int,
) -> str:
    filtro_label = {
        "abertas": "Abertas",
        "resolvidas": "Resolvidas",
        "todas": "Todas",
    }.get(filtro, "Abertas")

    linhas = [
        "Relatorio de Pendencias da Mesa Avaliadora",
        f"Laudo #{laudo_id}",
        "",
        f"Filtro aplicado: {filtro_label}",
        f"Total geral: {total}",
        f"Abertas: {abertas}",
        f"Resolvidas: {resolvidas}",
        "",
    ]

    if not pendencias_filtradas:
        linhas.append("Nenhuma pendencia encontrada para o filtro selecionado.")
        return "\n".join(linhas)

    linhas.append("Pendencias listadas:")
    for indice, item in enumerate(pendencias_filtradas, start=1):
        data_criacao = item.criado_em.astimezone().strftime("%d/%m/%Y %H:%M") if item.criado_em else "-"
        status = "Aberta" if not item.lida else "Resolvida"
        texto = " ".join((item.conteudo or "").split())[:350] or "(sem conteudo)"

        linhas.append(f"{indice}. [{status}] ID {item.id} | Criada em: {data_criacao}")
        linhas.append(f"   {texto}")

        if item.lida:
            resolvedor = nome_resolvedor_pendencia(item) or "Nao informado"
            data_resolucao = item.resolvida_em.astimezone().strftime("%d/%m/%Y %H:%M") if item.resolvida_em else "-"
            linhas.append(f"   Resolvida por: {resolvedor} | Em: {data_resolucao}")

        linhas.append("")

    return "\n".join(linhas).strip()


def formatar_data_humana(valor: Optional[datetime]) -> str:
    return formatar_data_br(valor, incluir_ano=True)


def formatar_data_br(valor: Optional[datetime], *, incluir_ano: bool = False) -> str:
    if not valor:
        return "-"

    try:
        formato = "%d/%m/%Y %H:%M" if incluir_ano else "%d/%m %H:%M"
        return valor.astimezone().strftime(formato)
    except Exception:
        return "-"


def descrever_status_revisao(status: str) -> str:
    status_normalizado = str(status or "").strip().lower()
    mapa = {
        StatusRevisao.RASCUNHO.value: "Rascunho em campo",
        StatusRevisao.AGUARDANDO.value: "Aguardando mesa avaliadora",
        StatusRevisao.APROVADO.value: "Aprovado",
    }
    return mapa.get(status_normalizado, status_normalizado or "Indefinido")


__all__ = [
    "MAPA_FILTRO_PENDENCIAS_LABEL",
    "normalizar_filtro_pendencias",
    "normalizar_paginacao_pendencias",
    "listar_pendencias_mesa_laudo",
    "nome_resolvedor_pendencia",
    "serializar_pendencia_mesa",
    "obter_assinatura_mesa_para_pdf",
    "montar_texto_relatorio_pendencias",
    "formatar_data_humana",
    "formatar_data_br",
    "descrever_status_revisao",
]
