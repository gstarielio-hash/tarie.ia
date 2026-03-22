"""Fachada compatível das rotas de autenticação do inspetor."""

from __future__ import annotations

from fastapi.routing import APIRouter

from app.domains.chat.auth_contracts import (
    DadosAtualizarPerfilUsuario,
    DadosAtualizarSenhaMobileInspetor,
    DadosConfiguracoesCriticasMobile,
    DadosExperienciaIaCriticasMobile,
    DadosLoginMobileInspetor,
    DadosNotificacoesCriticasMobile,
    DadosPermissoesCriticasMobile,
    DadosPrivacidadeCriticasMobile,
    DadosRelatoSuporteMobileInspetor,
)
from app.domains.chat.auth_mobile_routes import (
    api_alterar_senha_mobile_inspetor,
    api_atualizar_perfil_mobile_inspetor,
    api_bootstrap_mobile_inspetor,
    api_listar_laudos_mobile_inspetor,
    api_login_mobile_inspetor,
    api_logout_mobile_inspetor,
    api_obter_configuracoes_criticas_mobile_inspetor,
    api_relato_suporte_mobile_inspetor,
    api_salvar_configuracoes_criticas_mobile_inspetor,
    api_upload_foto_perfil_mobile_usuario,
    roteador_auth_mobile,
)
from app.domains.chat.auth_portal_routes import (
    api_atualizar_perfil_usuario,
    api_obter_perfil_usuario,
    api_upload_foto_perfil_usuario,
    logout_inspetor,
    pagina_inicial,
    pagina_planos,
    processar_login_app,
    processar_troca_senha_app,
    roteador_auth_portal,
    tela_login_app,
    tela_troca_senha_app,
)

roteador_auth = APIRouter()
roteador_auth.include_router(roteador_auth_portal)
roteador_auth.include_router(roteador_auth_mobile)

__all__ = [
    "DadosAtualizarPerfilUsuario",
    "DadosAtualizarSenhaMobileInspetor",
    "DadosConfiguracoesCriticasMobile",
    "DadosExperienciaIaCriticasMobile",
    "DadosLoginMobileInspetor",
    "DadosNotificacoesCriticasMobile",
    "DadosPermissoesCriticasMobile",
    "DadosPrivacidadeCriticasMobile",
    "DadosRelatoSuporteMobileInspetor",
    "api_alterar_senha_mobile_inspetor",
    "api_atualizar_perfil_mobile_inspetor",
    "api_atualizar_perfil_usuario",
    "api_bootstrap_mobile_inspetor",
    "api_listar_laudos_mobile_inspetor",
    "api_login_mobile_inspetor",
    "api_logout_mobile_inspetor",
    "api_obter_configuracoes_criticas_mobile_inspetor",
    "api_obter_perfil_usuario",
    "api_relato_suporte_mobile_inspetor",
    "api_salvar_configuracoes_criticas_mobile_inspetor",
    "api_upload_foto_perfil_mobile_usuario",
    "api_upload_foto_perfil_usuario",
    "logout_inspetor",
    "pagina_inicial",
    "pagina_planos",
    "processar_login_app",
    "processar_troca_senha_app",
    "roteador_auth",
    "tela_login_app",
    "tela_troca_senha_app",
]
