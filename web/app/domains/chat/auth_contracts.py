"""Contratos HTTP do portal e do app mobile do inspetor."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DadosAtualizarPerfilUsuario(BaseModel):
    nome_completo: str = Field(..., min_length=3, max_length=150)
    email: str = Field(
        ...,
        min_length=3,
        max_length=254,
        pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$",
    )
    telefone: str = Field(default="", max_length=30)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class DadosLoginMobileInspetor(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    senha: str = Field(..., min_length=1, max_length=128)
    lembrar: bool = Field(default=True)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class DadosAtualizarSenhaMobileInspetor(BaseModel):
    senha_atual: str = Field(..., min_length=1, max_length=128)
    nova_senha: str = Field(..., min_length=8, max_length=128)
    confirmar_senha: str = Field(..., min_length=1, max_length=128)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class DadosRelatoSuporteMobileInspetor(BaseModel):
    tipo: Literal["bug", "feedback"] = "feedback"
    titulo: str = Field(default="", max_length=120)
    mensagem: str = Field(..., min_length=3, max_length=4000)
    email_retorno: str = Field(default="", max_length=254)
    contexto: str = Field(default="", max_length=500)
    anexo_nome: str = Field(default="", max_length=180)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class DadosNotificacoesCriticasMobile(BaseModel):
    notifica_respostas: bool = True
    notifica_push: bool = True
    som_notificacao: str = Field(default="Ping", min_length=1, max_length=40)
    vibracao_ativa: bool = True
    emails_ativos: bool = False

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class DadosPrivacidadeCriticasMobile(BaseModel):
    mostrar_conteudo_notificacao: bool = False
    ocultar_conteudo_bloqueado: bool = True
    mostrar_somente_nova_mensagem: bool = True
    salvar_historico_conversas: bool = True
    compartilhar_melhoria_ia: bool = False
    retencao_dados: str = Field(default="90 dias", min_length=1, max_length=40)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class DadosPermissoesCriticasMobile(BaseModel):
    microfone_permitido: bool = True
    camera_permitida: bool = True
    arquivos_permitidos: bool = True
    notificacoes_permitidas: bool = True
    biometria_permitida: bool = True

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class DadosExperienciaIaCriticasMobile(BaseModel):
    modelo_ia: str = Field(default="equilibrado", min_length=1, max_length=40)

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")


class DadosConfiguracoesCriticasMobile(BaseModel):
    notificacoes: DadosNotificacoesCriticasMobile = Field(default_factory=DadosNotificacoesCriticasMobile)
    privacidade: DadosPrivacidadeCriticasMobile = Field(default_factory=DadosPrivacidadeCriticasMobile)
    permissoes: DadosPermissoesCriticasMobile = Field(default_factory=DadosPermissoesCriticasMobile)
    experiencia_ia: DadosExperienciaIaCriticasMobile = Field(default_factory=DadosExperienciaIaCriticasMobile)

    model_config = ConfigDict(extra="ignore")


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
]
