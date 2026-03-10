"""Helpers de validação e utilidades de mídia/documentos no chat."""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any

from fastapi import HTTPException

LIMITE_HISTORICO_TOTAL_CHARS = 40_000
LIMITE_IMG_BASE64 = 14_500_000
LIMITE_NOME_DOCUMENTO = 120

REGEX_DATA_URI_IMAGEM = re.compile(
    r"^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$",
    flags=re.IGNORECASE,
)
REGEX_ARQUIVO_DOCUMENTO = re.compile(r"\.(?:pdf|docx?)\b", flags=re.IGNORECASE)

logger = logging.getLogger("tariel.rotas_inspetor")


def validar_historico_total(historico: list[Any]) -> None:
    total = 0
    for item in historico:
        texto = ""
        if isinstance(item, dict):
            texto = str(item.get("texto") or "")
        else:
            texto = str(getattr(item, "texto", "") or "")
        total += len(texto)

    if total > LIMITE_HISTORICO_TOTAL_CHARS:
        raise HTTPException(
            status_code=413,
            detail="Histórico excedeu o tamanho máximo permitido.",
        )


def validar_imagem_base64(dados_imagem: str) -> str:
    valor = (dados_imagem or "").strip()
    if not valor:
        return ""

    if len(valor) > LIMITE_IMG_BASE64:
        raise HTTPException(status_code=413, detail="Imagem excedeu o tamanho máximo.")

    if not REGEX_DATA_URI_IMAGEM.match(valor):
        raise HTTPException(status_code=400, detail="Imagem base64 inválida.")

    return valor


def nome_documento_seguro(nome: str) -> str:
    texto = (nome or "").strip()
    if not texto:
        return ""

    nome_base = Path(texto).name
    nome_base = re.sub(r"[^A-Za-z0-9._\- ()À-ÿ]", "_", nome_base)
    return nome_base[:LIMITE_NOME_DOCUMENTO]


def safe_remove_file(caminho: str) -> None:
    try:
        if caminho and os.path.isfile(caminho):
            os.remove(caminho)
    except Exception:
        logger.warning("Falha ao remover arquivo temporário | caminho=%s", caminho)


def mensagem_representa_documento(conteudo: str) -> bool:
    texto = (conteudo or "").strip()
    if not texto:
        return False
    if texto.lower().startswith("documento:"):
        return True
    return bool(REGEX_ARQUIVO_DOCUMENTO.search(texto))


__all__ = [
    "LIMITE_HISTORICO_TOTAL_CHARS",
    "LIMITE_IMG_BASE64",
    "LIMITE_NOME_DOCUMENTO",
    "REGEX_DATA_URI_IMAGEM",
    "REGEX_ARQUIVO_DOCUMENTO",
    "validar_historico_total",
    "validar_imagem_base64",
    "nome_documento_seguro",
    "safe_remove_file",
    "mensagem_representa_documento",
]
