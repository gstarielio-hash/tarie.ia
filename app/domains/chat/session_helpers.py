"""Helpers de sessão/CSRF/estado para o domínio Chat/Inspetor."""

from __future__ import annotations

import os
import secrets
from typing import Any, Optional

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.domains.chat.normalization import TIPOS_TEMPLATE_VALIDOS
from app.shared.database import Laudo, StatusRevisao, Usuario

CHAVE_CSRF_INSPETOR = "csrf_token_inspetor"
VERSAO_APP = os.getenv("APP_BUILD_ID", "dev").strip() or "dev"


def contexto_base(request: Request) -> dict[str, Any]:
    if CHAVE_CSRF_INSPETOR not in request.session:
        request.session[CHAVE_CSRF_INSPETOR] = secrets.token_urlsafe(32)

    return {
        "request": request,
        "csrf_token": request.session[CHAVE_CSRF_INSPETOR],
        "csp_nonce": getattr(request.state, "csp_nonce", ""),
        "v_app": VERSAO_APP,
    }


def validar_csrf(request: Request, token_form: str = "") -> bool:
    token_sessao = request.session.get(CHAVE_CSRF_INSPETOR) or request.session.get("csrf_token", "")
    if not token_sessao:
        return False

    token_candidato = request.headers.get("X-CSRF-Token", "") or token_form
    return bool(token_candidato and secrets.compare_digest(token_sessao, token_candidato))


def exigir_csrf(request: Request, token_form: str = "") -> None:
    if not validar_csrf(request, token_form):
        raise HTTPException(status_code=403, detail="Token CSRF inválido.")


def laudo_id_sessao(request: Request) -> Optional[int]:
    valor = request.session.get("laudo_ativo_id")
    try:
        return int(valor) if valor is not None else None
    except (TypeError, ValueError):
        return None


def estado_relatorio_sanitizado(
    request: Request,
    banco: Session,
    usuario: Usuario,
    *,
    mutar_sessao: bool = True,
) -> dict[str, Any]:
    estado = request.session.get("estado_relatorio", "sem_relatorio")
    laudo_id = laudo_id_sessao(request)

    if not laudo_id:
        if mutar_sessao:
            request.session["estado_relatorio"] = "sem_relatorio"
            request.session.pop("laudo_ativo_id", None)
        return {
            "estado": "sem_relatorio",
            "laudo_id": None,
            "tipos_relatorio": TIPOS_TEMPLATE_VALIDOS,
        }

    laudo = (
        banco.query(Laudo)
        .filter(
            Laudo.id == laudo_id,
            Laudo.empresa_id == usuario.empresa_id,
            Laudo.usuario_id == usuario.id,
        )
        .first()
    )

    if not laudo:
        if mutar_sessao:
            request.session["estado_relatorio"] = "sem_relatorio"
            request.session.pop("laudo_ativo_id", None)
        return {
            "estado": "sem_relatorio",
            "laudo_id": None,
            "tipos_relatorio": TIPOS_TEMPLATE_VALIDOS,
        }

    if laudo.status_revisao == StatusRevisao.RASCUNHO.value:
        estado = "relatorio_ativo"
    else:
        estado = "sem_relatorio"
        if mutar_sessao:
            request.session.pop("laudo_ativo_id", None)

    if mutar_sessao:
        request.session["estado_relatorio"] = estado

    return {
        "estado": estado,
        "laudo_id": laudo.id if estado == "relatorio_ativo" else None,
        "tipos_relatorio": TIPOS_TEMPLATE_VALIDOS,
    }


__all__ = [
    "CHAVE_CSRF_INSPETOR",
    "VERSAO_APP",
    "contexto_base",
    "validar_csrf",
    "exigir_csrf",
    "laudo_id_sessao",
    "estado_relatorio_sanitizado",
]
