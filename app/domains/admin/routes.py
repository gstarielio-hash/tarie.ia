"""
rotas_admin.py — Tariel Control Tower
WF Engenharia · Rotas do painel administrativo (Diretoria)

Responsabilidades:
- autenticação do painel admin
- dashboard da diretoria
- gestão SaaS de clientes
- cadastro de empresa/cliente
- troca de plano, bloqueio e gestão de inspetores
"""

from __future__ import annotations

import logging
import secrets
from typing import Any, Optional, TypeGuard
from urllib.parse import quote

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.settings import get_settings
from app.shared.database import NivelAcesso, Usuario, obter_banco
from app.shared.security import (
    criar_hash_senha,
    criar_sessao,
    encerrar_sessao,
    obter_usuario_html,
    token_esta_ativo,
    usuario_tem_bloqueio_ativo,
    verificar_senha,
)
from app.domains.admin.services import (
    adicionar_inspetor,
    alternar_bloqueio,
    alterar_plano,
    atualizar_crea_revisor,
    buscar_detalhe_cliente,
    buscar_metricas_ia_painel,
    buscar_todos_clientes,
    registrar_novo_cliente,
    resetar_senha_usuario_empresa,
)

logger = logging.getLogger("tariel.admin")

# =========================================================
# CONFIGURAÇÃO
# =========================================================

_settings = get_settings()
AMBIENTE = _settings.ambiente
EM_PRODUCAO = _settings.em_producao

URL_LOGIN = "/admin/login"
URL_PAINEL = "/admin/painel"
URL_CLIENTES = "/admin/clientes"
URL_NOVO_CLIENTE = "/admin/novo-cliente"

# Mantém compatibilidade com aliases do front/legado.
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

roteador_admin = APIRouter()
templates = Jinja2Templates(directory="templates")


# =========================================================
# HELPERS
# =========================================================


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
        (f"Senha temporária para {ref}: {senha_temp}. Compartilhe em canal seguro e oriente a troca no primeiro acesso."),
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
    request.session.clear()
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


def _processar_cadastro_cliente(
    *,
    request: Request,
    banco: Session,
    usuario_admin: Usuario,
    nome: str,
    cnpj: str,
    email: str,
    plano: str,
    segmento: str = "",
    cidade_estado: str = "",
    nome_responsavel: str = "",
    observacoes: str = "",
    url_erro: str,
    url_sucesso: str | None = None,
) -> RedirectResponse:
    nome = _normalizar_texto(nome, max_len=200)
    cnpj = _normalizar_texto(cnpj, max_len=18)
    email = _normalizar_email(email)
    plano = _normalizar_plano(plano)
    segmento = _normalizar_texto(segmento, max_len=100)
    cidade_estado = _normalizar_texto(cidade_estado, max_len=100)
    nome_responsavel = _normalizar_texto(nome_responsavel, max_len=150)
    observacoes = _normalizar_texto(observacoes)

    if not nome or not cnpj or not email or not plano:
        return _redirect_err(url_erro, "Preencha os campos obrigatórios.")

    try:
        empresa, senha_inicial = registrar_novo_cliente(
            banco,
            nome=nome,
            cnpj=cnpj,
            email_admin=email,
            plano=plano,
            segmento=segmento,
            cidade_estado=cidade_estado,
            nome_responsavel=nome_responsavel,
            observacoes=observacoes,
        )

        logger.info(
            "Cliente cadastrado | empresa_id=%s | admin_id=%s | email_admin=%s",
            empresa.id,
            usuario_admin.id,
            email,
        )

        _flash_senha_temporaria(
            request,
            referencia=f"administrador de {empresa.nome_fantasia}",
            senha=senha_inicial,
        )

        destino = url_sucesso or f"{URL_CLIENTES}/{empresa.id}"
        return _redirect_ok(
            destino,
            f"Cliente {empresa.nome_fantasia} cadastrado com sucesso.",
        )

    except ValueError as erro:
        return _redirect_err(url_erro, str(erro))
    except Exception:
        logger.error(
            "Falha inesperada ao cadastrar cliente | admin_id=%s | email=%s",
            usuario_admin.id,
            email,
            exc_info=True,
        )
        return _redirect_err(url_erro, "Erro interno. Tente novamente.")


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
    banco.commit()

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

    if not usuario or not verificar_senha(senha, usuario.senha_hash):
        if usuario and hasattr(usuario, "incrementar_tentativa_falha"):
            try:
                usuario.incrementar_tentativa_falha()
                banco.commit()
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
            erro=("Área restrita à administração central. Para clientes, use /cliente/login."),
            status_code=403,
        )

    if _usuario_esta_bloqueado(usuario):
        return _render_login(
            request,
            erro="Conta bloqueada. Contate o suporte.",
            status_code=403,
        )

    if bool(getattr(usuario, "senha_temporaria_ativa", False)):
        token_anterior = request.session.get("session_token")
        if token_anterior:
            encerrar_sessao(token_anterior)
        _iniciar_fluxo_troca_senha(request, usuario_id=usuario.id, lembrar=False)
        return RedirectResponse(url="/admin/trocar-senha", status_code=303)

    _registrar_sessao_admin(request, usuario)

    if hasattr(usuario, "registrar_login_sucesso"):
        try:
            usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
        except Exception:
            logger.warning(
                "Falha ao registrar sucesso de login | usuario_id=%s",
                usuario.id,
                exc_info=True,
            )

    banco.commit()

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


# =========================================================
# CADASTRO DE CLIENTE / EMPRESA
# =========================================================


@roteador_admin.get("/novo-cliente", response_class=HTMLResponse)
async def pagina_novo_cliente(
    request: Request,
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    return _render_template(
        request,
        "novo_cliente.html",
        {"usuario": usuario},
    )


@roteador_admin.post("/novo-cliente")
async def processar_novo_cliente(
    request: Request,
    csrf_token: str = Form(default=""),
    nome: str = Form(...),
    cnpj: str = Form(...),
    segmento: str = Form(default=""),
    cidade_estado: str = Form(default=""),
    plano: str = Form(...),
    email: str = Form(...),
    nome_responsavel: str = Form(default=""),
    observacoes: str = Form(default=""),
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    if not _validar_csrf(request, csrf_token):
        return _redirect_err(URL_NOVO_CLIENTE, "Requisição inválida.")

    return _processar_cadastro_cliente(
        request=request,
        banco=banco,
        usuario_admin=usuario,
        nome=nome,
        cnpj=cnpj,
        email=email,
        plano=plano,
        segmento=segmento,
        cidade_estado=cidade_estado,
        nome_responsavel=nome_responsavel,
        observacoes=observacoes,
        url_erro=URL_NOVO_CLIENTE,
    )


@roteador_admin.post("/cadastrar-empresa")
async def cadastrar_empresa(
    request: Request,
    csrf_token: str = Form(default=""),
    nome: str = Form(...),
    cnpj: str = Form(...),
    email: str = Form(...),
    plano: str = Form(...),
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    if not _validar_csrf(request, csrf_token):
        return _redirect_err(URL_PAINEL, "Requisição inválida.")

    return _processar_cadastro_cliente(
        request=request,
        banco=banco,
        usuario_admin=usuario,
        nome=nome,
        cnpj=cnpj,
        email=email,
        plano=plano,
        url_erro=URL_PAINEL,
        url_sucesso=URL_CLIENTES,
    )


# =========================================================
# GESTÃO DE CLIENTES
# =========================================================


@roteador_admin.get("/clientes", response_class=HTMLResponse)
async def lista_clientes(
    request: Request,
    nome: str = "",
    plano: str = "",
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    nome = _normalizar_texto(nome, max_len=120)
    plano = _normalizar_plano(plano) if plano else ""

    try:
        clientes = buscar_todos_clientes(
            banco,
            filtro_nome=nome,
            filtro_plano=plano,
        )
    except Exception:
        logger.error(
            "Falha ao buscar lista de clientes | admin_id=%s",
            usuario.id if usuario else None,
            exc_info=True,
        )
        clientes = []

    total_ativos = sum(1 for cliente in clientes if not getattr(cliente, "status_bloqueio", False))
    total_bloqueios = sum(1 for cliente in clientes if getattr(cliente, "status_bloqueio", False))

    return _render_template(
        request,
        "clientes.html",
        {
            "usuario": usuario,
            "clientes": clientes,
            "filtro_nome": nome,
            "filtro_plano": plano,
            "total_ativos": total_ativos,
            "total_bloqueios": total_bloqueios,
        },
    )


@roteador_admin.get("/clientes/{empresa_id}", response_class=HTMLResponse)
async def detalhe_cliente(
    request: Request,
    empresa_id: int,
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    try:
        dados = buscar_detalhe_cliente(banco, empresa_id)
    except Exception:
        logger.error(
            "Falha ao buscar detalhe do cliente | empresa_id=%s | admin_id=%s",
            empresa_id,
            usuario.id if usuario else None,
            exc_info=True,
        )
        return _redirect_err(URL_CLIENTES, "Erro ao carregar empresa.")

    if not dados:
        return _redirect_err(URL_CLIENTES, "Empresa não encontrada.")

    return _render_template(
        request,
        "cliente_detalhe.html",
        {
            "usuario": usuario,
            **dados,
        },
    )


@roteador_admin.post("/clientes/{empresa_id}/bloquear")
async def toggle_bloqueio(
    request: Request,
    empresa_id: int,
    csrf_token: str = Form(default=""),
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    if not _validar_csrf(request, csrf_token):
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", "Requisição inválida.")

    try:
        bloqueado = alternar_bloqueio(banco, empresa_id)
        mensagem = "Acesso bloqueado com sucesso." if bloqueado else "Acesso restaurado com sucesso."

        logger.info(
            "Bloqueio de empresa alterado | empresa_id=%s | bloqueado=%s | admin_id=%s",
            empresa_id,
            bloqueado,
            usuario.id,
        )
        return _redirect_ok(f"{URL_CLIENTES}/{empresa_id}", mensagem)

    except ValueError as erro:
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", str(erro))
    except Exception:
        logger.error(
            "Falha ao alternar bloqueio | empresa_id=%s | admin_id=%s",
            empresa_id,
            usuario.id if usuario else None,
            exc_info=True,
        )
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", "Erro interno.")


@roteador_admin.post("/clientes/{empresa_id}/trocar-plano")
async def trocar_plano(
    request: Request,
    empresa_id: int,
    csrf_token: str = Form(default=""),
    plano: str = Form(...),
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    if not _validar_csrf(request, csrf_token):
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", "Requisição inválida.")

    plano_normalizado = _normalizar_plano(plano)

    try:
        alterar_plano(banco, empresa_id, plano_normalizado)

        logger.info(
            "Plano alterado | empresa_id=%s | plano=%s | admin_id=%s",
            empresa_id,
            plano_normalizado,
            usuario.id,
        )
        return _redirect_ok(
            f"{URL_CLIENTES}/{empresa_id}",
            f"Plano atualizado para {plano_normalizado}.",
        )

    except ValueError as erro:
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", str(erro))
    except Exception:
        logger.error(
            "Falha ao trocar plano | empresa_id=%s | admin_id=%s",
            empresa_id,
            usuario.id if usuario else None,
            exc_info=True,
        )
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", "Erro interno.")


@roteador_admin.post("/clientes/{empresa_id}/resetar-senha/{usuario_id}")
async def resetar_senha(
    request: Request,
    empresa_id: int,
    usuario_id: int,
    csrf_token: str = Form(default=""),
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    if not _validar_csrf(request, csrf_token):
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", "Requisição inválida.")

    try:
        nova_senha = resetar_senha_usuario_empresa(banco, empresa_id, usuario_id)

        logger.info(
            "Senha redefinida | usuario_id=%s | empresa_id=%s | admin_id=%s",
            usuario_id,
            empresa_id,
            usuario.id,
        )
        _flash_senha_temporaria(
            request,
            referencia=f"usuário #{usuario_id}",
            senha=nova_senha,
        )
        return _redirect_ok(
            f"{URL_CLIENTES}/{empresa_id}",
            "Senha do usuário redefinida com sucesso.",
        )

    except ValueError as erro:
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", str(erro))
    except Exception:
        logger.error(
            "Falha ao resetar senha | usuario_id=%s | admin_id=%s",
            usuario_id,
            usuario.id if usuario else None,
            exc_info=True,
        )
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", "Erro interno.")


@roteador_admin.post("/clientes/{empresa_id}/adicionar-inspetor")
async def novo_inspetor(
    request: Request,
    empresa_id: int,
    csrf_token: str = Form(default=""),
    nome: str = Form(...),
    email: str = Form(...),
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    if not _validar_csrf(request, csrf_token):
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", "Requisição inválida.")

    nome = _normalizar_texto(nome, max_len=150)
    email_normalizado = _normalizar_email(email)

    if not nome or not email_normalizado:
        return _redirect_err(
            f"{URL_CLIENTES}/{empresa_id}",
            "Preencha nome e e-mail do inspetor.",
        )

    try:
        senha_inicial = adicionar_inspetor(banco, empresa_id, nome, email_normalizado)

        logger.info(
            "Inspetor adicionado | empresa_id=%s | email=%s | admin_id=%s",
            empresa_id,
            email_normalizado,
            usuario.id,
        )
        _flash_senha_temporaria(
            request,
            referencia=f"{nome} ({email_normalizado})",
            senha=senha_inicial,
        )
        return _redirect_ok(
            f"{URL_CLIENTES}/{empresa_id}",
            f"Inspetor {nome} adicionado com sucesso.",
        )

    except ValueError as erro:
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", str(erro))
    except Exception:
        logger.error(
            "Falha ao adicionar inspetor | empresa_id=%s | admin_id=%s",
            empresa_id,
            usuario.id if usuario else None,
            exc_info=True,
        )
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", "Erro interno.")


@roteador_admin.post("/clientes/{empresa_id}/usuarios/{usuario_id}/atualizar-crea")
async def atualizar_crea_usuario_operacional(
    request: Request,
    empresa_id: int,
    usuario_id: int,
    csrf_token: str = Form(default=""),
    crea: str = Form(default=""),
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    if not _validar_csrf(request, csrf_token):
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", "Requisição inválida.")

    crea_limpo = _normalizar_texto(crea, max_len=40)

    try:
        usuario_atualizado = atualizar_crea_revisor(
            banco,
            empresa_id=empresa_id,
            usuario_id=usuario_id,
            crea=crea_limpo,
        )
        mensagem = (
            f"CREA atualizado para {usuario_atualizado.nome_completo}."
            if usuario_atualizado.crea
            else f"CREA removido de {usuario_atualizado.nome_completo}."
        )
        return _redirect_ok(f"{URL_CLIENTES}/{empresa_id}", mensagem)

    except ValueError as erro:
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", str(erro))
    except Exception:
        logger.error(
            "Falha ao atualizar CREA | empresa_id=%s | usuario_id=%s | admin_id=%s",
            empresa_id,
            usuario_id,
            usuario.id if usuario else None,
            exc_info=True,
        )
        return _redirect_err(f"{URL_CLIENTES}/{empresa_id}", "Erro interno.")
