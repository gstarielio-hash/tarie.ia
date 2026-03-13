"""
rotas_admin.py — Tariel.ia
Rotas do painel administrativo central
"""

import logging
import os
import secrets
import urllib.parse
from typing import Optional

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from banco_dados import NivelAcesso, Usuario, obter_banco
from seguranca import (
    criar_sessao,
    encerrar_sessao,
    obter_usuario_html,
    token_esta_ativo,
    verificar_senha,
)
from servicos_saas import (
    adicionar_inspetor,
    alternar_bloqueio,
    alterar_plano,
    buscar_detalhe_cliente,
    buscar_metricas_ia_painel,
    buscar_todos_clientes,
    registrar_novo_cliente,
    resetar_senha_inspetor,
)

logger      = logging.getLogger("tariel.admin")
EM_PRODUCAO = os.getenv("AMBIENTE", "desenvolvimento").lower() == "producao"

roteador_admin = APIRouter()
templates      = Jinja2Templates(directory="templates")


# ── Helpers de contexto ────────────────────────────────────────────────────────

def _contexto_base(request: Request) -> dict:
    if "csrf_token" not in request.session:
        request.session["csrf_token"] = secrets.token_urlsafe(32)

    return {
        "request":    request,
        "csrf_token": request.session["csrf_token"],
        "csp_nonce":  getattr(request.state, "csp_nonce", ""),
    }


def _validar_csrf(request: Request, token_form: str) -> bool:
    token_sessao = request.session.get("csrf_token", "")
    return bool(token_sessao and secrets.compare_digest(token_sessao, token_form))


def _redirect_login() -> RedirectResponse:
    return RedirectResponse(url="/admin/login", status_code=303)


def _redirect_ok(url: str, msg: str) -> RedirectResponse:
    return RedirectResponse(
        url=f"{url}?sucesso={urllib.parse.quote(msg)}", status_code=303
    )


def _redirect_err(url: str, msg: str) -> RedirectResponse:
    return RedirectResponse(
        url=f"{url}?erro={urllib.parse.quote(msg)}", status_code=303
    )


# ── Login / Logout ─────────────────────────────────────────────────────────────

@roteador_admin.get("/login", response_class=HTMLResponse)
async def tela_login(request: Request):
    token = request.session.get("session_token")
    if token and token_esta_ativo(token):
        return RedirectResponse(url="/admin/painel", status_code=303)

    return templates.TemplateResponse("login.html", _contexto_base(request))


@roteador_admin.post("/login")
async def processar_login(
    request:    Request,
    # FIX: Form(default="") em vez de Form(...) — evita RequestValidationError
    # quando os campos chegam vazios (JS bloqueado por CSP sem nonce, por exemplo).
    # A validação de obrigatoriedade é feita manualmente abaixo, retornando
    # o template com erro amigável em vez de JSON 422 bruto no browser.
    email:      str     = Form(default=""),
    senha:      str     = Form(default=""),
    csrf_token: str     = Form(default=""),
    banco:      Session = Depends(obter_banco),
):
    ctx = _contexto_base(request)

    # FIX: valida campos obrigatórios manualmente — retorna template com erro
    # em vez de deixar o FastAPI lançar RequestValidationError (JSON 422)
    if not email.strip() or not senha:
        return templates.TemplateResponse(
            "login.html",
            {**ctx, "erro": "Preencha e-mail e senha para continuar."},
            status_code=400,
        )

    if not _validar_csrf(request, csrf_token):
        logger.warning(
            "Tentativa de login com CSRF inválido | ip=%s",
            request.client.host if request.client else "?",
        )
        return templates.TemplateResponse(
            "login.html",
            {**ctx, "erro": "Requisição inválida. Recarregue a página."},
            status_code=400,
        )

    usuario = banco.query(Usuario).filter(Usuario.email == email).first()

    # FIX: mensagem genérica — não revela se o e-mail existe no sistema
    if not usuario or not verificar_senha(senha, usuario.senha_hash):
        logger.warning("Falha de login para email: %s", email)
        return templates.TemplateResponse(
            "login.html",
            {**ctx, "erro": "Credenciais inválidas."},
            status_code=401,
        )

    if usuario.nivel_acesso < int(NivelAcesso.DIRETORIA):
        return templates.TemplateResponse(
            "login.html",
            {**ctx, "erro": "Acesso restrito à Diretoria."},
            status_code=403,
        )

    # FIX: criar_sessao() popula SESSOES_ATIVAS (whitelist server-side)
    token = criar_sessao(usuario.id)
    request.session["session_token"] = token

    # FIX: registra auditoria de login (ultimo_login, IP, zera tentativas)
    ip = request.client.host if request.client else None
    usuario.registrar_login_sucesso(ip=ip)

    # FIX: rotaciona CSRF após login — previne session fixation
    request.session["csrf_token"] = secrets.token_urlsafe(32)

    logger.info(
        "Login bem-sucedido | usuario_id=%d empresa_id=%d ip=%s",
        usuario.id, usuario.empresa_id, ip,
    )

    return RedirectResponse(url="/admin/painel", status_code=303)


@roteador_admin.post("/logout")
async def fazer_logout(
    request:    Request,
    csrf_token: str = Form(default=""),
):
    if not _validar_csrf(request, csrf_token):
        return _redirect_login()

    # FIX: encerrar_sessao recebe o token (str), não o usuario_id (int)
    encerrar_sessao(request.session.get("session_token"))
    request.session.clear()

    return RedirectResponse(url="/admin/login", status_code=303)


# ── Painel ─────────────────────────────────────────────────────────────────────

@roteador_admin.get("/painel", response_class=HTMLResponse)
async def painel_faturamento(
    request: Request,
    banco:   Session           = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return _redirect_login()

    return templates.TemplateResponse("dashboard.html", {
        **_contexto_base(request),
        "dados":   buscar_metricas_ia_painel(banco),
        "usuario": usuario,
    })


# ── Novo Cliente (wizard) ──────────────────────────────────────────────────────

@roteador_admin.get("/novo-cliente", response_class=HTMLResponse)
async def pagina_novo_cliente(
    request: Request,
    banco:   Session           = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return _redirect_login()

    return templates.TemplateResponse("novo_cliente.html", {
        **_contexto_base(request),
        "usuario": usuario,
    })


@roteador_admin.post("/novo-cliente")
async def processar_novo_cliente(
    request:          Request,
    csrf_token:       str = Form(default=""),
    nome:             str = Form(...),
    cnpj:             str = Form(...),
    segmento:         str = Form(""),
    cidade_estado:    str = Form(""),
    plano:            str = Form(...),
    email:            str = Form(...),
    nome_responsavel: str = Form(""),
    observacoes:      str = Form(""),
    banco:            Session           = Depends(obter_banco),
    usuario:          Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return _redirect_login()
    if not _validar_csrf(request, csrf_token):
        return _redirect_err("/admin/novo-cliente", "Requisição inválida.")

    try:
        empresa, _ = registrar_novo_cliente(
            banco, nome, cnpj, email, plano,
            segmento=segmento,
            cidade_estado=cidade_estado,
            nome_responsavel=nome_responsavel,
            observacoes=observacoes,
        )
        return _redirect_ok(
            f"/admin/clientes/{empresa.id}",
            f"Cliente {empresa.nome_fantasia} cadastrado com sucesso",
        )
    except ValueError as e:
        return RedirectResponse(
            url=f"/admin/novo-cliente?erro={urllib.parse.quote(str(e))}",
            status_code=303,
        )


@roteador_admin.post("/cadastrar-empresa")
async def cadastrar_empresa(
    request:    Request,
    csrf_token: str     = Form(default=""),
    nome:       str     = Form(...),
    cnpj:       str     = Form(...),
    email:      str     = Form(...),
    plano:      str     = Form(...),
    banco:      Session           = Depends(obter_banco),
    usuario:    Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return _redirect_login()
    if not _validar_csrf(request, csrf_token):
        return _redirect_err("/admin/painel", "Requisição inválida.")

    try:
        empresa, _ = registrar_novo_cliente(banco, nome, cnpj, email, plano)
        return _redirect_ok(
            "/admin/clientes",
            f"Cliente {empresa.nome_fantasia} cadastrado com sucesso",
        )
    except ValueError as e:
        return _redirect_err("/admin/painel", str(e))


# ── Clientes SaaS ──────────────────────────────────────────────────────────────

@roteador_admin.get("/clientes", response_class=HTMLResponse)
async def lista_clientes(
    request: Request,
    nome:    str     = "",
    plano:   str     = "",
    banco:   Session           = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return _redirect_login()

    clientes = buscar_todos_clientes(banco, filtro_nome=nome, filtro_plano=plano)
    return templates.TemplateResponse("clientes.html", {
        **_contexto_base(request),
        "usuario":         usuario,
        "clientes":        clientes,
        "filtro_nome":     nome,
        "filtro_plano":    plano,
        "total_ativos":    sum(1 for c in clientes if not c.status_bloqueio),
        "total_bloqueios": sum(1 for c in clientes if c.status_bloqueio),
    })


@roteador_admin.get("/clientes/{empresa_id}", response_class=HTMLResponse)
async def detalhe_cliente(
    request:    Request,
    empresa_id: int,
    banco:      Session           = Depends(obter_banco),
    usuario:    Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return _redirect_login()

    dados = buscar_detalhe_cliente(banco, empresa_id)
    if not dados:
        return _redirect_err("/admin/clientes", "Empresa não encontrada.")

    return templates.TemplateResponse("cliente_detalhe.html", {
        **_contexto_base(request),
        "usuario": usuario,
        **dados,
    })


@roteador_admin.post("/clientes/{empresa_id}/bloquear")
async def toggle_bloqueio(
    request:    Request,
    empresa_id: int,
    csrf_token: str     = Form(default=""),
    banco:      Session           = Depends(obter_banco),
    usuario:    Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return _redirect_login()
    if not _validar_csrf(request, csrf_token):
        return _redirect_err(f"/admin/clientes/{empresa_id}", "Requisição inválida.")

    try:
        bloqueado = alternar_bloqueio(banco, empresa_id)
        msg = "Acesso bloqueado com sucesso" if bloqueado else "Acesso restaurado com sucesso"
        return _redirect_ok(f"/admin/clientes/{empresa_id}", msg)
    except ValueError as e:
        return _redirect_err(f"/admin/clientes/{empresa_id}", str(e))


@roteador_admin.post("/clientes/{empresa_id}/trocar-plano")
async def trocar_plano(
    request:    Request,
    empresa_id: int,
    csrf_token: str     = Form(default=""),
    plano:      str     = Form(...),
    banco:      Session           = Depends(obter_banco),
    usuario:    Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return _redirect_login()
    if not _validar_csrf(request, csrf_token):
        return _redirect_err(f"/admin/clientes/{empresa_id}", "Requisição inválida.")

    try:
        alterar_plano(banco, empresa_id, plano)
        return _redirect_ok(f"/admin/clientes/{empresa_id}", f"Plano atualizado para {plano}")
    except ValueError as e:
        return _redirect_err(f"/admin/clientes/{empresa_id}", str(e))


@roteador_admin.post("/clientes/{empresa_id}/resetar-senha/{usuario_id}")
async def resetar_senha(
    request:    Request,
    empresa_id: int,
    usuario_id: int,
    csrf_token: str     = Form(default=""),
    banco:      Session           = Depends(obter_banco),
    usuario:    Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return _redirect_login()
    if not _validar_csrf(request, csrf_token):
        return _redirect_err(f"/admin/clientes/{empresa_id}", "Requisição inválida.")

    try:
        resetar_senha_inspetor(banco, usuario_id)
        logger.info(
            "Senha redefinida | usuario_id=%d por admin_id=%d",
            usuario_id, usuario.id,
        )
        return _redirect_ok(
            f"/admin/clientes/{empresa_id}",
            "Senha do inspetor redefinida com sucesso",
        )
    except ValueError as e:
        return _redirect_err(f"/admin/clientes/{empresa_id}", str(e))


@roteador_admin.post("/clientes/{empresa_id}/adicionar-inspetor")
async def novo_inspetor(
    request:    Request,
    empresa_id: int,
    csrf_token: str     = Form(default=""),
    nome:       str     = Form(...),
    email:      str     = Form(...),
    banco:      Session           = Depends(obter_banco),
    usuario:    Optional[Usuario] = Depends(obter_usuario_html),
):
    if not usuario:
        return _redirect_login()
    if not _validar_csrf(request, csrf_token):
        return _redirect_err(f"/admin/clientes/{empresa_id}", "Requisição inválida.")

    try:
        adicionar_inspetor(banco, empresa_id, nome, email)
        return _redirect_ok(
            f"/admin/clientes/{empresa_id}",
            f"Inspetor {nome} adicionado com sucesso",
        )
    except ValueError as e:
        return _redirect_err(f"/admin/clientes/{empresa_id}", str(e))
