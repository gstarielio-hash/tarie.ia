from __future__ import annotations

import secrets

from fastapi import Depends, Form, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.revisor.base import (
    CHAVE_CSRF_REVISOR,
    CHAVE_TROCA_SENHA_LEMBRAR,
    _iniciar_fluxo_troca_senha,
    _limpar_fluxo_troca_senha,
    _render_login_revisor,
    _render_troca_senha_revisor,
    _usuario_pendente_troca_senha,
    _validar_nova_senha,
    logger,
    roteador_revisor,
)
from app.domains.revisor.common import _validar_csrf
from app.shared.database import Usuario, commit_ou_rollback_operacional, obter_banco
from app.shared.security import (
    PORTAL_REVISOR,
    criar_hash_senha,
    criar_sessao,
    definir_sessao_portal,
    encerrar_sessao,
    limpar_sessao_portal,
    obter_dados_sessao_portal,
    obter_usuario_html,
    usuario_tem_acesso_portal,
    usuario_tem_bloqueio_ativo,
    verificar_senha,
    verificar_senha_com_upgrade,
)


@roteador_revisor.get("/login", response_class=HTMLResponse)
async def tela_login_revisor(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    usuario = obter_usuario_html(request, banco)
    if usuario_tem_acesso_portal(usuario, PORTAL_REVISOR):
        return RedirectResponse(url="/revisao/painel", status_code=status.HTTP_303_SEE_OTHER)

    return _render_login_revisor(request)


@roteador_revisor.get("/trocar-senha", response_class=HTMLResponse)
async def tela_troca_senha_revisor(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    if not _usuario_pendente_troca_senha(request, banco):
        return RedirectResponse(url="/revisao/login", status_code=status.HTTP_303_SEE_OTHER)
    return _render_troca_senha_revisor(request)


@roteador_revisor.post("/trocar-senha")
async def processar_troca_senha_revisor(
    request: Request,
    senha_atual: str = Form(default=""),
    nova_senha: str = Form(default=""),
    confirmar_senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request, csrf_token):
        return _render_troca_senha_revisor(
            request,
            erro="Requisição inválida.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    usuario = _usuario_pendente_troca_senha(request, banco)
    if not usuario:
        return RedirectResponse(url="/revisao/login", status_code=status.HTTP_303_SEE_OTHER)

    erro_validacao = _validar_nova_senha(senha_atual, nova_senha, confirmar_senha)
    if erro_validacao:
        return _render_troca_senha_revisor(request, erro=erro_validacao, status_code=status.HTTP_400_BAD_REQUEST)

    if not verificar_senha(senha_atual, usuario.senha_hash):
        return _render_troca_senha_revisor(
            request,
            erro="Senha temporária inválida.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    lembrar = bool(request.session.get(CHAVE_TROCA_SENHA_LEMBRAR, False))
    usuario.senha_hash = criar_hash_senha(nova_senha)
    usuario.senha_temporaria_ativa = False
    if hasattr(usuario, "registrar_login_sucesso"):
        usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao confirmar troca obrigatoria de senha do revisor.",
    )

    _limpar_fluxo_troca_senha(request)

    token = criar_sessao(usuario.id, lembrar=lembrar)
    definir_sessao_portal(
        request.session,
        portal=PORTAL_REVISOR,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None) or f"Revisor #{usuario.id}",
    )
    request.session[CHAVE_CSRF_REVISOR] = secrets.token_urlsafe(32)

    logger.info("Troca obrigatória de senha concluída | usuario_id=%s", usuario.id)
    return RedirectResponse(url="/revisao/painel", status_code=status.HTTP_303_SEE_OTHER)


@roteador_revisor.post("/login")
async def processar_login_revisor(
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
        return _render_login_revisor(
            request,
            erro="Preencha e-mail e senha.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    if not _validar_csrf(request, csrf_token):
        return _render_login_revisor(
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

        return _render_login_revisor(
            request,
            erro="Credenciais inválidas.",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    if not usuario_tem_acesso_portal(usuario, PORTAL_REVISOR):
        return _render_login_revisor(
            request,
            erro="Acesso negado. Use o portal correto para sua função.",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    if usuario_tem_bloqueio_ativo(usuario):
        return _render_login_revisor(
            request,
            erro="Acesso bloqueado. Contate o suporte.",
            status_code=status.HTTP_403_FORBIDDEN,
        )

    token_anterior = obter_dados_sessao_portal(
        request.session,
        portal=PORTAL_REVISOR,
    ).get("token")
    if token_anterior:
        encerrar_sessao(token_anterior)

    if bool(getattr(usuario, "senha_temporaria_ativa", False)):
        _iniciar_fluxo_troca_senha(request, usuario_id=usuario.id, lembrar=lembrar)
        return RedirectResponse(url="/revisao/trocar-senha", status_code=status.HTTP_303_SEE_OTHER)

    if hash_atualizado:
        usuario.senha_hash = hash_atualizado

    if hasattr(usuario, "registrar_login_sucesso"):
        try:
            usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
        except Exception:
            logger.warning(
                "Falha ao registrar sucesso de login revisor | usuario_id=%s",
                usuario.id,
                exc_info=True,
            )

    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao confirmar login do revisor.",
    )
    token = criar_sessao(usuario.id, lembrar=lembrar)
    definir_sessao_portal(
        request.session,
        portal=PORTAL_REVISOR,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None) or f"Revisor #{usuario.id}",
    )
    request.session[CHAVE_CSRF_REVISOR] = secrets.token_urlsafe(32)

    logger.info("Login revisor | usuario_id=%s | email=%s", usuario.id, email_normalizado)
    return RedirectResponse(url="/revisao/painel", status_code=status.HTTP_303_SEE_OTHER)


@roteador_revisor.post("/logout")
async def logout_revisor(
    request: Request,
    csrf_token: str = Form(default=""),
):
    if not _validar_csrf(request, csrf_token):
        return RedirectResponse(url="/revisao/login", status_code=status.HTTP_303_SEE_OTHER)

    token = obter_dados_sessao_portal(request.session, portal=PORTAL_REVISOR).get("token")
    encerrar_sessao(token)
    limpar_sessao_portal(request.session, portal=PORTAL_REVISOR)
    request.session.pop(CHAVE_CSRF_REVISOR, None)
    return RedirectResponse(url="/revisao/login", status_code=status.HTTP_303_SEE_OTHER)


__all__ = [
    "logout_revisor",
    "processar_login_revisor",
    "processar_troca_senha_revisor",
    "tela_login_revisor",
    "tela_troca_senha_revisor",
]
