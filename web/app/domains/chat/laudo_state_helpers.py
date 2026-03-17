"""Helpers de estado derivado e serializacao resumida de laudos."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.domains.chat.normalization import nome_template_humano
from app.shared.database import Laudo, MensagemLaudo, StatusRevisao


CARD_STATUS_LABELS = {
    "aberto": "Aberto",
    "aguardando": "Aguardando",
    "ajustes": "Ajustes",
    "aprovado": "Aprovado",
}


def laudo_tem_interacao(banco: Session, laudo_id: int) -> bool:
    return (
        banco.query(MensagemLaudo.id)
        .filter(MensagemLaudo.laudo_id == laudo_id)
        .first()
        is not None
    )


def laudo_possui_historico_visivel(banco: Session, laudo: Laudo) -> bool:
    if laudo_tem_interacao(banco, int(laudo.id)):
        return True

    if laudo.status_revisao != StatusRevisao.RASCUNHO.value:
        return True

    return bool((laudo.primeira_mensagem or "").strip() or (laudo.parecer_ia or "").strip())


def obter_status_card_laudo(banco: Session, laudo: Laudo) -> str:
    if not laudo_possui_historico_visivel(banco, laudo):
        return "oculto"

    if laudo.status_revisao == StatusRevisao.APROVADO.value:
        return "aprovado"

    if laudo.status_revisao == StatusRevisao.REJEITADO.value:
        return "ajustes"

    if laudo.status_revisao == StatusRevisao.AGUARDANDO.value:
        if getattr(laudo, "reabertura_pendente_em", None):
            return "ajustes"
        return "aguardando"

    return "aberto"


def obter_estado_api_laudo(banco: Session, laudo: Laudo) -> str:
    status_card = obter_status_card_laudo(banco, laudo)
    mapa = {
        "oculto": "sem_relatorio",
        "aberto": "relatorio_ativo",
        "aguardando": "aguardando",
        "ajustes": "ajustes",
        "aprovado": "aprovado",
    }
    return mapa.get(status_card, "sem_relatorio")


def laudo_permite_edicao_inspetor(laudo: Laudo) -> bool:
    return laudo.status_revisao == StatusRevisao.RASCUNHO.value


def laudo_permite_reabrir(banco: Session, laudo: Laudo) -> bool:
    status_card = obter_status_card_laudo(banco, laudo)
    return status_card == "ajustes"


def serializar_card_laudo(banco: Session, laudo: Laudo) -> dict[str, Any]:
    status_card = obter_status_card_laudo(banco, laudo)
    preview = str(laudo.primeira_mensagem or "").strip()
    titulo = str(laudo.setor_industrial or "").strip() or nome_template_humano(
        str(laudo.tipo_template or "padrao")
    )

    return {
        "id": int(laudo.id),
        "titulo": titulo,
        "preview": preview,
        "pinado": bool(laudo.pinado),
        "data_iso": laudo.criado_em.strftime("%Y-%m-%d"),
        "data_br": laudo.criado_em.strftime("%d/%m/%Y"),
        "hora_br": laudo.criado_em.strftime("%H:%M"),
        "tipo_template": str(laudo.tipo_template or "padrao"),
        "status_revisao": str(laudo.status_revisao or ""),
        "status_card": status_card,
        "status_card_label": CARD_STATUS_LABELS.get(status_card, "Laudo"),
        "permite_edicao": laudo_permite_edicao_inspetor(laudo),
        "permite_reabrir": laudo_permite_reabrir(banco, laudo),
        "possui_historico": status_card != "oculto",
    }


__all__ = [
    "CARD_STATUS_LABELS",
    "laudo_tem_interacao",
    "laudo_possui_historico_visivel",
    "obter_status_card_laudo",
    "obter_estado_api_laudo",
    "laudo_permite_edicao_inspetor",
    "laudo_permite_reabrir",
    "serializar_card_laudo",
]
