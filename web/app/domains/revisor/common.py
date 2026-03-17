from __future__ import annotations

import secrets
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.shared.database import Laudo

CHAVE_CSRF_REVISOR = "csrf_token_revisor"


def _contexto_base(request: Request) -> dict[str, Any]:
    if CHAVE_CSRF_REVISOR not in request.session:
        request.session[CHAVE_CSRF_REVISOR] = secrets.token_urlsafe(32)

    return {
        "request": request,
        "csrf_token": request.session[CHAVE_CSRF_REVISOR],
        "csp_nonce": getattr(request.state, "csp_nonce", ""),
    }


def _validar_csrf(request: Request, token_form: str = "") -> bool:
    token_sessao = request.session.get(CHAVE_CSRF_REVISOR) or request.session.get("csrf_token", "")
    if not token_sessao:
        return False

    token_candidato = request.headers.get("X-CSRF-Token", "") or token_form
    return bool(token_candidato and secrets.compare_digest(token_sessao, token_candidato))


def _obter_laudo_empresa(banco: Session, laudo_id: int, empresa_id: int) -> Laudo:
    laudo = banco.get(Laudo, laudo_id)
    if not laudo or laudo.empresa_id != empresa_id:
        raise HTTPException(status_code=404, detail="Laudo não encontrado.")
    return laudo
