"""Portal do admin-cliente multiempresa."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Form, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.cliente.chat_routes import roteador_cliente_chat
from app.domains.cliente.common import validar_csrf_cliente
from app.domains.cliente.dashboard import (
    bootstrap_cliente as _bootstrap_cliente,
    resumo_empresa_cliente as _resumo_empresa_cliente,
)
from app.domains.cliente.management_routes import (
    roteador_cliente_management,
)
from app.domains.cliente.portal_bridge import (
    api_iniciar_relatorio_cliente as _api_iniciar_relatorio_cliente_bridge,
    api_status_relatorio_cliente as _api_status_relatorio_cliente_bridge,
)
from app.domains.cliente.route_support import (
    CHAVE_TROCA_SENHA_LEMBRAR,
    URL_LOGIN,
    URL_PAINEL,
    _empresa_usuario,
    _iniciar_fluxo_troca_senha,
    _limpar_fluxo_troca_senha,
    _limpar_sessao_cliente,
    _mensagem_portal_correto,
    _redirect_login_cliente,
    _registrar_sessao_cliente,
    _render_login_cliente,
    _render_template,
    _render_troca_senha,
    _usuario_pendente_troca_senha,
    _validar_nova_senha,
)
from app.shared.database import Usuario, commit_ou_rollback_operacional, obter_banco
from app.shared.security import (
    PORTAL_CLIENTE,
    criar_hash_senha,
    exigir_admin_cliente,
    obter_usuario_html,
    usuario_tem_acesso_portal,
    usuario_tem_bloqueio_ativo,
    verificar_senha,
    verificar_senha_com_upgrade,
)

logger = logging.getLogger("tariel.cliente")

_CLIENTE_PORTAL_BRIDGE_CONTRACT = (
    _api_status_relatorio_cliente_bridge,
    _api_iniciar_relatorio_cliente_bridge,
)

roteador_cliente = APIRouter()

@roteador_cliente.get("/", include_in_schema=False)
async def raiz_cliente(
    request: Request,
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if usuario_tem_acesso_portal(usuario, PORTAL_CLIENTE):
        return RedirectResponse(url=URL_PAINEL, status_code=status.HTTP_303_SEE_OTHER)
    return RedirectResponse(url=URL_LOGIN, status_code=status.HTTP_303_SEE_OTHER)


@roteador_cliente.get("/login", response_class=HTMLResponse)
async def tela_login_cliente(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    usuario = obter_usuario_html(request, banco)
    if usuario_tem_acesso_portal(usuario, PORTAL_CLIENTE):
        return RedirectResponse(url=URL_PAINEL, status_code=status.HTTP_303_SEE_OTHER)
    return _render_login_cliente(request)


@roteador_cliente.post("/login")
async def processar_login_cliente(
    request: Request,
    email: str = Form(default=""),
    senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    lembrar: bool = Form(default=False),
    banco: Session = Depends(obter_banco),
):
    email_normalizado = (email or "").strip().lower()
    senha = senha or ""

    if not email_normalizado or not senha:
        return _render_login_cliente(
            request,
            erro="Preencha e-mail e senha.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if not validar_csrf_cliente(request, csrf_token):
        return _render_login_cliente(
            request,
            erro="Requisição inválida.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    usuario = banco.scalar(select(Usuario).where(Usuario.email == email_normalizado))
    senha_valida = False
    hash_atualizado: str | None = None
    if usuario:
        senha_valida, hash_atualizado = verificar_senha_com_upgrade(senha, usuario.senha_hash)
    if not usuario or not senha_valida:
        if usuario and hasattr(usuario, "incrementar_tentativa_falha"):
            usuario.incrementar_tentativa_falha()
            banco.flush()
        return _render_login_cliente(
            request,
            erro="Credenciais inválidas.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    if not usuario_tem_acesso_portal(usuario, PORTAL_CLIENTE):
        return _render_login_cliente(
            request,
            erro=_mensagem_portal_correto(usuario),
            status_code=status.HTTP_403_FORBIDDEN,
        )

    if usuario_tem_bloqueio_ativo(usuario):
        return _render_login_cliente(
            request,
            erro="Acesso bloqueado. Contate o administrador da empresa.",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    if bool(getattr(usuario, "senha_temporaria_ativa", False)):
        _iniciar_fluxo_troca_senha(request, usuario_id=usuario.id, lembrar=lembrar)
        return RedirectResponse(url="/cliente/trocar-senha", status_code=status.HTTP_303_SEE_OTHER)

    if hash_atualizado:
        usuario.senha_hash = hash_atualizado

    if hasattr(usuario, "registrar_login_sucesso"):
        try:
            usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
        except Exception:
            logger.warning("Falha ao registrar sucesso de login do admin-cliente | usuario_id=%s", usuario.id, exc_info=True)

    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao confirmar login do admin-cliente.",
    )
    _registrar_sessao_cliente(request, usuario, lembrar=lembrar)

    logger.info("Login admin-cliente | usuario_id=%s | empresa_id=%s", usuario.id, usuario.empresa_id)
    return RedirectResponse(url=URL_PAINEL, status_code=status.HTTP_303_SEE_OTHER)


@roteador_cliente.get("/trocar-senha", response_class=HTMLResponse)
async def tela_troca_senha_cliente(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    if not _usuario_pendente_troca_senha(request, banco):
        return _redirect_login_cliente()
    return _render_troca_senha(request)


@roteador_cliente.post("/trocar-senha")
async def processar_troca_senha_cliente(
    request: Request,
    senha_atual: str = Form(default=""),
    nova_senha: str = Form(default=""),
    confirmar_senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    banco: Session = Depends(obter_banco),
):
    if not validar_csrf_cliente(request, csrf_token):
        return _render_troca_senha(request, erro="Requisição inválida.", status_code=status.HTTP_400_BAD_REQUEST)

    usuario = _usuario_pendente_troca_senha(request, banco)
    if not usuario:
        return _redirect_login_cliente()

    erro_validacao = _validar_nova_senha(senha_atual, nova_senha, confirmar_senha)
    if erro_validacao:
        return _render_troca_senha(request, erro=erro_validacao, status_code=status.HTTP_400_BAD_REQUEST)

    if not verificar_senha(senha_atual, usuario.senha_hash):
        return _render_troca_senha(request, erro="Senha temporária inválida.", status_code=status.HTTP_401_UNAUTHORIZED)

    lembrar = bool(request.session.get(CHAVE_TROCA_SENHA_LEMBRAR, False))
    usuario.senha_hash = criar_hash_senha(nova_senha)
    usuario.senha_temporaria_ativa = False
    if hasattr(usuario, "registrar_login_sucesso"):
        usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao confirmar troca obrigatoria de senha do admin-cliente.",
    )

    _limpar_fluxo_troca_senha(request)
    _registrar_sessao_cliente(request, usuario, lembrar=lembrar)

    logger.info("Troca obrigatória de senha concluída | admin_cliente_id=%s", usuario.id)
    return RedirectResponse(url=URL_PAINEL, status_code=status.HTTP_303_SEE_OTHER)


@roteador_cliente.post("/logout")
async def logout_cliente(
    request: Request,
    csrf_token: str = Form(default=""),
):
    if not validar_csrf_cliente(request, csrf_token):
        return _redirect_login_cliente()

    _limpar_sessao_cliente(request)
    return _redirect_login_cliente()


@roteador_cliente.get("/painel", response_class=HTMLResponse)
async def painel_cliente(
    request: Request,
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
    banco: Session = Depends(obter_banco),
):
    if not usuario_tem_acesso_portal(usuario, PORTAL_CLIENTE):
        return _redirect_login_cliente()

    assert usuario is not None
    empresa = _empresa_usuario(banco, usuario)
    return _render_template(
        request,
        "cliente_portal.html",
        {
            "usuario": usuario,
            "empresa": empresa,
        },
    )


@roteador_cliente.get("/api/bootstrap")
async def api_bootstrap_cliente(
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    return _bootstrap_cliente(banco, usuario)


@roteador_cliente.get("/api/empresa/resumo")
async def api_empresa_resumo_cliente(
    usuario: Usuario = Depends(exigir_admin_cliente),
    banco: Session = Depends(obter_banco),
):
    return _resumo_empresa_cliente(banco, usuario)


roteador_cliente.include_router(roteador_cliente_chat)
roteador_cliente.include_router(roteador_cliente_management)
