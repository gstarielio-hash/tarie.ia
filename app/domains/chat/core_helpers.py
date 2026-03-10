"""Helpers core compartilhados do domínio Chat/Inspetor."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi.responses import JSONResponse


def agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def json_seguro(data: dict[str, Any]) -> str:
    return json.dumps(data, ensure_ascii=False)


def evento_sse(data: dict[str, Any]) -> str:
    return f"data: {json_seguro(data)}\n\n"


def resposta_json_ok(payload: dict[str, Any], status_code: int = 200) -> JSONResponse:
    return JSONResponse(content=payload, status_code=status_code)


def obter_preview_primeira_mensagem(
    mensagem: str,
    *,
    nome_documento: str = "",
    tem_imagem: bool = False,
) -> str:
    texto = (mensagem or "").strip()
    if texto:
        return texto[:80]

    if nome_documento:
        return f"Documento: {nome_documento[:60]}"

    if tem_imagem:
        return "Imagem enviada"

    return "Nova conversa"


__all__ = [
    "agora_utc",
    "json_seguro",
    "evento_sse",
    "resposta_json_ok",
    "obter_preview_primeira_mensagem",
]
