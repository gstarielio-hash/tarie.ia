"""Sub-roteador de onboarding e gestao SaaS do portal admin."""

from __future__ import annotations

import logging
import sys
from typing import Any, Callable, Optional, TypeVar

from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.domains.admin.portal_support import (
    URL_CLIENTES,
    URL_NOVO_CLIENTE,
    URL_PAINEL,
    _flash_senha_temporaria,
    _normalizar_email,
    _normalizar_plano,
    _normalizar_texto,
    _redirect_err,
    _redirect_login,
    _redirect_ok,
    _render_template,
    _validar_csrf,
    _verificar_acesso_admin,
)
from app.domains.admin.services import (
    adicionar_inspetor,
    alternar_bloqueio,
    alterar_plano,
    atualizar_crea_revisor,
    buscar_detalhe_cliente,
    buscar_todos_clientes,
    registrar_novo_cliente,
    resetar_senha_inspetor,
    resetar_senha_usuario_empresa,
)
from app.shared.database import Usuario, obter_banco
from app.shared.security import obter_usuario_html

logger = logging.getLogger("tariel.admin")

roteador_admin_clientes = APIRouter()
_T = TypeVar("_T")


def _resolver_compat_admin(nome: str, fallback):
    modulo_rotas = sys.modules.get("app.domains.admin.routes")
    if modulo_rotas is None:
        return fallback
    candidato = getattr(modulo_rotas, nome, fallback)
    return candidato if callable(candidato) else fallback


def _resetar_senha_usuario_empresa_compat(banco: Session, *, empresa_id: int, usuario_id: int) -> str:
    modulo_rotas = sys.modules.get("app.domains.admin.routes")
    if modulo_rotas is not None:
        candidato_novo = getattr(modulo_rotas, "resetar_senha_usuario_empresa", None)
        if callable(candidato_novo):
            return str(candidato_novo(banco, empresa_id, usuario_id))

        candidato_legado = getattr(modulo_rotas, "resetar_senha_inspetor", None)
        if callable(candidato_legado) and candidato_legado is not resetar_senha_inspetor:
            return str(candidato_legado(banco, usuario_id))

    return str(resetar_senha_usuario_empresa(banco, empresa_id, usuario_id))


def _contexto_log_admin(**contexto: Any) -> dict[str, Any]:
    return {chave: valor for chave, valor in contexto.items() if valor is not None}


def _executar_leitura_admin(
    *,
    fallback: _T,
    mensagem_log: str,
    operacao: Callable[[], _T],
    **contexto: Any,
) -> _T:
    try:
        return operacao()
    except Exception:
        logger.exception(mensagem_log, extra=_contexto_log_admin(**contexto))
        return fallback


def _executar_acao_admin_redirect(
    *,
    url_erro: str,
    mensagem_log: str,
    operacao: Callable[[], RedirectResponse],
    mensagem_erro_usuario: str = "Erro interno. Tente novamente.",
    **contexto: Any,
) -> RedirectResponse:
    try:
        return operacao()
    except ValueError as erro:
        return _redirect_err(url_erro, str(erro))
    except Exception:
        logger.exception(mensagem_log, extra=_contexto_log_admin(**contexto))
        return _redirect_err(url_erro, mensagem_erro_usuario)


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

    def _operacao() -> RedirectResponse:
        registrar_cliente = _resolver_compat_admin("registrar_novo_cliente", registrar_novo_cliente)
        resultado = registrar_cliente(
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
        aviso_boas_vindas: str | None = None
        if isinstance(resultado, tuple) and len(resultado) == 3:
            empresa, senha_inicial, aviso_boas_vindas = resultado
        else:
            empresa, senha_inicial = resultado
            aviso_boas_vindas = None

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
        mensagem_sucesso = f"Cliente {empresa.nome_fantasia} cadastrado com sucesso."
        if aviso_boas_vindas:
            mensagem_sucesso = f"{mensagem_sucesso} {aviso_boas_vindas}"
        return _redirect_ok(
            destino,
            mensagem_sucesso,
        )

    return _executar_acao_admin_redirect(
        url_erro=url_erro,
        mensagem_log="Falha inesperada ao cadastrar cliente",
        operacao=_operacao,
        admin_id=usuario_admin.id,
        email=email,
    )


@roteador_admin_clientes.get("/novo-cliente", response_class=HTMLResponse)
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


@roteador_admin_clientes.post("/novo-cliente")
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


@roteador_admin_clientes.post("/cadastrar-empresa")
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


@roteador_admin_clientes.get("/clientes", response_class=HTMLResponse)
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

    clientes: list[Any] = _executar_leitura_admin(
        fallback=[],
        mensagem_log="Falha ao buscar lista de clientes",
        admin_id=usuario.id if usuario else None,
        operacao=lambda: buscar_todos_clientes(
            banco,
            filtro_nome=nome,
            filtro_plano=plano,
        ),
    )

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


@roteador_admin_clientes.get("/clientes/{empresa_id}", response_class=HTMLResponse)
async def detalhe_cliente(
    request: Request,
    empresa_id: int,
    banco: Session = Depends(obter_banco),
    usuario: Optional[Usuario] = Depends(obter_usuario_html),
):
    if not _verificar_acesso_admin(usuario):
        return _redirect_login()

    dados = _executar_leitura_admin(
        fallback=None,
        mensagem_log="Falha ao buscar detalhe do cliente",
        empresa_id=empresa_id,
        admin_id=usuario.id if usuario else None,
        operacao=lambda: buscar_detalhe_cliente(banco, empresa_id),
    )

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


@roteador_admin_clientes.post("/clientes/{empresa_id}/bloquear")
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

    def _operacao() -> RedirectResponse:
        bloqueado = alternar_bloqueio(banco, empresa_id)
        mensagem = "Acesso bloqueado com sucesso." if bloqueado else "Acesso restaurado com sucesso."

        logger.info(
            "Bloqueio de empresa alterado | empresa_id=%s | bloqueado=%s | admin_id=%s",
            empresa_id,
            bloqueado,
            usuario.id,
        )
        return _redirect_ok(f"{URL_CLIENTES}/{empresa_id}", mensagem)

    return _executar_acao_admin_redirect(
        url_erro=f"{URL_CLIENTES}/{empresa_id}",
        mensagem_log="Falha ao alternar bloqueio",
        operacao=_operacao,
        empresa_id=empresa_id,
        admin_id=usuario.id if usuario else None,
    )


@roteador_admin_clientes.post("/clientes/{empresa_id}/trocar-plano")
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

    def _operacao() -> RedirectResponse:
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

    return _executar_acao_admin_redirect(
        url_erro=f"{URL_CLIENTES}/{empresa_id}",
        mensagem_log="Falha ao trocar plano",
        operacao=_operacao,
        empresa_id=empresa_id,
        plano=plano_normalizado,
        admin_id=usuario.id if usuario else None,
    )


@roteador_admin_clientes.post("/clientes/{empresa_id}/resetar-senha/{usuario_id}")
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

    def _operacao() -> RedirectResponse:
        nova_senha = _resetar_senha_usuario_empresa_compat(
            banco,
            empresa_id=empresa_id,
            usuario_id=usuario_id,
        )

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

    return _executar_acao_admin_redirect(
        url_erro=f"{URL_CLIENTES}/{empresa_id}",
        mensagem_log="Falha ao resetar senha",
        operacao=_operacao,
        usuario_id=usuario_id,
        empresa_id=empresa_id,
        admin_id=usuario.id if usuario else None,
    )


@roteador_admin_clientes.post("/clientes/{empresa_id}/adicionar-inspetor")
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

    def _operacao() -> RedirectResponse:
        adicionar_inspetor_service = _resolver_compat_admin("adicionar_inspetor", adicionar_inspetor)
        senha_inicial = adicionar_inspetor_service(banco, empresa_id, nome, email_normalizado)

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

    return _executar_acao_admin_redirect(
        url_erro=f"{URL_CLIENTES}/{empresa_id}",
        mensagem_log="Falha ao adicionar inspetor",
        operacao=_operacao,
        empresa_id=empresa_id,
        email=email_normalizado,
        admin_id=usuario.id if usuario else None,
    )


@roteador_admin_clientes.post("/clientes/{empresa_id}/usuarios/{usuario_id}/atualizar-crea")
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

    def _operacao() -> RedirectResponse:
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

    return _executar_acao_admin_redirect(
        url_erro=f"{URL_CLIENTES}/{empresa_id}",
        mensagem_log="Falha ao atualizar CREA",
        operacao=_operacao,
        empresa_id=empresa_id,
        usuario_id=usuario_id,
        admin_id=usuario.id if usuario else None,
    )
