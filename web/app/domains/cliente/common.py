from __future__ import annotations

import os
import secrets
from typing import Any

from fastapi import HTTPException, Request

CHAVE_CSRF_CLIENTE = "csrf_token_cliente"
VERSAO_APP = os.getenv("APP_BUILD_ID", "dev").strip() or "dev"
AMBIENTE_APP = os.getenv("AMBIENTE", "producao").strip().lower() or "producao"


def _versao_assets(request: Request) -> str:
    if AMBIENTE_APP == "producao":
        return VERSAO_APP

    nonce = getattr(request.state, "csp_nonce", "").strip()
    if not nonce:
        return VERSAO_APP

    return f"{VERSAO_APP}-{nonce[:8]}"


def garantir_csrf_cliente(request: Request) -> str:
    token = request.session.get(CHAVE_CSRF_CLIENTE)
    if not token:
        token = secrets.token_urlsafe(32)
        request.session[CHAVE_CSRF_CLIENTE] = token
    request.session["csrf_token"] = token
    return token


def contexto_base_cliente(request: Request) -> dict[str, Any]:
    return {
        "request": request,
        "csrf_token": garantir_csrf_cliente(request),
        "csp_nonce": getattr(request.state, "csp_nonce", ""),
        "v_app": _versao_assets(request),
    }


def validar_csrf_cliente(request: Request, token_form: str = "") -> bool:
    token_sessao = request.session.get(CHAVE_CSRF_CLIENTE) or request.session.get("csrf_token", "")
    if not token_sessao:
        return False

    token_candidato = request.headers.get("X-CSRF-Token", "") or token_form
    return bool(token_candidato and secrets.compare_digest(token_sessao, token_candidato))


def exigir_csrf_cliente(request: Request, token_form: str = "") -> None:
    if not validar_csrf_cliente(request, token_form):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")


__all__ = [
    "CHAVE_CSRF_CLIENTE",
    "contexto_base_cliente",
    "garantir_csrf_cliente",
    "validar_csrf_cliente",
    "exigir_csrf_cliente",
]
