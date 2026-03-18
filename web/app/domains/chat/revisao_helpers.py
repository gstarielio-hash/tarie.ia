"""Helpers de revisão/versionamento de laudos no domínio Chat/Inspetor."""

from __future__ import annotations

import difflib
from typing import Any

from sqlalchemy.orm import Session

from app.shared.database import Laudo, LaudoRevisao
from nucleo.inspetor.confianca_ia import _resumo_texto_curto, normalizar_payload_confianca_ia


def _obter_ultima_revisao_laudo(banco: Session, laudo_id: int) -> LaudoRevisao | None:
    return banco.query(LaudoRevisao).filter(LaudoRevisao.laudo_id == laudo_id).order_by(LaudoRevisao.numero_versao.desc(), LaudoRevisao.id.desc()).first()


def _obter_revisao_por_versao(banco: Session, laudo_id: int, versao: int) -> LaudoRevisao | None:
    return banco.query(LaudoRevisao).filter(LaudoRevisao.laudo_id == laudo_id, LaudoRevisao.numero_versao == versao).first()


def _registrar_revisao_laudo(
    banco: Session,
    laudo: Laudo,
    *,
    conteudo: str,
    origem: str,
    confianca: dict[str, Any] | None = None,
) -> LaudoRevisao | None:
    texto = str(conteudo or "").strip()
    if not texto:
        return None

    ultima = _obter_ultima_revisao_laudo(banco, laudo.id)
    if ultima and (ultima.conteudo or "").strip() == texto:
        return ultima

    proxima_versao = (int(ultima.numero_versao) + 1) if ultima else 1
    payload_confianca = normalizar_payload_confianca_ia(confianca or {})

    revisao = LaudoRevisao(
        laudo_id=laudo.id,
        numero_versao=proxima_versao,
        origem=str(origem or "ia").strip().lower()[:20] or "ia",
        resumo=_resumo_texto_curto(texto, limite=220),
        conteudo=texto,
        confianca_geral=payload_confianca.get("geral"),
        confianca_json=payload_confianca or None,
    )
    banco.add(revisao)
    return revisao


def _serializar_revisao_laudo(revisao: LaudoRevisao) -> dict[str, Any]:
    payload_confianca = normalizar_payload_confianca_ia(revisao.confianca_json or {})
    return {
        "id": revisao.id,
        "versao": int(revisao.numero_versao),
        "origem": revisao.origem,
        "resumo": revisao.resumo or "",
        "criado_em": revisao.criado_em.isoformat() if revisao.criado_em else "",
        "confianca_geral": payload_confianca.get("geral") or str(revisao.confianca_geral or "").strip().lower(),
        "confianca": payload_confianca,
    }


def _gerar_diff_revisoes(base: str, comparar: str) -> str:
    linhas_base = (base or "").splitlines()
    linhas_comparar = (comparar or "").splitlines()

    diff = difflib.unified_diff(
        linhas_base,
        linhas_comparar,
        fromfile="versao_base",
        tofile="versao_comparada",
        lineterm="",
        n=2,
    )
    return "\n".join(diff).strip()


def _resumo_diff_revisoes(diff_texto: str) -> dict[str, int]:
    adicionadas = 0
    removidas = 0
    for linha in (diff_texto or "").splitlines():
        if not linha or linha.startswith(("+++", "---", "@@")):
            continue
        if linha.startswith("+"):
            adicionadas += 1
        elif linha.startswith("-"):
            removidas += 1

    return {
        "linhas_adicionadas": adicionadas,
        "linhas_removidas": removidas,
        "total_alteracoes": adicionadas + removidas,
    }


__all__ = [
    "_obter_ultima_revisao_laudo",
    "_obter_revisao_por_versao",
    "_registrar_revisao_laudo",
    "_serializar_revisao_laudo",
    "_gerar_diff_revisoes",
    "_resumo_diff_revisoes",
]
