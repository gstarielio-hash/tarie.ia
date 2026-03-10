"""Rotas de autenticação e páginas do portal inspetor."""

from __future__ import annotations

from fastapi.responses import HTMLResponse
from fastapi.routing import APIRouter

from app.domains.chat.routes import (
    logout_inspetor,
    pagina_inicial,
    pagina_planos,
    processar_login_app,
    processar_troca_senha_app,
    tela_login_app,
    tela_troca_senha_app,
)

roteador_auth = APIRouter()

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

