"""Helpers de template/limites no domínio Chat/Inspetor."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.domains.chat.normalization import codigos_template_compativeis
from app.shared.database import LIMITES_PADRAO, LimitePlano, PlanoEmpresa, TemplateLaudo


def selecionar_template_ativo_para_tipo(
    banco: Session,
    *,
    empresa_id: int,
    tipo_template: str,
) -> TemplateLaudo | None:
    codigos = codigos_template_compativeis(tipo_template)
    if not codigos:
        return None

    candidatos = (
        banco.query(TemplateLaudo)
        .filter(
            TemplateLaudo.empresa_id == empresa_id,
            TemplateLaudo.ativo.is_(True),
            TemplateLaudo.codigo_template.in_(codigos),
        )
        .all()
    )
    if not candidatos:
        return None

    prioridade = {codigo: indice for indice, codigo in enumerate(codigos)}
    candidatos.sort(
        key=lambda item: (
            prioridade.get(str(item.codigo_template or "").strip().lower(), 999),
            -int(item.versao or 0),
            -int(item.id or 0),
        )
    )
    return candidatos[0]


def montar_limites_para_template(banco: Session) -> dict[str, Any]:
    limites: dict[str, Any] = {}

    for plano in PlanoEmpresa:
        registro = banco.get(LimitePlano, plano.value)
        if registro:
            limites[plano.value] = registro
            continue

        fallback = type("LimitePlanoView", (), {})()
        setattr(fallback, "plano", plano.value)

        for campo, valor in LIMITES_PADRAO.get(plano.value, {}).items():
            setattr(fallback, campo, valor)

        limites[plano.value] = fallback

    return limites


__all__ = [
    "selecionar_template_ativo_para_tipo",
    "montar_limites_para_template",
]
