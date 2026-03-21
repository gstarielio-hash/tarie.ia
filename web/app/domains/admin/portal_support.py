"""Suporte HTTP e de sessao do portal administrativo."""

from __future__ import annotations

import logging
import secrets
from typing import Any, Optional, TypeGuard
from urllib.parse import quote

from fastapi import Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.core.settings import get_settings
from app.shared.database import NivelAcesso, Usuario
from app.shared.security import criar_sessao, encerrar_sessao, usuario_tem_bloqueio_ativo

logger = logging.getLogger("tariel.admin")

_settings = get_settings()
EM_PRODUCAO = _settings.em_producao

URL_LOGIN = "/admin/login"
URL_PAINEL = "/admin/painel"
URL_CLIENTES = "/admin/clientes"
URL_NOVO_CLIENTE = "/admin/novo-cliente"

_PLANOS_MAPEADOS = {
    "piloto": "Piloto",
    "inicial": "Piloto",
    "starter": "Piloto",
    "pro": "Pro",
    "intermediario": "Pro",
    "intermediário": "Pro",
    "professional": "Pro",
    "ilimitado": "Ilimitado",
    "enterprise": "Ilimitado",
    "premium": "Ilimitado",
}

_NIVEIS_ADMIN = frozenset({NivelAcesso.DIRETORIA.value})
_CHAVE_FLASH = "_admin_flash_messages"
PORTAL_TROCA_SENHA_ADMIN = "admin"
CHAVE_TROCA_SENHA_UID = "troca_senha_uid"
CHAVE_TROCA_SENHA_PORTAL = "troca_senha_portal"
CHAVE_TROCA_SENHA_LEMBRAR = "troca_senha_lembrar"

templates = Jinja2Templates(directory="templates")


def _normalizar_texto(valor: str, *, max_len: int | None = None) -> str:
    texto = (valor or "").strip()
    if max_len is not None:
        return texto[:max_len]
    return texto


def _normalizar_email(email: str) -> str:
    return _normalizar_texto(email, max_len=254).lower()


def _normalizar_plano(valor: str) -> str:
    chave = _normalizar_texto(valor).lower()
    return _PLANOS_MAPEADOS.get(chave, _normalizar_texto(valor))


def _normalizar_tipo_flash(tipo: str) -> str:
    return "success" if str(tipo).strip().lower() == "success" else "error"


def _adicionar_flash(request: Request, texto: str, *, tipo: str = "success") -> None:
    mensagem = _normalizar_texto(texto, max_len=700)
    if not mensagem:
        return

    fila = request.session.get(_CHAVE_FLASH, [])
    if not isinstance(fila, list):
        fila = []

    fila.append(
        {
            "tipo": _normalizar_tipo_flash(tipo),
            "texto": mensagem,
        }
    )
    request.session[_CHAVE_FLASH] = fila[-8:]


def _consumir_flash(request: Request) -> list[dict[str, str]]:
    mensagens_brutas = request.session.pop(_CHAVE_FLASH, [])
    if not isinstance(mensagens_brutas, list):
        return []

    mensagens: list[dict[str, str]] = []
    for item in mensagens_brutas:
        if not isinstance(item, dict):
            continue
        texto = _normalizar_texto(str(item.get("texto", "")), max_len=700)
        if not texto:
            continue
        mensagens.append(
            {
                "tipo": _normalizar_tipo_flash(str(item.get("tipo", "error"))),
                "texto": texto,
            }
        )
    return mensagens


def _flash_senha_temporaria(request: Request, *, referencia: str, senha: str) -> None:
    ref = _normalizar_texto(referencia, max_len=180)
    senha_temp = _normalizar_texto(senha, max_len=180)
    if not ref or not senha_temp:
        return

    _adicionar_flash(
        request,
        f"Senha temporária para {ref}: {senha_temp}. Compartilhe em canal seguro e oriente a troca no primeiro acesso.",
        tipo="success",
    )


def _usuario_nome(usuario: Usuario) -> str:
    return getattr(usuario, "nome_completo", None) or getattr(usuario, "nome", None) or f"Admin #{usuario.id}"


def _verificar_acesso_admin(usuario: Optional[Usuario]) -> TypeGuard[Usuario]:
    return usuario is not None and usuario.nivel_acesso in _NIVEIS_ADMIN


def _usuario_esta_bloqueado(usuario: Usuario) -> bool:
    try:
        return usuario_tem_bloqueio_ativo(usuario)
    except Exception:
        logger.warning(
            "Falha ao verificar bloqueio dinâmico do usuário | usuario_id=%s",
            getattr(usuario, "id", None),
            exc_info=True,
        )
        return True


def _garantir_csrf_na_sessao(request: Request) -> str:
    token = request.session.get("csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        request.session["csrf_token"] = token
    return token


def _validar_csrf(request: Request, token_form: str = "") -> bool:
    token_sessao = request.session.get("csrf_token", "")
    if not token_sessao:
        return False

    token_candidato = request.headers.get("X-CSRF-Token", "") or token_form
    return bool(token_candidato and secrets.compare_digest(token_sessao, token_candidato))


def _contexto_base(request: Request, **extra: Any) -> dict[str, Any]:
    sucesso = _normalizar_texto(request.query_params.get("sucesso", ""), max_len=300)
    erro = _normalizar_texto(request.query_params.get("erro", ""), max_len=300)
    mensagens_flash = _consumir_flash(request)
    if sucesso:
        mensagens_flash.append({"tipo": "success", "texto": sucesso})
    if erro:
        mensagens_flash.append({"tipo": "error", "texto": erro})

    contexto = {
        "request": request,
        "csrf_token": _garantir_csrf_na_sessao(request),
        "csp_nonce": getattr(request.state, "csp_nonce", ""),
        "em_producao": EM_PRODUCAO,
        "sucesso": sucesso,
        "erro": erro,
        "mensagens_flash": mensagens_flash,
    }
    contexto.update(extra)
    return contexto


def _aplicar_headers_no_cache(response: HTMLResponse | RedirectResponse) -> None:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"


def _render_template(
    request: Request,
    nome_template: str,
    contexto: dict[str, Any] | None = None,
    *,
    status_code: int = 200,
) -> HTMLResponse:
    resposta = templates.TemplateResponse(
        request,
        nome_template,
        _contexto_base(request, **(contexto or {})),
        status_code=status_code,
    )
    _aplicar_headers_no_cache(resposta)
    return resposta


def _render_login(request: Request, *, erro: str = "", status_code: int = 200) -> HTMLResponse:
    return _render_template(
        request,
        "login.html",
        {"erro": erro},
        status_code=status_code,
    )


def _redirect_login() -> RedirectResponse:
    resposta = RedirectResponse(url=URL_LOGIN, status_code=303)
    _aplicar_headers_no_cache(resposta)
    return resposta


def _redirect_com_mensagem(url: str, *, sucesso: str = "", erro: str = "") -> RedirectResponse:
    if sucesso:
        destino = f"{url}?sucesso={quote(sucesso, safe='')}"
    elif erro:
        destino = f"{url}?erro={quote(erro, safe='')}"
    else:
        destino = url

    resposta = RedirectResponse(url=destino, status_code=303)
    _aplicar_headers_no_cache(resposta)
    return resposta


def _redirect_ok(url: str, mensagem: str) -> RedirectResponse:
    return _redirect_com_mensagem(url, sucesso=mensagem)


def _redirect_err(url: str, mensagem: str) -> RedirectResponse:
    return _redirect_com_mensagem(url, erro=mensagem)


def _limpar_sessao_admin(request: Request) -> None:
    token = request.session.get("session_token")
    if token:
        encerrar_sessao(token)

    request.session.clear()


def _registrar_sessao_admin(request: Request, usuario: Usuario) -> None:
    token_anterior = request.session.get("session_token")
    if token_anterior:
        encerrar_sessao(token_anterior)

    token_novo = criar_sessao(usuario.id)

    request.session["session_token"] = token_novo
    request.session["usuario_id"] = usuario.id
    request.session["nivel_acesso"] = usuario.nivel_acesso
    request.session["nome"] = _usuario_nome(usuario)

    # Rotaciona o token CSRF no login.
    request.session["csrf_token"] = secrets.token_urlsafe(32)


def _iniciar_fluxo_troca_senha(request: Request, *, usuario_id: int, lembrar: bool) -> None:
    _limpar_sessao_admin(request)
    request.session["csrf_token"] = secrets.token_urlsafe(32)
    request.session[CHAVE_TROCA_SENHA_UID] = int(usuario_id)
    request.session[CHAVE_TROCA_SENHA_PORTAL] = PORTAL_TROCA_SENHA_ADMIN
    request.session[CHAVE_TROCA_SENHA_LEMBRAR] = bool(lembrar)


def _limpar_fluxo_troca_senha(request: Request) -> None:
    request.session.pop(CHAVE_TROCA_SENHA_UID, None)
    request.session.pop(CHAVE_TROCA_SENHA_PORTAL, None)
    request.session.pop(CHAVE_TROCA_SENHA_LEMBRAR, None)


def _usuario_pendente_troca_senha(request: Request, banco: Session) -> Usuario | None:
    if request.session.get(CHAVE_TROCA_SENHA_PORTAL) != PORTAL_TROCA_SENHA_ADMIN:
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
    if not _verificar_acesso_admin(usuario):
        _limpar_fluxo_troca_senha(request)
        return None
    if not bool(getattr(usuario, "senha_temporaria_ativa", False)):
        _limpar_fluxo_troca_senha(request)
        return None
    if _usuario_esta_bloqueado(usuario):
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


def _render_troca_senha(request: Request, *, erro: str = "", status_code: int = 200) -> HTMLResponse:
    return _render_template(
        request,
        "trocar_senha.html",
        {
            "erro": erro,
            "titulo_pagina": "Troca Obrigatória de Senha",
            "subtitulo_pagina": "Defina sua nova senha para liberar o acesso ao painel administrativo.",
            "acao_form": "/admin/trocar-senha",
            "rota_login": URL_LOGIN,
        },
        status_code=status_code,
    )


__all__ = [
    "URL_LOGIN",
    "URL_PAINEL",
    "URL_CLIENTES",
    "URL_NOVO_CLIENTE",
    "_normalizar_texto",
    "_normalizar_email",
    "_normalizar_plano",
    "_flash_senha_temporaria",
    "_verificar_acesso_admin",
    "_usuario_esta_bloqueado",
    "_validar_csrf",
    "_render_template",
    "_render_login",
    "_redirect_login",
    "_redirect_ok",
    "_redirect_err",
    "_limpar_sessao_admin",
    "_registrar_sessao_admin",
    "_iniciar_fluxo_troca_senha",
    "_limpar_fluxo_troca_senha",
    "_usuario_pendente_troca_senha",
    "_validar_nova_senha",
    "_render_troca_senha",
]
