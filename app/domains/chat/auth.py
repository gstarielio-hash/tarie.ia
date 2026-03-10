"""Rotas de autenticação e páginas do portal inspetor."""

from __future__ import annotations

import secrets
from typing import Optional

from fastapi import Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.routing import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.chat.routes import (
    CHAVE_CSRF_INSPETOR,
    CHAVE_TROCA_SENHA_LEMBRAR,
    NIVEIS_PERMITIDOS_APP,
    PADRAO_SUPORTE_WHATSAPP,
    _iniciar_fluxo_troca_senha,
    _limpar_fluxo_troca_senha,
    _render_troca_senha,
    _settings,
    _usuario_pendente_troca_senha,
    _validar_nova_senha,
    configuracoes,
    contexto_base,
    contar_laudos_mes,
    estado_relatorio_sanitizado,
    logger,
    montar_limites_para_template,
    obter_limite_empresa,
    redirecionar_por_nivel,
    templates,
    usuario_nome,
    validar_csrf,
)
from app.domains.chat.normalization import normalizar_email
from app.shared.database import Laudo, NivelAcesso, PlanoEmpresa, Usuario, obter_banco
from app.shared.security import (
    PORTAL_INSPETOR,
    criar_hash_senha,
    criar_sessao,
    definir_sessao_portal,
    encerrar_sessao,
    limpar_sessao_portal,
    obter_dados_sessao_portal,
    obter_usuario_html,
    token_esta_ativo,
    usuario_tem_bloqueio_ativo,
    verificar_senha,
)

roteador_auth = APIRouter()


async def tela_login_app(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    dados_sessao = obter_dados_sessao_portal(request.session, portal=PORTAL_INSPETOR)
    token = dados_sessao.get("token")
    if token and token_esta_ativo(token):
        usuario_id = dados_sessao.get("usuario_id")
        if usuario_id:
            usuario = banco.get(Usuario, usuario_id)
            if usuario:
                return redirecionar_por_nivel(usuario)
        limpar_sessao_portal(request.session, portal=PORTAL_INSPETOR)

    return templates.TemplateResponse(request, "login_app.html", contexto_base(request))


async def tela_troca_senha_app(
    request: Request,
    banco: Session = Depends(obter_banco),
):
    if not _usuario_pendente_troca_senha(request, banco):
        return RedirectResponse(url="/app/login", status_code=303)
    return _render_troca_senha(request)


async def processar_troca_senha_app(
    request: Request,
    senha_atual: str = Form(default=""),
    nova_senha: str = Form(default=""),
    confirmar_senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    banco: Session = Depends(obter_banco),
):
    if not validar_csrf(request, csrf_token):
        return _render_troca_senha(request, erro="Requisição inválida.", status_code=400)

    usuario = _usuario_pendente_troca_senha(request, banco)
    if not usuario:
        return RedirectResponse(url="/app/login", status_code=303)

    erro_validacao = _validar_nova_senha(senha_atual, nova_senha, confirmar_senha)
    if erro_validacao:
        return _render_troca_senha(request, erro=erro_validacao, status_code=400)

    if not verificar_senha(senha_atual, usuario.senha_hash):
        return _render_troca_senha(request, erro="Senha temporária inválida.", status_code=401)

    lembrar = bool(request.session.get(CHAVE_TROCA_SENHA_LEMBRAR, False))
    usuario.senha_hash = criar_hash_senha(nova_senha)
    usuario.senha_temporaria_ativa = False
    if hasattr(usuario, "registrar_login_sucesso"):
        usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
    banco.commit()

    _limpar_fluxo_troca_senha(request)

    token = criar_sessao(usuario.id, lembrar=lembrar)
    definir_sessao_portal(
        request.session,
        portal=PORTAL_INSPETOR,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=usuario_nome(usuario),
    )
    request.session[CHAVE_CSRF_INSPETOR] = secrets.token_urlsafe(32)

    logger.info("Troca obrigatória de senha concluída | usuario_id=%s", usuario.id)
    return RedirectResponse(url="/app/", status_code=303)


async def processar_login_app(
    request: Request,
    email: str = Form(default=""),
    senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    lembrar: bool = Form(default=False),
    banco: Session = Depends(obter_banco),
):
    ctx = contexto_base(request)
    email_normalizado = normalizar_email(email)

    if not email_normalizado or not senha:
        return templates.TemplateResponse(
            request,
            "login_app.html",
            {**ctx, "erro": "Preencha os dados."},
            status_code=400,
        )

    if not validar_csrf(request, csrf_token):
        return templates.TemplateResponse(
            request,
            "login_app.html",
            {**ctx, "erro": "Requisição inválida."},
            status_code=400,
        )

    usuario = banco.scalar(select(Usuario).where(Usuario.email == email_normalizado))

    senha_valida = False
    if usuario:
        try:
            senha_valida = verificar_senha(senha, usuario.senha_hash)
        except Exception:
            logger.warning("Falha ao verificar hash de senha | email=%s", email_normalizado)

    if not usuario or not senha_valida:
        if usuario and hasattr(usuario, "incrementar_tentativa_falha"):
            usuario.incrementar_tentativa_falha()
            banco.commit()

        return templates.TemplateResponse(
            request,
            "login_app.html",
            {**ctx, "erro": "Credenciais inválidas."},
            status_code=401,
        )

    if usuario.nivel_acesso not in NIVEIS_PERMITIDOS_APP:
        return templates.TemplateResponse(
            request,
            "login_app.html",
            {**ctx, "erro": "Acesso negado. Use o portal correto para sua função."},
            status_code=403,
        )

    if usuario_tem_bloqueio_ativo(usuario):
        return templates.TemplateResponse(
            request,
            "login_app.html",
            {**ctx, "erro": "Acesso bloqueado. Contate o suporte."},
            status_code=403,
        )

    token_anterior = obter_dados_sessao_portal(
        request.session,
        portal=PORTAL_INSPETOR,
    ).get("token")
    if token_anterior:
        encerrar_sessao(token_anterior)

    if bool(getattr(usuario, "senha_temporaria_ativa", False)):
        _iniciar_fluxo_troca_senha(request, usuario_id=usuario.id, lembrar=lembrar)
        return RedirectResponse(url="/app/trocar-senha", status_code=303)

    token = criar_sessao(usuario.id, lembrar=lembrar)
    definir_sessao_portal(
        request.session,
        portal=PORTAL_INSPETOR,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=usuario_nome(usuario),
    )
    request.session[CHAVE_CSRF_INSPETOR] = secrets.token_urlsafe(32)

    if hasattr(usuario, "registrar_login_sucesso"):
        usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)

    banco.commit()
    logger.info("Login inspetor | usuario_id=%s | email=%s", usuario.id, email_normalizado)

    return RedirectResponse(url="/app/", status_code=303)


async def logout_inspetor(
    request: Request,
    csrf_token: str = Form(default=""),
):
    if not validar_csrf(request, csrf_token):
        return RedirectResponse(url="/app/login", status_code=303)

    token = obter_dados_sessao_portal(request.session, portal=PORTAL_INSPETOR).get("token")
    encerrar_sessao(token)
    limpar_sessao_portal(request.session, portal=PORTAL_INSPETOR)
    request.session.pop(CHAVE_CSRF_INSPETOR, None)
    return RedirectResponse(url="/app/login", status_code=303)


async def pagina_inicial(
    request: Request,
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return RedirectResponse(url="/app/login", status_code=303)

    if usuario.nivel_acesso != NivelAcesso.INSPETOR.value:
        return redirecionar_por_nivel(usuario)

    estado_relatorio = estado_relatorio_sanitizado(request, banco, usuario)

    laudos_recentes = (
        banco.query(Laudo)
        .filter(
            Laudo.empresa_id == usuario.empresa_id,
            Laudo.usuario_id == usuario.id,
        )
        .order_by(
            Laudo.pinado.desc(),
            Laudo.criado_em.desc(),
        )
        .limit(20)
        .all()
    )

    limite = obter_limite_empresa(usuario, banco)
    laudos_mes_usados = contar_laudos_mes(banco, usuario.empresa_id)

    telefone_suporte = (getattr(configuracoes, "SUPORTE_WHATSAPP", "") if configuracoes else "") or PADRAO_SUPORTE_WHATSAPP

    ambiente_atual = (
        (getattr(configuracoes, "AMBIENTE", "") if configuracoes else "")
        or _settings.ambiente
    )

    return templates.TemplateResponse(
        request,
        "index.html",
        {
            **contexto_base(request),
            "usuario": usuario,
            "laudos_recentes": laudos_recentes,
            "laudos_mes_usados": laudos_mes_usados,
            "laudos_mes_limite": getattr(limite, "laudos_mes", None),
            "plano_upload_doc": getattr(limite, "upload_doc", False),
            "deep_research_disponivel": getattr(limite, "deep_research", False),
            "estado_relatorio": estado_relatorio,
            "suporte_whatsapp": telefone_suporte,
            "ambiente": ambiente_atual,
        },
    )


async def pagina_planos(
    request: Request,
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return RedirectResponse(url="/app/login", status_code=303)

    if usuario.nivel_acesso != NivelAcesso.INSPETOR.value:
        return redirecionar_por_nivel(usuario)

    limites = montar_limites_para_template(banco)

    return templates.TemplateResponse(
        request,
        "planos.html",
        {
            **contexto_base(request),
            "usuario": usuario,
            "limites": limites,
            "planos": PlanoEmpresa,
        },
    )

# Login / troca de senha
roteador_auth.add_api_route(
    "/login",
    tela_login_app,
    methods=["GET"],
    response_class=HTMLResponse,
)
roteador_auth.add_api_route(
    "/trocar-senha",
    tela_troca_senha_app,
    methods=["GET"],
    response_class=HTMLResponse,
)
roteador_auth.add_api_route(
    "/trocar-senha",
    processar_troca_senha_app,
    methods=["POST"],
)
roteador_auth.add_api_route(
    "/login",
    processar_login_app,
    methods=["POST"],
)
roteador_auth.add_api_route(
    "/logout",
    logout_inspetor,
    methods=["POST"],
)

# Páginas principais do portal inspetor
roteador_auth.add_api_route(
    "/",
    pagina_inicial,
    methods=["GET"],
    response_class=HTMLResponse,
)
roteador_auth.add_api_route(
    "/planos",
    pagina_planos,
    methods=["GET"],
    response_class=HTMLResponse,
)

__all__ = [
    "roteador_auth",
    "tela_login_app",
    "tela_troca_senha_app",
    "processar_troca_senha_app",
    "processar_login_app",
    "logout_inspetor",
    "pagina_inicial",
    "pagina_planos",
]
