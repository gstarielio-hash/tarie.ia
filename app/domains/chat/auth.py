"""Façade de rotas de autenticação do domínio chat/inspetor.

Neste estágio, os handlers continuam implementados em `routes.py`.
Este módulo organiza os contratos e prepara a extração completa.
"""

from app.domains.chat.routes import (
    logout_inspetor,
    processar_login_app,
    processar_troca_senha_app,
    tela_login_app,
    tela_troca_senha_app,
)

login_app = processar_login_app

__all__ = [
    "tela_login_app",
    "tela_troca_senha_app",
    "processar_troca_senha_app",
    "processar_login_app",
    "login_app",
    "logout_inspetor",
]
