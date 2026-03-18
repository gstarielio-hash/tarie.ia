"""Rotas de autenticação e páginas do portal inspetor."""

from __future__ import annotations

import re
import secrets
from pathlib import Path
from typing import Literal, Optional
import uuid

from fastapi import Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.routing import APIRouter
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.settings import env_str
from app.domains.chat.auth_helpers import (
    CHAVE_TROCA_SENHA_LEMBRAR,
    NIVEIS_PERMITIDOS_APP,
    _iniciar_fluxo_troca_senha,
    _limpar_fluxo_troca_senha,
    _render_troca_senha,
    _usuario_pendente_troca_senha,
    _validar_nova_senha,
    redirecionar_por_nivel,
    usuario_nome,
)
from app.domains.chat.app_context import (
    PADRAO_SUPORTE_WHATSAPP,
    _settings,
    configuracoes,
    logger,
    templates,
)
from app.domains.chat.laudo_state_helpers import (
    laudo_possui_historico_visivel,
    serializar_card_laudo,
)
from app.domains.chat.limits_helpers import contar_laudos_mes, obter_limite_empresa
from app.domains.chat.template_helpers import montar_limites_para_template
from app.domains.chat.session_helpers import (
    CHAVE_CSRF_INSPETOR,
    contexto_base,
    exigir_csrf,
    estado_relatorio_sanitizado,
    validar_csrf,
)
from app.domains.chat.normalization import normalizar_email
from app.shared.database import (
    Laudo,
    NivelAcesso,
    PlanoEmpresa,
    PreferenciaMobileUsuario,
    Usuario,
    obter_banco,
)
from app.shared.security import (
    PORTAL_INSPETOR,
    criar_hash_senha,
    criar_sessao,
    definir_sessao_portal,
    encerrar_sessao,
    limpar_sessao_portal,
    obter_dados_sessao_portal,
    obter_token_autenticacao_request,
    obter_usuario_html,
    token_esta_ativo,
    exigir_inspetor,
    usuario_tem_bloqueio_ativo,
    verificar_senha,
)

roteador_auth = APIRouter()

PASTA_FOTOS_PERFIL = Path(env_str("PASTA_UPLOADS_PERFIS", "static/uploads/perfis")).expanduser()
MIME_FOTO_PERMITIDOS = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
}
MAX_FOTO_PERFIL_BYTES = 4 * 1024 * 1024


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


SONS_NOTIFICACAO_PERMITIDOS = {"Ping", "Sino curto", "Silencioso"}
RETENCAO_DADOS_PERMITIDA = {"30 dias", "90 dias", "1 ano", "Até excluir"}
MODELOS_IA_PERMITIDOS = {"rápido", "equilibrado", "avançado"}
CONFIGURACOES_CRITICAS_MOBILE_PADRAO: dict[str, dict[str, object]] = {
    "notificacoes": {
        "notifica_respostas": True,
        "notifica_push": True,
        "som_notificacao": "Ping",
        "vibracao_ativa": True,
        "emails_ativos": False,
    },
    "privacidade": {
        "mostrar_conteudo_notificacao": False,
        "ocultar_conteudo_bloqueado": True,
        "mostrar_somente_nova_mensagem": True,
        "salvar_historico_conversas": True,
        "compartilhar_melhoria_ia": False,
        "retencao_dados": "90 dias",
    },
    "permissoes": {
        "microfone_permitido": True,
        "camera_permitida": True,
        "arquivos_permitidos": True,
        "notificacoes_permitidas": True,
        "biometria_permitida": True,
    },
    "experiencia_ia": {
        "modelo_ia": "equilibrado",
    },
}


def _normalizar_telefone(telefone: str) -> str:
    valor = str(telefone or "").strip()
    if not valor:
        return ""
    valor = re.sub(r"[^0-9()+\-\s]", "", valor)
    return valor[:30]


def _email_valido_basico(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email))


def _registro(valor: object) -> dict[str, object]:
    if isinstance(valor, dict):
        return valor
    return {}


def _normalizar_bool(valor: object, padrao: bool) -> bool:
    return valor if isinstance(valor, bool) else padrao


def _normalizar_texto_opcao(valor: object, opcoes: set[str], padrao: str) -> str:
    texto = str(valor or "").strip()
    if texto in opcoes:
        return texto
    return padrao


def _normalizar_configuracoes_criticas_mobile(payload: object) -> dict[str, dict[str, object]]:
    base = _registro(payload)
    notificacoes_raw = _registro(base.get("notificacoes"))
    privacidade_raw = _registro(base.get("privacidade"))
    permissoes_raw = _registro(base.get("permissoes"))
    experiencia_ia_raw = _registro(base.get("experiencia_ia"))

    notificacoes = {
        "notifica_respostas": _normalizar_bool(
            notificacoes_raw.get("notifica_respostas"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["notificacoes"]["notifica_respostas"]),
        ),
        "notifica_push": _normalizar_bool(
            notificacoes_raw.get("notifica_push"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["notificacoes"]["notifica_push"]),
        ),
        "som_notificacao": _normalizar_texto_opcao(
            notificacoes_raw.get("som_notificacao"),
            SONS_NOTIFICACAO_PERMITIDOS,
            str(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["notificacoes"]["som_notificacao"]),
        ),
        "vibracao_ativa": _normalizar_bool(
            notificacoes_raw.get("vibracao_ativa"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["notificacoes"]["vibracao_ativa"]),
        ),
        "emails_ativos": _normalizar_bool(
            notificacoes_raw.get("emails_ativos"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["notificacoes"]["emails_ativos"]),
        ),
    }

    privacidade = {
        "mostrar_conteudo_notificacao": _normalizar_bool(
            privacidade_raw.get("mostrar_conteudo_notificacao"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["mostrar_conteudo_notificacao"]),
        ),
        "ocultar_conteudo_bloqueado": _normalizar_bool(
            privacidade_raw.get("ocultar_conteudo_bloqueado"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["ocultar_conteudo_bloqueado"]),
        ),
        "mostrar_somente_nova_mensagem": _normalizar_bool(
            privacidade_raw.get("mostrar_somente_nova_mensagem"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["mostrar_somente_nova_mensagem"]),
        ),
        "salvar_historico_conversas": _normalizar_bool(
            privacidade_raw.get("salvar_historico_conversas"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["salvar_historico_conversas"]),
        ),
        "compartilhar_melhoria_ia": _normalizar_bool(
            privacidade_raw.get("compartilhar_melhoria_ia"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["compartilhar_melhoria_ia"]),
        ),
        "retencao_dados": _normalizar_texto_opcao(
            privacidade_raw.get("retencao_dados"),
            RETENCAO_DADOS_PERMITIDA,
            str(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["privacidade"]["retencao_dados"]),
        ),
    }

    permissoes = {
        "microfone_permitido": _normalizar_bool(
            permissoes_raw.get("microfone_permitido"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["permissoes"]["microfone_permitido"]),
        ),
        "camera_permitida": _normalizar_bool(
            permissoes_raw.get("camera_permitida"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["permissoes"]["camera_permitida"]),
        ),
        "arquivos_permitidos": _normalizar_bool(
            permissoes_raw.get("arquivos_permitidos"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["permissoes"]["arquivos_permitidos"]),
        ),
        "notificacoes_permitidas": _normalizar_bool(
            permissoes_raw.get("notificacoes_permitidas"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["permissoes"]["notificacoes_permitidas"]),
        ),
        "biometria_permitida": _normalizar_bool(
            permissoes_raw.get("biometria_permitida"),
            bool(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["permissoes"]["biometria_permitida"]),
        ),
    }

    experiencia_ia = {
        "modelo_ia": _normalizar_texto_opcao(
            experiencia_ia_raw.get("modelo_ia"),
            MODELOS_IA_PERMITIDOS,
            str(CONFIGURACOES_CRITICAS_MOBILE_PADRAO["experiencia_ia"]["modelo_ia"]),
        ),
    }

    return {
        "notificacoes": notificacoes,
        "privacidade": privacidade,
        "permissoes": permissoes,
        "experiencia_ia": experiencia_ia,
    }


def _serializar_preferencias_mobile_usuario(preferencia: PreferenciaMobileUsuario | None) -> dict[str, dict[str, object]]:
    if not preferencia:
        return _normalizar_configuracoes_criticas_mobile(CONFIGURACOES_CRITICAS_MOBILE_PADRAO)
    return _normalizar_configuracoes_criticas_mobile(
        {
            "notificacoes": preferencia.notificacoes_json,
            "privacidade": preferencia.privacidade_json,
            "permissoes": preferencia.permissoes_json,
            "experiencia_ia": preferencia.experiencia_ia_json,
        }
    )


def _serializar_perfil_usuario(usuario: Usuario) -> dict[str, str]:
    return {
        "nome_completo": str(usuario.nome_completo or "").strip(),
        "email": str(usuario.email or "").strip(),
        "telefone": str(getattr(usuario, "telefone", "") or "").strip(),
        "foto_perfil_url": str(getattr(usuario, "foto_perfil_url", "") or "").strip(),
        "empresa_nome": str(getattr(getattr(usuario, "empresa", None), "nome_fantasia", "") or "Sua empresa").strip(),
    }


def _serializar_usuario_mobile(usuario: Usuario) -> dict[str, object]:
    perfil = _serializar_perfil_usuario(usuario)
    return {
        "id": int(usuario.id),
        "nome_completo": perfil["nome_completo"],
        "email": perfil["email"],
        "telefone": perfil["telefone"],
        "foto_perfil_url": perfil["foto_perfil_url"],
        "empresa_nome": perfil["empresa_nome"],
        "empresa_id": int(usuario.empresa_id or 0),
        "nivel_acesso": int(usuario.nivel_acesso),
    }


def _caminho_foto_perfil_local(url_foto: str | None) -> Path | None:
    valor = str(url_foto or "").strip()
    if not valor.startswith("/static/uploads/perfis/"):
        return None

    base = PASTA_FOTOS_PERFIL.resolve()
    caminho = Path(valor.lstrip("/")).resolve()
    if base == caminho or base in caminho.parents:
        return caminho
    return None


def _remover_foto_perfil_antiga(url_foto: str | None) -> None:
    caminho = _caminho_foto_perfil_local(url_foto)
    if not caminho:
        return
    try:
        if caminho.exists() and caminho.is_file():
            caminho.unlink()
    except Exception:
        logger.warning("Falha ao remover foto de perfil antiga.", exc_info=True)


def _atualizar_nome_sessao_inspetor(request: Request, usuario: Usuario) -> None:
    dados_sessao = obter_dados_sessao_portal(request.session, portal=PORTAL_INSPETOR)
    token = dados_sessao.get("token")
    if not token:
        return

    definir_sessao_portal(
        request.session,
        portal=PORTAL_INSPETOR,
        token=token,
        usuario_id=usuario.id,
        empresa_id=usuario.empresa_id,
        nivel_acesso=usuario.nivel_acesso,
        nome=usuario_nome(usuario),
    )


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
    return _render_troca_senha(request, templates=templates)


async def processar_troca_senha_app(
    request: Request,
    senha_atual: str = Form(default=""),
    nova_senha: str = Form(default=""),
    confirmar_senha: str = Form(default=""),
    csrf_token: str = Form(default=""),
    banco: Session = Depends(obter_banco),
):
    if not validar_csrf(request, csrf_token):
        return _render_troca_senha(request, templates=templates, erro="Requisição inválida.", status_code=400)

    usuario = _usuario_pendente_troca_senha(request, banco)
    if not usuario:
        return RedirectResponse(url="/app/login", status_code=303)

    erro_validacao = _validar_nova_senha(senha_atual, nova_senha, confirmar_senha)
    if erro_validacao:
        return _render_troca_senha(request, templates=templates, erro=erro_validacao, status_code=400)

    if not verificar_senha(senha_atual, usuario.senha_hash):
        return _render_troca_senha(request, templates=templates, erro="Senha temporária inválida.", status_code=401)

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


async def api_login_mobile_inspetor(
    request: Request,
    payload: DadosLoginMobileInspetor,
    banco: Session = Depends(obter_banco),
):
    email_normalizado = normalizar_email(payload.email)
    senha = str(payload.senha or "")

    if not email_normalizado or not senha:
        raise HTTPException(status_code=400, detail="Preencha e-mail e senha.")

    usuario = banco.scalar(select(Usuario).where(Usuario.email == email_normalizado))
    if not usuario or not verificar_senha(senha, usuario.senha_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas.")

    if int(usuario.nivel_acesso) not in NIVEIS_PERMITIDOS_APP:
        raise HTTPException(status_code=403, detail="Acesso permitido apenas para Inspetores.")

    if usuario.senha_temporaria_ativa:
        raise HTTPException(
            status_code=409,
            detail="Finalize a troca obrigatória de senha no portal web antes do primeiro login mobile.",
        )

    if usuario_tem_bloqueio_ativo(usuario):
        raise HTTPException(status_code=403, detail="Usuário bloqueado no momento.")

    token = criar_sessao(
        usuario.id,
        lembrar=bool(payload.lembrar),
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", ""),
    )

    if hasattr(usuario, "registrar_login_sucesso"):
        usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
    banco.commit()
    banco.refresh(usuario)

    return JSONResponse(
        {
            "ok": True,
            "auth_mode": "bearer",
            "access_token": token,
            "token_type": "bearer",
            "usuario": _serializar_usuario_mobile(usuario),
        }
    )


async def api_bootstrap_mobile_inspetor(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
):
    return JSONResponse(
        {
            "ok": True,
            "app": {
                "nome": "Tariel Inspetor",
                "portal": "inspetor",
                "api_base_url": str(request.base_url).rstrip("/"),
                "suporte_whatsapp": PADRAO_SUPORTE_WHATSAPP,
            },
            "usuario": _serializar_usuario_mobile(usuario),
        }
    )


async def api_listar_laudos_mobile_inspetor(
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    laudos = list(
        banco.scalars(
            select(Laudo)
            .where(
                Laudo.empresa_id == usuario.empresa_id,
                Laudo.usuario_id == usuario.id,
            )
            .order_by(func.coalesce(Laudo.atualizado_em, Laudo.criado_em).desc(), Laudo.id.desc())
            .limit(30)
        ).all()
    )

    itens = [serializar_card_laudo(banco, laudo) for laudo in laudos if laudo_possui_historico_visivel(banco, laudo) or laudo.status_revisao != "rascunho"]

    return JSONResponse(
        {
            "ok": True,
            "itens": itens,
        }
    )


async def api_logout_mobile_inspetor(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
):
    token = obter_token_autenticacao_request(request)
    if token:
        encerrar_sessao(token)

    return JSONResponse(
        {
            "ok": True,
            "usuario_id": int(usuario.id),
        }
    )


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
    laudos_consulta = (
        banco.query(Laudo)
        .filter(
            Laudo.empresa_id == usuario.empresa_id,
            Laudo.usuario_id == usuario.id,
        )
        .order_by(
            Laudo.pinado.desc(),
            Laudo.criado_em.desc(),
        )
        .limit(40)
        .all()
    )
    laudos_recentes: list[Laudo] = []
    for laudo in laudos_consulta:
        if not laudo_possui_historico_visivel(banco, laudo):
            continue
        resumo_card = serializar_card_laudo(banco, laudo)
        setattr(laudo, "card_status", resumo_card["status_card"])
        setattr(laudo, "card_status_label", resumo_card["status_card_label"])
        laudos_recentes.append(laudo)
        if len(laudos_recentes) >= 20:
            break

    limite = obter_limite_empresa(usuario, banco)
    laudos_mes_usados = contar_laudos_mes(banco, usuario.empresa_id)

    telefone_suporte = (getattr(configuracoes, "SUPORTE_WHATSAPP", "") if configuracoes else "") or PADRAO_SUPORTE_WHATSAPP

    ambiente_atual = (getattr(configuracoes, "AMBIENTE", "") if configuracoes else "") or _settings.ambiente

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


async def api_obter_perfil_usuario(
    usuario: Usuario = Depends(exigir_inspetor),
):
    return JSONResponse(
        {
            "ok": True,
            "perfil": _serializar_perfil_usuario(usuario),
        }
    )


async def api_atualizar_perfil_usuario(
    request: Request,
    dados: DadosAtualizarPerfilUsuario,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)

    _atualizar_perfil_usuario_em_banco(usuario=usuario, banco=banco, dados=dados)
    _atualizar_nome_sessao_inspetor(request, usuario)

    return JSONResponse(
        {
            "ok": True,
            "perfil": _serializar_perfil_usuario(usuario),
        }
    )


def _atualizar_perfil_usuario_em_banco(
    *,
    usuario: Usuario,
    banco: Session,
    dados: DadosAtualizarPerfilUsuario,
) -> None:
    nome = str(dados.nome_completo or "").strip()
    email = normalizar_email(str(dados.email or ""))
    telefone = _normalizar_telefone(str(dados.telefone or ""))

    if len(nome) < 3:
        raise HTTPException(status_code=400, detail="Informe um nome com pelo menos 3 caracteres.")

    if not email or not _email_valido_basico(email):
        raise HTTPException(status_code=400, detail="Informe um e-mail válido.")

    usuario_conflito = banco.scalar(
        select(Usuario).where(
            Usuario.email == email,
            Usuario.id != usuario.id,
        )
    )
    if usuario_conflito:
        raise HTTPException(status_code=409, detail="Este e-mail já está em uso por outro usuário.")

    usuario.nome_completo = nome[:150]
    usuario.email = email[:254]
    usuario.telefone = telefone or None

    banco.commit()
    banco.refresh(usuario)


async def _atualizar_foto_perfil_usuario_em_banco(
    *,
    usuario: Usuario,
    banco: Session,
    foto: UploadFile,
) -> None:
    mime = str(foto.content_type or "").strip().lower()
    if mime not in MIME_FOTO_PERMITIDOS:
        raise HTTPException(status_code=415, detail="Formato inválido. Use PNG, JPG ou WebP.")

    conteudo = await foto.read()
    if not conteudo:
        raise HTTPException(status_code=400, detail="Arquivo de foto vazio.")
    if len(conteudo) > MAX_FOTO_PERFIL_BYTES:
        raise HTTPException(status_code=413, detail="A foto deve ter no máximo 4MB.")

    extensao_por_mime = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }
    extensao = extensao_por_mime.get(mime, ".jpg")

    pasta_empresa = PASTA_FOTOS_PERFIL / str(usuario.empresa_id)
    pasta_empresa.mkdir(parents=True, exist_ok=True)

    nome_arquivo = f"user_{usuario.id}_{uuid.uuid4().hex[:16]}{extensao}"
    caminho_destino = pasta_empresa / nome_arquivo
    caminho_destino.write_bytes(conteudo)

    _remover_foto_perfil_antiga(getattr(usuario, "foto_perfil_url", None))
    usuario.foto_perfil_url = f"/static/uploads/perfis/{usuario.empresa_id}/{nome_arquivo}"
    banco.commit()
    banco.refresh(usuario)


async def api_atualizar_perfil_mobile_inspetor(
    dados: DadosAtualizarPerfilUsuario,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _atualizar_perfil_usuario_em_banco(usuario=usuario, banco=banco, dados=dados)

    return JSONResponse(
        {
            "ok": True,
            "usuario": _serializar_usuario_mobile(usuario),
        }
    )


async def api_alterar_senha_mobile_inspetor(
    dados: DadosAtualizarSenhaMobileInspetor,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    erro_validacao = _validar_nova_senha(
        dados.senha_atual,
        dados.nova_senha,
        dados.confirmar_senha,
    )
    if erro_validacao:
        if "temporária" in erro_validacao:
            erro_validacao = "A nova senha deve ser diferente da senha atual."
        raise HTTPException(status_code=400, detail=erro_validacao)

    if not verificar_senha(dados.senha_atual, usuario.senha_hash):
        raise HTTPException(status_code=401, detail="Senha atual inválida.")

    usuario.senha_hash = criar_hash_senha(dados.nova_senha)
    usuario.senha_temporaria_ativa = False
    banco.commit()

    return JSONResponse(
        {
            "ok": True,
            "message": "Senha atualizada com sucesso.",
        }
    )


async def api_upload_foto_perfil_mobile_usuario(
    foto: UploadFile = File(...),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    await _atualizar_foto_perfil_usuario_em_banco(
        usuario=usuario,
        banco=banco,
        foto=foto,
    )

    return JSONResponse(
        {
            "ok": True,
            "usuario": _serializar_usuario_mobile(usuario),
        }
    )


async def api_relato_suporte_mobile_inspetor(
    payload: DadosRelatoSuporteMobileInspetor,
    usuario: Usuario = Depends(exigir_inspetor),
):
    mensagem = str(payload.mensagem or "").strip()
    if len(mensagem) < 3:
        raise HTTPException(status_code=400, detail="Descreva a mensagem com pelo menos 3 caracteres.")

    email_retorno = normalizar_email(payload.email_retorno)
    if email_retorno and not _email_valido_basico(email_retorno):
        raise HTTPException(status_code=400, detail="Informe um e-mail de retorno válido.")

    protocolo = f"SUP-{uuid.uuid4().hex[:8].upper()}"
    logger.info(
        "Relato suporte mobile | protocolo=%s | tipo=%s | usuario_id=%s | email=%s | titulo=%s | contexto=%s | anexo=%s",
        protocolo,
        payload.tipo,
        usuario.id,
        email_retorno or usuario.email,
        str(payload.titulo or "").strip(),
        str(payload.contexto or "").strip(),
        str(payload.anexo_nome or "").strip(),
    )

    return JSONResponse(
        {
            "ok": True,
            "protocolo": protocolo,
            "status": "Recebido",
        }
    )


async def api_obter_configuracoes_criticas_mobile_inspetor(
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    preferencia = banco.scalar(select(PreferenciaMobileUsuario).where(PreferenciaMobileUsuario.usuario_id == usuario.id))

    return JSONResponse(
        {
            "ok": True,
            "settings": _serializar_preferencias_mobile_usuario(preferencia),
        }
    )


async def api_salvar_configuracoes_criticas_mobile_inspetor(
    payload: DadosConfiguracoesCriticasMobile,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    configuracoes = _normalizar_configuracoes_criticas_mobile(payload.model_dump())
    preferencia = banco.scalar(select(PreferenciaMobileUsuario).where(PreferenciaMobileUsuario.usuario_id == usuario.id))
    if not preferencia:
        preferencia = PreferenciaMobileUsuario(usuario_id=usuario.id)
        banco.add(preferencia)

    preferencia.notificacoes_json = configuracoes["notificacoes"]
    preferencia.privacidade_json = configuracoes["privacidade"]
    preferencia.permissoes_json = configuracoes["permissoes"]
    preferencia.experiencia_ia_json = configuracoes["experiencia_ia"]
    banco.commit()
    banco.refresh(preferencia)

    logger.info(
        "Preferencias mobile criticas atualizadas | usuario_id=%s | notificacoes=%s | privacidade=%s | permissoes=%s | experiencia_ia=%s",
        usuario.id,
        preferencia.notificacoes_json,
        preferencia.privacidade_json,
        preferencia.permissoes_json,
        preferencia.experiencia_ia_json,
    )

    return JSONResponse(
        {
            "ok": True,
            "settings": _serializar_preferencias_mobile_usuario(preferencia),
        }
    )


async def api_upload_foto_perfil_usuario(
    request: Request,
    foto: UploadFile = File(...),
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    exigir_csrf(request)
    await _atualizar_foto_perfil_usuario_em_banco(
        usuario=usuario,
        banco=banco,
        foto=foto,
    )

    return JSONResponse(
        {
            "ok": True,
            "foto_perfil_url": usuario.foto_perfil_url,
        }
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
roteador_auth.add_api_route(
    "/api/perfil",
    api_obter_perfil_usuario,
    methods=["GET"],
)
roteador_auth.add_api_route(
    "/api/perfil",
    api_atualizar_perfil_usuario,
    methods=["PUT"],
    responses={
        400: {"description": "Dados de perfil inválidos."},
        409: {"description": "E-mail já está em uso."},
    },
)
roteador_auth.add_api_route(
    "/api/perfil/foto",
    api_upload_foto_perfil_usuario,
    methods=["POST"],
    responses={
        400: {"description": "Arquivo de foto inválido ou vazio."},
        413: {"description": "Arquivo excede o limite permitido."},
        415: {"description": "Formato de imagem não suportado."},
    },
)
roteador_auth.add_api_route(
    "/api/mobile/auth/login",
    api_login_mobile_inspetor,
    methods=["POST"],
)
roteador_auth.add_api_route(
    "/api/mobile/bootstrap",
    api_bootstrap_mobile_inspetor,
    methods=["GET"],
)
roteador_auth.add_api_route(
    "/api/mobile/laudos",
    api_listar_laudos_mobile_inspetor,
    methods=["GET"],
)
roteador_auth.add_api_route(
    "/api/mobile/account/profile",
    api_atualizar_perfil_mobile_inspetor,
    methods=["PUT"],
    responses={
        400: {"description": "Dados de perfil inválidos."},
        409: {"description": "E-mail já está em uso."},
    },
)
roteador_auth.add_api_route(
    "/api/mobile/account/password",
    api_alterar_senha_mobile_inspetor,
    methods=["POST"],
    responses={
        400: {"description": "Falha de validação da nova senha."},
        401: {"description": "Senha atual inválida."},
    },
)
roteador_auth.add_api_route(
    "/api/mobile/account/photo",
    api_upload_foto_perfil_mobile_usuario,
    methods=["POST"],
    responses={
        400: {"description": "Arquivo de foto inválido ou vazio."},
        413: {"description": "Arquivo excede o limite permitido."},
        415: {"description": "Formato de imagem não suportado."},
    },
)
roteador_auth.add_api_route(
    "/api/mobile/support/report",
    api_relato_suporte_mobile_inspetor,
    methods=["POST"],
    responses={
        400: {"description": "Relato inválido."},
    },
)
roteador_auth.add_api_route(
    "/api/mobile/account/settings",
    api_obter_configuracoes_criticas_mobile_inspetor,
    methods=["GET"],
)
roteador_auth.add_api_route(
    "/api/mobile/account/settings",
    api_salvar_configuracoes_criticas_mobile_inspetor,
    methods=["PUT"],
    responses={
        400: {"description": "Configurações inválidas."},
    },
)
roteador_auth.add_api_route(
    "/api/mobile/auth/logout",
    api_logout_mobile_inspetor,
    methods=["POST"],
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
    "api_login_mobile_inspetor",
    "api_bootstrap_mobile_inspetor",
    "api_listar_laudos_mobile_inspetor",
    "api_logout_mobile_inspetor",
    "api_atualizar_perfil_mobile_inspetor",
    "api_alterar_senha_mobile_inspetor",
    "api_upload_foto_perfil_mobile_usuario",
    "api_relato_suporte_mobile_inspetor",
    "api_obter_configuracoes_criticas_mobile_inspetor",
    "api_salvar_configuracoes_criticas_mobile_inspetor",
    "api_obter_perfil_usuario",
    "api_atualizar_perfil_usuario",
    "api_upload_foto_perfil_usuario",
]
