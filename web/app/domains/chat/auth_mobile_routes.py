"""Rotas mobile do inspetor."""

from __future__ import annotations

import uuid

from fastapi import Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from fastapi.routing import APIRouter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domains.chat.auth_contracts import (
    DadosAtualizarPerfilUsuario,
    DadosAtualizarSenhaMobileInspetor,
    DadosConfiguracoesCriticasMobile,
    DadosLoginMobileInspetor,
    DadosRelatoSuporteMobileInspetor,
)
from app.domains.chat.auth_helpers import _validar_nova_senha
from app.domains.chat.auth_mobile_support import (
    atualizar_foto_perfil_usuario_em_banco as _atualizar_foto_perfil_usuario_em_banco,
    atualizar_perfil_usuario_em_banco as _atualizar_perfil_usuario_em_banco,
    email_valido_basico as _email_valido_basico,
    listar_cards_laudos_mobile_inspetor as _listar_cards_laudos_mobile_inspetor,
    obter_preferencia_mobile_usuario as _obter_preferencia_mobile_usuario,
    salvar_configuracoes_criticas_mobile_usuario as _salvar_configuracoes_criticas_mobile_usuario,
    serializar_preferencias_mobile_usuario as _serializar_preferencias_mobile_usuario,
    serializar_usuario_mobile as _serializar_usuario_mobile,
)
from app.domains.chat.app_context import PADRAO_SUPORTE_WHATSAPP, logger
from app.domains.chat.normalization import normalizar_email
from app.shared.database import Usuario, commit_ou_rollback_operacional, obter_banco
from app.shared.security import (
    PORTAL_INSPETOR,
    criar_hash_senha,
    criar_sessao,
    encerrar_sessao,
    obter_token_autenticacao_request,
    exigir_inspetor,
    usuario_tem_bloqueio_ativo,
    usuario_tem_acesso_portal,
    verificar_senha,
    verificar_senha_com_upgrade,
)

roteador_auth_mobile = APIRouter()


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
    senha_valida = False
    hash_atualizado: str | None = None
    if usuario:
        senha_valida, hash_atualizado = verificar_senha_com_upgrade(senha, usuario.senha_hash)
    if not usuario or not senha_valida:
        raise HTTPException(status_code=401, detail="Credenciais inválidas.")

    if not usuario_tem_acesso_portal(usuario, PORTAL_INSPETOR):
        raise HTTPException(status_code=403, detail="Acesso permitido apenas para Inspetores.")

    if usuario.senha_temporaria_ativa:
        raise HTTPException(
            status_code=409,
            detail="Finalize a troca obrigatória de senha no portal web antes do primeiro login mobile.",
        )

    if usuario_tem_bloqueio_ativo(usuario):
        raise HTTPException(status_code=403, detail="Usuário bloqueado no momento.")

    if hash_atualizado:
        usuario.senha_hash = hash_atualizado

    if hasattr(usuario, "registrar_login_sucesso"):
        usuario.registrar_login_sucesso(ip=request.client.host if request.client else None)
    commit_ou_rollback_operacional(
        banco,
        logger_operacao=logger,
        mensagem_erro="Falha ao confirmar login mobile do inspetor.",
    )
    token = criar_sessao(
        usuario.id,
        lembrar=bool(payload.lembrar),
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent", ""),
    )

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
    return JSONResponse(
        {
            "ok": True,
            "itens": _listar_cards_laudos_mobile_inspetor(banco, usuario=usuario, limite=30),
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


async def api_atualizar_perfil_mobile_inspetor(
    dados: DadosAtualizarPerfilUsuario,
    usuario: Usuario = Depends(exigir_inspetor),
    banco: Session = Depends(obter_banco),
):
    _atualizar_perfil_usuario_em_banco(
        usuario=usuario,
        banco=banco,
        nome_completo=dados.nome_completo,
        email_bruto=dados.email,
        telefone_bruto=dados.telefone,
    )

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
    banco.flush()

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
    preferencia = _obter_preferencia_mobile_usuario(banco, usuario_id=int(usuario.id))

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
    return JSONResponse(
        {
            "ok": True,
            "settings": _salvar_configuracoes_criticas_mobile_usuario(
                banco,
                usuario=usuario,
                payload=payload.model_dump(),
            ),
        }
    )


roteador_auth_mobile.add_api_route("/api/mobile/auth/login", api_login_mobile_inspetor, methods=["POST"])
roteador_auth_mobile.add_api_route("/api/mobile/bootstrap", api_bootstrap_mobile_inspetor, methods=["GET"])
roteador_auth_mobile.add_api_route("/api/mobile/laudos", api_listar_laudos_mobile_inspetor, methods=["GET"])
roteador_auth_mobile.add_api_route(
    "/api/mobile/account/profile",
    api_atualizar_perfil_mobile_inspetor,
    methods=["PUT"],
    responses={
        400: {"description": "Dados de perfil inválidos."},
        409: {"description": "E-mail já está em uso."},
    },
)
roteador_auth_mobile.add_api_route(
    "/api/mobile/account/password",
    api_alterar_senha_mobile_inspetor,
    methods=["POST"],
    responses={
        400: {"description": "Falha de validação da nova senha."},
        401: {"description": "Senha atual inválida."},
    },
)
roteador_auth_mobile.add_api_route(
    "/api/mobile/account/photo",
    api_upload_foto_perfil_mobile_usuario,
    methods=["POST"],
    responses={
        400: {"description": "Arquivo de foto inválido ou vazio."},
        413: {"description": "Arquivo excede o limite permitido."},
        415: {"description": "Formato de imagem não suportado."},
    },
)
roteador_auth_mobile.add_api_route(
    "/api/mobile/support/report",
    api_relato_suporte_mobile_inspetor,
    methods=["POST"],
    responses={400: {"description": "Relato inválido."}},
)
roteador_auth_mobile.add_api_route("/api/mobile/account/settings", api_obter_configuracoes_criticas_mobile_inspetor, methods=["GET"])
roteador_auth_mobile.add_api_route(
    "/api/mobile/account/settings",
    api_salvar_configuracoes_criticas_mobile_inspetor,
    methods=["PUT"],
    responses={400: {"description": "Configurações inválidas."}},
)
roteador_auth_mobile.add_api_route("/api/mobile/auth/logout", api_logout_mobile_inspetor, methods=["POST"])


__all__ = [
    "api_alterar_senha_mobile_inspetor",
    "api_atualizar_perfil_mobile_inspetor",
    "api_bootstrap_mobile_inspetor",
    "api_listar_laudos_mobile_inspetor",
    "api_login_mobile_inspetor",
    "api_logout_mobile_inspetor",
    "api_obter_configuracoes_criticas_mobile_inspetor",
    "api_relato_suporte_mobile_inspetor",
    "api_salvar_configuracoes_criticas_mobile_inspetor",
    "api_upload_foto_perfil_mobile_usuario",
    "roteador_auth_mobile",
]
