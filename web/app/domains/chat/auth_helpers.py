"""Helpers de autenticação do portal inspetor."""

from __future__ import annotations

import secrets
from typing import Optional

from fastapi import Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.domains.chat.session_helpers import CHAVE_CSRF_INSPETOR, contexto_base
from app.shared.database import NivelAcesso, Usuario
from app.shared.security import (
    PORTAL_INSPETOR,
    limpar_sessao_portal,
    usuario_tem_acesso_portal,
    usuario_tem_bloqueio_ativo,
)

PORTAL_TROCA_SENHA_INSPETOR = "inspetor"
CHAVE_TROCA_SENHA_UID = "troca_senha_uid"
CHAVE_TROCA_SENHA_PORTAL = "troca_senha_portal"
CHAVE_TROCA_SENHA_LEMBRAR = "troca_senha_lembrar"


def usuario_nome(usuario: Usuario) -> str:
    return getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None) or f"Inspetor #{usuario.id}"


def redirecionar_por_nivel(usuario: Usuario) -> RedirectResponse:
    nivel = usuario.nivel_acesso

    if nivel == NivelAcesso.INSPETOR.value:
        return RedirectResponse(url="/app/", status_code=303)

    if nivel == NivelAcesso.REVISOR.value:
        return RedirectResponse(url="/revisao/painel", status_code=303)

    if nivel == NivelAcesso.ADMIN_CLIENTE.value:
        return RedirectResponse(url="/cliente/painel", status_code=303)

    if nivel == NivelAcesso.DIRETORIA.value:
        return RedirectResponse(url="/admin/painel", status_code=303)

    return RedirectResponse(url="/app/login", status_code=303)


def _iniciar_fluxo_troca_senha(request: Request, *, usuario_id: int, lembrar: bool) -> None:
    limpar_sessao_portal(request.session, portal=PORTAL_INSPETOR)
    request.session[CHAVE_CSRF_INSPETOR] = secrets.token_urlsafe(32)
    request.session[CHAVE_TROCA_SENHA_UID] = int(usuario_id)
    request.session[CHAVE_TROCA_SENHA_PORTAL] = PORTAL_TROCA_SENHA_INSPETOR
    request.session[CHAVE_TROCA_SENHA_LEMBRAR] = bool(lembrar)


def _limpar_fluxo_troca_senha(request: Request) -> None:
    request.session.pop(CHAVE_TROCA_SENHA_UID, None)
    request.session.pop(CHAVE_TROCA_SENHA_PORTAL, None)
    request.session.pop(CHAVE_TROCA_SENHA_LEMBRAR, None)


def _usuario_pendente_troca_senha(request: Request, banco: Session) -> Optional[Usuario]:
    if request.session.get(CHAVE_TROCA_SENHA_PORTAL) != PORTAL_TROCA_SENHA_INSPETOR:
        return None

    usuario_id = request.session.get(CHAVE_TROCA_SENHA_UID)
    try:
        usuario_id_int = int(usuario_id)
    except (TypeError, ValueError):
        _limpar_fluxo_troca_senha(request)
        return None

    usuario = banco.get(Usuario, usuario_id_int)
    if not usuario:
        _limpar_fluxo_troca_senha(request)
        return None

    if not usuario_tem_acesso_portal(usuario, PORTAL_INSPETOR):
        _limpar_fluxo_troca_senha(request)
        return None

    if not bool(getattr(usuario, "senha_temporaria_ativa", False)):
        _limpar_fluxo_troca_senha(request)
        return None

    if usuario_tem_bloqueio_ativo(usuario):
        _limpar_fluxo_troca_senha(request)
        return None

    return usuario


def _validar_nova_senha(senha_atual: str, nova_senha: str, confirmar_senha: str) -> str:
    senha_atual = senha_atual or ""
    nova_senha = nova_senha or ""
    confirmar_senha = confirmar_senha or ""

    if not senha_atual or not nova_senha or not confirmar_senha:
        return "Preencha senha atual, nova senha e confirmação."
    if nova_senha != confirmar_senha:
        return "A confirmação da nova senha não confere."
    if len(nova_senha) < 8:
        return "A nova senha deve ter no mínimo 8 caracteres."
    if nova_senha == senha_atual:
        return "A nova senha deve ser diferente da senha temporária."
    return ""


def _render_troca_senha(
    request: Request,
    *,
    templates: Jinja2Templates,
    erro: str = "",
    status_code: int = 200,
) -> HTMLResponse:
    contexto = {
        **contexto_base(request),
        "erro": erro,
        "titulo_pagina": "Troca Obrigatória de Senha",
        "subtitulo_pagina": "Defina sua nova senha para liberar o acesso ao sistema.",
        "acao_form": "/app/trocar-senha",
        "rota_login": "/app/login",
    }
    return templates.TemplateResponse(request, "trocar_senha.html", contexto, status_code=status_code)


__all__ = [
    "PORTAL_TROCA_SENHA_INSPETOR",
    "CHAVE_TROCA_SENHA_UID",
    "CHAVE_TROCA_SENHA_PORTAL",
    "CHAVE_TROCA_SENHA_LEMBRAR",
    "usuario_nome",
    "redirecionar_por_nivel",
    "_iniciar_fluxo_troca_senha",
    "_limpar_fluxo_troca_senha",
    "_usuario_pendente_troca_senha",
    "_validar_nova_senha",
    "_render_troca_senha",
]
