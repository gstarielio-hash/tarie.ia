"""
rotas_admin.py — Tariel.ia
Rotas do portal Admin-CEO

Responsabilidades:
- autenticação do painel admin central
- dashboard do admin-ceo
 - gestão SaaS de empresas assinantes
 - cadastro da empresa e do primeiro admin-cliente
- troca de plano, bloqueio e gestão de inspetores
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.admin.client_routes import (
    adicionar_inspetor,
    registrar_novo_cliente,
    resetar_senha_inspetor,
    roteador_admin_clientes,
)
from app.domains.admin.portal_support import (
    URL_LOGIN,
    URL_PAINEL,
    _iniciar_fluxo_troca_senha,
    _limpar_fluxo_troca_senha,
    _limpar_sessao_admin,
    _normalizar_email,
    _redirect_login,
    _registrar_sessao_admin,
    _render_login,
    _render_template,
    _render_troca_senha,
    _usuario_esta_bloqueado,
    _usuario_pendente_troca_senha,
    _validar_csrf,
    _validar_nova_senha,
    _verificar_acesso_admin,
)
from app.domains.admin.services import buscar_metricas_ia_painel
from app.shared.database import Usuario, commit_ou_rollback_operacional, obter_banco
from app.shared.security import (
    criar_hash_senha,
    obter_usuario_html,
    token_esta_ativo,
    verificar_senha,
    verificar_senha_com_upgrade,
)

logger = logging.getLogger("tariel.admin")

roteador_admin = APIRouter()
_ADMIN_CLIENT_ROUTE_COMPAT = (
    adicionar_inspetor,
    registrar_novo_cliente,
    resetar_senha_inspetor,
)


# =========================================================
# AUTENTICAÇÃO / ACESSO
# =========================================================


@roteador_admin.get("/login", response_class=HTMLResponse)
async def tela_login(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    token = request.session.get("session_token")
    usuario_id = request.session.get("usuario_id")

    if token and usuario_id and token_esta_ativo(token):
        usuario = banco.get(Usuario, usuario_id)
        if usuario and _verificar_acesso_admin(usuario):
            return RedirectResponse(url=URL_PAINEL, status_code=303)

    if token or usuario_id:
        _limpar_sessao_admin(request)

    return _render_login(request)


@roteador_admin.get("/trocar-senha", response_class=HTMLResponse)
async def tela_troca_senha_admin(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    if not _usuario_pendente_troca_senha(request, banco):
        return _redirect_login()
    return _render_troca_senha(request)


@roteador_admin.post("/trocar-senha")
async def processar_troca_senha_admin(
    request: Request,
    senha_atual: str = Form(default=""),
    nova_senha: str = Form(default=""),
    confirmar_senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    banco: Session = Depends(obter_banco),
):
    if not _validar_csrf(request, csrf_token):
        return _render_troca_senha(request, erro="Requisição inválida.", status_code=400)

    usuario = _usuario_pendente_troca_senha(request, banco)
    if not usuario:
        return _redirect_login()

    erro_validacao = _validar_nova_senha(senha_atual, nova_senha, confirmar_senha)
    if erro_validacao:
        return _render_troca_senha(request, erro=erro_validacao, status_code=400)

    if not verificar_senha(senha_atual, usuario.senha_hash):
        return _render_troca_senha(request, erro="Senha temporária inválida.", status_code=401)

    usuario.senha_hash = criar_hash_senha(nova_senha)
    usuario.senha_temporaria_ativa = False
    if hasattr(usuario, "registrar_login_sucesso"):
        try:
            usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
        except Exception:
            logger.warning(
                "Falha ao registrar login após troca obrigatória de senha | usuario_id=%s",
                usuario.id,
                exc_info=True,
            )
    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao confirmar troca obrigatoria de senha do admin.",
    )

    _limpar_fluxo_troca_senha(request)
    _registrar_sessao_admin(request, usuario)

    logger.info("Troca obrigatória de senha concluída | usuario_id=%s", usuario.id)
    return RedirectResponse(url=URL_PAINEL, status_code=303)


@roteador_admin.post("/login")
async def processar_login(
    request: Request,
    email: str = Form(default=""),
    senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    banco: Session = Depends(obter_banco),
):
    email_normalizado = _normalizar_email(email)
    senha = senha or ""

    if not email_normalizado or not senha:
        return _render_login(
            request,
            erro="Preencha e-mail e senha.",
            status_code=400,
        )

    if not _validar_csrf(request, csrf_token):
        return _render_login(
            request,
            erro="Requisição inválida.",
            status_code=400,
        )

    usuario = banco.scalar(select(Usuario).where(Usuario.email == email_normalizado))
    senha_valida = False
    hash_atualizado: str | None = None
    if usuario:
        senha_valida, hash_atualizado = verificar_senha_com_upgrade(senha, usuario.senha_hash)

    if not usuario or not senha_valida:
        if usuario and hasattr(usuario, "incrementar_tentativa_falha"):
            try:
                usuario.incrementar_tentativa_falha()
                banco.flush()
            except Exception:
                banco.rollback()
                logger.warning(
                    "Falha ao atualizar tentativas de login | usuario_id=%s",
                    getattr(usuario, "id", None),
                    exc_info=True,
                )

        return _render_login(
            request,
            erro="Credenciais inválidas.",
            status_code=401,
        )

    if not _verificar_acesso_admin(usuario):
        return _render_login(
            request,
            erro=("Área restrita ao Admin-CEO. Para admins-cliente, use /cliente/login."),
            status_code=403,
        )

    if _usuario_esta_bloqueado(usuario):
        return _render_login(
            request,
            erro="Conta bloqueada. Contate o suporte.",
            status_code=403,
        )

    if bool(getattr(usuario, "senha_temporaria_ativa", False)):
        _iniciar_fluxo_troca_senha(request, usuario_id=usuario.id, lembrar=False)
        return RedirectResponse(url="/admin/trocar-senha", status_code=303)

    if hash_atualizado:
        usuario.senha_hash = hash_atualizado

    if hasattr(usuario, "registrar_login_sucesso"):
        try:
            usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
        except Exception:
            logger.warning(
                "Falha ao registrar sucesso de login | usuario_id=%s",
                usuario.id,
                exc_info=True,
            )

    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao confirmar login do admin.",
    )
    _registrar_sessao_admin(request, usuario)

    logger.info(
        "Login admin realizado | usuario_id=%s | email=%s",
        usuario.id,
        email_normalizado,
    )
    return RedirectResponse(url=URL_PAINEL, status_code=303)


@roteador_admin.post("/logout")
async def fazer_logout(
    request: Request,
    csrf_token: str = Form(default=""),
):
    if not _validar_csrf(request, csrf_token):
        return _redirect_login()

    _limpar_sessao_admin(request)
    return RedirectResponse(url=URL_LOGIN, status_code=303)


# =========================================================
# DASHBOARD
# =========================================================


@roteador_admin.get("/painel", response_class=HTMLResponse)
async def painel_faturamento(
    request: Request,
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    try:
        dados = buscar_metricas_ia_painel(banco)
    except Exception:
        logger.error(
            "Falha ao buscar métricas do painel admin | usuario_id=%s",
            usuario.id if usuario else None,
            exc_info=True,
        )
        dados = {}

    return _render_template(
        request,
        "dashboard.html",
        {
            "dados": dados,
            "usuario": usuario,
        },
    )


@roteador_admin.get("/api/metricas-grafico")
async def api_metricas_grafico(
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return JSONResponse(
            status_code=401,
            content={"detail": "Não autenticado."},
        )

    try:
        dados = buscar_metricas_ia_painel(banco)
    except Exception:
        logger.error(
            "Falha ao buscar métricas do gráfico admin | usuario_id=%s",
            usuario.id if usuario else None,
            exc_info=True,
        )
        return JSONResponse(
            status_code=500,
            content={"detail": "Erro ao carregar métricas."},
        )

    labels = [str(item) for item in dados.get("labels_grafico", [])]
    valores = [int(item) for item in dados.get("valores_grafico", [])]
    return JSONResponse(
        content={
            "labels": labels,
            "valores": valores,
        }
    )


roteador_admin.include_router(roteador_admin_clientes)
