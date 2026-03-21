"""Suporte HTTP e utilitarios do portal admin-cliente."""

from __future__ import annotations

import json
import secrets
from json import JSONDecodeError
from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.domains.cliente.auditoria import registrar_auditoria_empresa
from app.domains.chat.laudo_state_helpers import serializar_card_laudo
from app.domains.cliente.common import CHAVE_CSRF_CLIENTE, contexto_base_cliente
from app.domains.cliente.dashboard import serializar_usuario_cliente as _serializar_usuario_cliente
from app.shared.database import Empresa, Laudo, NivelAcesso, Usuario
from app.shared.security import (
    PORTAL_CLIENTE,
    criar_sessao,
    definir_sessao_portal,
    encerrar_sessao,
    obter_dados_sessao_portal,
    usuario_tem_acesso_portal,
    usuario_tem_bloqueio_ativo,
)
from app.shared.tenant_access import obter_empresa_usuario

templates = Jinja2Templates(directory="templates")

URL_LOGIN = "/cliente/login"
URL_PAINEL = "/cliente/painel"
PORTAL_TROCA_SENHA_CLIENTE = "cliente"
CHAVE_TROCA_SENHA_UID = "troca_senha_uid"
CHAVE_TROCA_SENHA_PORTAL = "troca_senha_portal"
CHAVE_TROCA_SENHA_LEMBRAR = "troca_senha_lembrar"


def _aplicar_headers_no_cache(response: HTMLResponse | RedirectResponse) -> None:
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"


def _render_template(request: Request, nome_template: str, contexto: dict[str, Any], *, status_code: int = 200) -> HTMLResponse:
    resposta = templates.TemplateResponse(
        request,
        nome_template,
        {**contexto_base_cliente(request), **contexto},
        status_code=status_code,
    )
    _aplicar_headers_no_cache(resposta)
    return resposta


def _render_login_cliente(request: Request, *, erro: str = "", status_code: int = 200) -> HTMLResponse:
    return _render_template(
        request,
        "login_cliente.html",
        {"erro": erro},
        status_code=status_code,
    )


def _redirect_login_cliente() -> RedirectResponse:
    resposta = RedirectResponse(url=URL_LOGIN, status_code=status.HTTP_303_SEE_OTHER)
    _aplicar_headers_no_cache(resposta)
    return resposta


def _mensagem_portal_correto(usuario: Usuario) -> str:
    nivel = int(usuario.nivel_acesso or 0)
    if nivel == int(NivelAcesso.INSPETOR):
        return "Este usuário deve acessar /app/login."
    if nivel == int(NivelAcesso.REVISOR):
        return "Este usuário deve acessar /revisao/login."
    if nivel == int(NivelAcesso.DIRETORIA):
        return "Este usuário deve acessar /admin/login."
    return "Acesso negado para este portal."


def _nome_usuario_cliente(usuario: Usuario) -> str:
    return str(_serializar_usuario_cliente(usuario).get("nome") or f"Cliente #{usuario.id}")


def _limpar_sessao_cliente(request: Request) -> None:
    token = obter_dados_sessao_portal(request.session, portal=PORTAL_CLIENTE).get("token")
    if token:
        encerrar_sessao(token)
    request.session.clear()


def _registrar_sessao_cliente(request: Request, usuario: Usuario, *, lembrar: bool) -> None:
    token = criar_sessao(int(usuario.id), lembrar=lembrar)
    definir_sessao_portal(
        request.session,
        portal=PORTAL_CLIENTE,
        token=token,
        usuario_id=int(usuario.id),
        empresa_id=int(usuario.empresa_id),
        nivel_acesso=int(usuario.nivel_acesso),
        nome=_nome_usuario_cliente(usuario),
    )
    token_csrf = secrets.token_urlsafe(32)
    request.session[CHAVE_CSRF_CLIENTE] = token_csrf
    request.session["csrf_token"] = token_csrf


def _iniciar_fluxo_troca_senha(request: Request, *, usuario_id: int, lembrar: bool) -> None:
    _limpar_sessao_cliente(request)
    token_csrf = secrets.token_urlsafe(32)
    request.session[CHAVE_CSRF_CLIENTE] = token_csrf
    request.session["csrf_token"] = token_csrf
    request.session[CHAVE_TROCA_SENHA_UID] = int(usuario_id)
    request.session[CHAVE_TROCA_SENHA_PORTAL] = PORTAL_TROCA_SENHA_CLIENTE
    request.session[CHAVE_TROCA_SENHA_LEMBRAR] = bool(lembrar)


def _limpar_fluxo_troca_senha(request: Request) -> None:
    request.session.pop(CHAVE_TROCA_SENHA_UID, None)
    request.session.pop(CHAVE_TROCA_SENHA_PORTAL, None)
    request.session.pop(CHAVE_TROCA_SENHA_LEMBRAR, None)


def _usuario_pendente_troca_senha(request: Request, banco: Session) -> Usuario | None:
    if request.session.get(CHAVE_TROCA_SENHA_PORTAL) != PORTAL_TROCA_SENHA_CLIENTE:
        return None

    usuario_id = request.session.get(CHAVE_TROCA_SENHA_UID)
    try:
        usuario_id_int = int(usuario_id)
    except (TypeError, ValueError):
        _limpar_fluxo_troca_senha(request)
        return None

    usuario = banco.get(Usuario, usuario_id_int)
    if not usuario or not usuario_tem_acesso_portal(usuario, PORTAL_CLIENTE):
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


def _render_troca_senha(request: Request, *, erro: str = "", status_code: int = 200) -> HTMLResponse:
    return _render_template(
        request,
        "trocar_senha.html",
        {
            "erro": erro,
            "titulo_pagina": "Troca Obrigatória de Senha",
            "subtitulo_pagina": "Defina sua nova senha para liberar o acesso ao portal admin-cliente.",
            "acao_form": "/cliente/trocar-senha",
            "rota_login": URL_LOGIN,
        },
        status_code=status_code,
    )


def _empresa_usuario(banco: Session, usuario: Usuario) -> Empresa:
    return obter_empresa_usuario(banco, usuario)


def _traduzir_erro_servico_cliente(exc: ValueError) -> HTTPException:
    detalhe = str(exc).strip() or "Operação inválida."
    detalhe_lower = detalhe.lower()

    if "não encontrado" in detalhe_lower or "nao encontrado" in detalhe_lower:
        status_code = status.HTTP_404_NOT_FOUND
    elif (
        "já cadastrado" in detalhe_lower
        or "ja cadastrado" in detalhe_lower
        or "já em uso" in detalhe_lower
        or "ja em uso" in detalhe_lower
        or "limite de usuários" in detalhe_lower
        or "limite de usuarios" in detalhe_lower
        or "conflito" in detalhe_lower
    ):
        status_code = status.HTTP_409_CONFLICT
    else:
        status_code = status.HTTP_400_BAD_REQUEST

    return HTTPException(status_code=status_code, detail=detalhe)


def _rebase_urls_anexos_cliente(payload: Any, *, laudo_id: int) -> Any:
    if isinstance(payload, dict):
        anexos = payload.get("anexos")
        if isinstance(anexos, list):
            for anexo in anexos:
                if not isinstance(anexo, dict):
                    continue
                try:
                    anexo_id = int(anexo.get("id") or 0)
                except (TypeError, ValueError):
                    anexo_id = 0
                if anexo_id > 0:
                    anexo["url"] = f"/cliente/api/mesa/laudos/{int(laudo_id)}/anexos/{anexo_id}"

        for valor in payload.values():
            _rebase_urls_anexos_cliente(valor, laudo_id=laudo_id)
        return payload

    if isinstance(payload, list):
        for item in payload:
            _rebase_urls_anexos_cliente(item, laudo_id=laudo_id)

    return payload


def _payload_json_resposta(resposta: Any) -> dict[str, Any]:
    if not isinstance(resposta, JSONResponse):
        return {}
    try:
        bruto = resposta.body.decode("utf-8")
        payload = json.loads(bruto or "{}")
    except (AttributeError, UnicodeDecodeError, JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _resumir_texto_auditoria(texto: str, *, limite: int = 160) -> str:
    valor = " ".join(str(texto or "").split())
    if len(valor) <= limite:
        return valor
    return f"{valor[: limite - 3].rstrip()}..."


def _titulo_laudo_cliente(banco: Session, *, empresa_id: int, laudo_id: int) -> str:
    laudo = banco.get(Laudo, int(laudo_id))
    if laudo is None or int(getattr(laudo, "empresa_id", 0) or 0) != int(empresa_id):
        return f"Laudo #{laudo_id}"
    payload = serializar_card_laudo(banco, laudo)
    return str(payload.get("titulo") or f"Laudo #{laudo_id}")


def _registrar_auditoria_cliente_segura(
    banco: Session,
    *,
    empresa_id: int,
    ator_usuario_id: int | None,
    acao: str,
    resumo: str,
    detalhe: str = "",
    alvo_usuario_id: int | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    registrar_auditoria_empresa(
        banco,
        empresa_id=empresa_id,
        ator_usuario_id=ator_usuario_id,
        acao=acao,
        resumo=resumo,
        detalhe=detalhe,
        alvo_usuario_id=alvo_usuario_id,
        payload=payload,
    )


__all__ = [
    "URL_LOGIN",
    "URL_PAINEL",
    "CHAVE_TROCA_SENHA_LEMBRAR",
    "_empresa_usuario",
    "_iniciar_fluxo_troca_senha",
    "_limpar_fluxo_troca_senha",
    "_limpar_sessao_cliente",
    "_mensagem_portal_correto",
    "_nome_usuario_cliente",
    "_payload_json_resposta",
    "_rebase_urls_anexos_cliente",
    "_redirect_login_cliente",
    "_registrar_auditoria_cliente_segura",
    "_registrar_sessao_cliente",
    "_render_login_cliente",
    "_render_template",
    "_render_troca_senha",
    "_resumir_texto_auditoria",
    "_titulo_laudo_cliente",
    "_traduzir_erro_servico_cliente",
    "_usuario_pendente_troca_senha",
    "_validar_nova_senha",
]
