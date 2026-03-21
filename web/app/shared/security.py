# ==========================================
# TARIEL CONTROL TOWER — SEGURANCA.PY
# Responsabilidade: Hashing, Sessões e Dependências RBAC
# ==========================================

from __future__ import annotations

import logging
import secrets
import string
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher
from sqlalchemy.orm import Session

from app.core.settings import env_int
from app.shared.database import NivelAcesso, SessaoLocal, Usuario, obter_banco
from app.shared.security_support import (
    CHAVE_EMPRESA_ID,
    CHAVE_NIVEL_ACESSO,
    CHAVE_NOME,
    CHAVE_SESSION_TOKEN,
    CHAVE_USUARIO_ID,
    PORTAL_ADMIN,
    PORTAL_CLIENTE,
    PORTAL_INSPETOR,
    PORTAL_REVISOR,
    SESSOES_ATIVAS,
    MetaSessao,
    _CHANCE_LIMPEZA,
    _SESSAO_EXPIRACAO,
    _SESSAO_META,
    _contexto_sessao_confere,
    _limpar_chaves_sessao_request,
    _limpar_sessoes_expiradas,
    _lock_sessoes,
    _normalizar_ip,
    _renovar_sessao_se_necessario,
    contar_sessoes_ativas,
    criar_sessao,
    definir_sessao_portal,
    encerrar_sessao,
    encerrar_todas_sessoes_usuario,
    limpar_sessao_portal,
    niveis_permitidos_portal,
    normalizar_portal_sessao,
    obter_dados_sessao_portal,
    obter_token_bearer_request,
    portal_por_caminho,
    token_esta_ativo,
    usuario_tem_acesso_portal,
    usuario_tem_bloqueio_ativo,
    usuario_tem_nivel,
    usuario_tem_niveis_permitidos,
)

logger = logging.getLogger("tariel.seguranca")


# =========================================================
# CONFIGURAÇÃO
# =========================================================

BCRYPT_ROUNDS = env_int("BCRYPT_ROUNDS", 12)

contexto_senha = PasswordHash(
    (
        Argon2Hasher(),
        # Mantemos bcrypt como verificador legado para migração transparente.
        BcryptHasher(rounds=BCRYPT_ROUNDS, prefix="2b"),
    )
)
_PREFIXOS_BCRYPT_LEGADO = ("$2a$", "$2b$", "$2y$")

_NIVEIS_PERMITIDOS_APP = frozenset({NivelAcesso.INSPETOR.value})
_NIVEIS_PERMITIDOS_REVISAO = frozenset({NivelAcesso.REVISOR.value, NivelAcesso.DIRETORIA.value})
_NIVEIS_PERMITIDOS_CLIENTE = frozenset({NivelAcesso.ADMIN_CLIENTE.value})
_NIVEIS_PERMITIDOS_ADMIN = frozenset({NivelAcesso.DIRETORIA.value})

_NIVEIS_PERMITIDOS_POR_PORTAL: dict[str, frozenset[int]] = {
    PORTAL_INSPETOR: _NIVEIS_PERMITIDOS_APP,
    PORTAL_REVISOR: _NIVEIS_PERMITIDOS_REVISAO,
    PORTAL_CLIENTE: _NIVEIS_PERMITIDOS_CLIENTE,
    PORTAL_ADMIN: _NIVEIS_PERMITIDOS_ADMIN,
}

# Reexporta o contrato historico do modulo apos a extracao para security_support.py.
__all__ = [
    "BCRYPT_ROUNDS",
    "CHAVE_EMPRESA_ID",
    "CHAVE_NIVEL_ACESSO",
    "CHAVE_NOME",
    "CHAVE_SESSION_TOKEN",
    "CHAVE_USUARIO_ID",
    "MetaSessao",
    "PORTAL_ADMIN",
    "PORTAL_CLIENTE",
    "PORTAL_INSPETOR",
    "PORTAL_REVISOR",
    "SESSOES_ATIVAS",
    "SessaoLocal",
    "_CHANCE_LIMPEZA",
    "_SESSAO_EXPIRACAO",
    "_SESSAO_META",
    "_contexto_sessao_confere",
    "_limpar_chaves_sessao_request",
    "_limpar_sessoes_expiradas",
    "_lock_sessoes",
    "_normalizar_ip",
    "_renovar_sessao_se_necessario",
    "contar_sessoes_ativas",
    "criar_hash_senha",
    "criar_sessao",
    "definir_sessao_portal",
    "encerrar_sessao",
    "encerrar_todas_sessoes_usuario",
    "exigir_admin_cliente",
    "exigir_diretoria",
    "exigir_inspetor",
    "exigir_revisor",
    "gerar_senha_fortificada",
    "hash_precisa_upgrade",
    "limpar_sessao_portal",
    "niveis_permitidos_portal",
    "normalizar_portal_sessao",
    "obter_dados_sessao_portal",
    "obter_token_autenticacao_request",
    "obter_token_bearer_request",
    "obter_usuario_api",
    "obter_usuario_html",
    "portal_por_caminho",
    "token_esta_ativo",
    "usuario_tem_acesso_portal",
    "usuario_tem_bloqueio_ativo",
    "usuario_tem_nivel",
    "usuario_tem_niveis_permitidos",
    "verificar_senha",
    "verificar_senha_com_upgrade",
]


# =========================================================
# SENHAS
# =========================================================


def criar_hash_senha(senha_pura: str) -> str:
    senha = str(senha_pura or "")
    if not senha:
        raise ValueError("Senha vazia não é permitida.")
    return contexto_senha.hash(senha)


def verificar_senha_com_upgrade(senha_pura: str, senha_hash: str) -> tuple[bool, str | None]:
    senha = str(senha_pura or "")
    hash_salvo = str(senha_hash or "")

    if not senha or not hash_salvo:
        return False, None

    try:
        senha_valida, hash_atualizado = contexto_senha.verify_and_update(senha, hash_salvo)
        return bool(senha_valida), str(hash_atualizado) if hash_atualizado else None
    except Exception as erro:
        logger.warning("Falha ao verificar hash de senha: %s", erro)
        return False, None


def verificar_senha(senha_pura: str, senha_hash: str) -> bool:
    senha_valida, _ = verificar_senha_com_upgrade(senha_pura, senha_hash)
    return senha_valida


def hash_precisa_upgrade(senha_hash: str) -> bool:
    hash_salvo = str(senha_hash or "")
    return bool(hash_salvo) and hash_salvo.startswith(_PREFIXOS_BCRYPT_LEGADO)


def gerar_senha_fortificada(comprimento: int = 14) -> str:
    if comprimento < 12:
        raise ValueError("Comprimento mínimo é 12.")
    if comprimento > 128:
        raise ValueError("Comprimento máximo é 128.")

    especiais = "!@#$%&*+-_=."
    alfabeto = string.ascii_letters + string.digits + especiais

    senha = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice(especiais),
    ]
    senha += [secrets.choice(alfabeto) for _ in range(comprimento - 4)]

    for i in range(len(senha) - 1, 0, -1):
        j = secrets.randbelow(i + 1)
        senha[i], senha[j] = senha[j], senha[i]

    return "".join(senha)


# =========================================================
# LÓGICA CENTRAL DE AUTENTICAÇÃO
# =========================================================


def _resolver_usuario(request: Request, banco: Session) -> Optional[Usuario]:
    if secrets.randbelow(_CHANCE_LIMPEZA) == 0:
        _limpar_sessoes_expiradas()

    portal_atual = portal_por_caminho(request.url.path)
    token_bearer = obter_token_bearer_request(request)
    autenticacao_bearer = bool(token_bearer)
    dados_sessao = {
        "portal": portal_atual,
        "token": None,
        "usuario_id": None,
        "empresa_id": None,
        "nivel_acesso": None,
        "nome": None,
    }

    if autenticacao_bearer:
        token = token_bearer
    else:
        dados_sessao = obter_dados_sessao_portal(
            request.session,
            portal=portal_atual,
            caminho=request.url.path,
        )
        token = dados_sessao.get("token")

    ip = _normalizar_ip(request) or "desconhecido"

    if not token:
        return None

    if not token_esta_ativo(token):
        logger.warning("Token inativo ou expirado | ip=%s", ip)
        if not autenticacao_bearer:
            _limpar_chaves_sessao_request(request, portal=portal_atual)
        return None

    with _lock_sessoes:
        meta = _SESSAO_META.get(token)
        usuario_id = meta.usuario_id if meta else SESSOES_ATIVAS.get(token)

    if not usuario_id:
        logger.warning("Token sem usuario_id associado | ip=%s", ip)
        encerrar_sessao(token)
        _limpar_chaves_sessao_request(request, portal=portal_atual)
        return None

    usuario_id_sessao = dados_sessao.get("usuario_id")
    if usuario_id_sessao and int(usuario_id_sessao) != int(usuario_id):
        logger.warning(
            "Divergência entre session_token e usuario_id da sessão web | token_uid=%s | sessao_uid=%s | ip=%s",
            usuario_id,
            usuario_id_sessao,
            ip,
        )
        encerrar_sessao(token)
        if not autenticacao_bearer:
            _limpar_chaves_sessao_request(request, portal=portal_atual)
        return None

    usuario = banco.get(Usuario, usuario_id)
    if not usuario:
        encerrar_sessao(token)
        if not autenticacao_bearer:
            _limpar_chaves_sessao_request(request, portal=portal_atual)
        logger.warning(
            "Usuário inexistente com sessão ativa | usuario_id=%s | ip=%s",
            usuario_id,
            ip,
        )
        return None

    if usuario_tem_bloqueio_ativo(usuario):
        encerrar_sessao(token)
        if not autenticacao_bearer:
            _limpar_chaves_sessao_request(request, portal=portal_atual)
        logger.warning(
            "Acesso negado — bloqueio ativo | usuario_id=%s | ip=%s",
            usuario.id,
            ip,
        )
        return None

    if meta and not _contexto_sessao_confere(meta, request):
        encerrar_sessao(token)
        if not autenticacao_bearer:
            _limpar_chaves_sessao_request(request, portal=portal_atual)
        logger.warning(
            "Sessão invalidada por divergência de contexto | usuario_id=%s | ip=%s",
            usuario.id,
            ip,
        )
        return None

    _renovar_sessao_se_necessario(token)

    try:
        request.state.usuario_autenticado = usuario
        request.state.token_autenticado = token
        request.state.autenticacao_bearer = autenticacao_bearer
    except Exception:
        pass

    return usuario


def obter_token_autenticacao_request(request: Request) -> str | None:
    token = str(getattr(request.state, "token_autenticado", "") or "").strip()
    if token:
        return token

    token_bearer = obter_token_bearer_request(request)
    if token_bearer:
        return token_bearer

    portal_atual = portal_por_caminho(request.url.path)
    dados_sessao = obter_dados_sessao_portal(
        request.session,
        portal=portal_atual,
        caminho=request.url.path,
    )
    token_sessao = str(dados_sessao.get("token") or "").strip()
    return token_sessao or None


# =========================================================
# DEPENDÊNCIAS FASTAPI
# =========================================================


def obter_usuario_html(
    request: Request,
    banco: Session = Depends(obter_banco),
) -> Optional[Usuario]:
    """
    Rotas HTML:
    retorna None quando não autenticado.
    A rota chamadora decide se redireciona.
    """
    return _resolver_usuario(request, banco)


def obter_usuario_api(
    request: Request,
    banco: Session = Depends(obter_banco),
) -> Usuario:
    """
    Rotas API/JSON:
    levanta 401 quando não autenticado.
    """
    usuario = _resolver_usuario(request, banco)
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão expirada. Faça login novamente.",
        )
    return usuario


# =========================================================
# RBAC
# =========================================================


def _exigir_niveis_permitidos(
    usuario: Usuario,
    niveis_permitidos: set[int] | frozenset[int],
    detalhe: str,
    *,
    contexto_log: str,
) -> Usuario:
    if not usuario_tem_niveis_permitidos(usuario, niveis_permitidos):
        logger.warning(
            "Acesso negado [%s] | usuario_id=%s | nivel_atual=%s | niveis_permitidos=%s",
            contexto_log,
            usuario.id,
            usuario.nivel_acesso,
            sorted(int(nivel) for nivel in niveis_permitidos),
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detalhe,
        )
    return usuario


def exigir_inspetor(usuario: Usuario = Depends(obter_usuario_api)) -> Usuario:
    """
    Portal /app:
    somente INSPETOR.
    REVISOR e DIRETORIA devem usar seus próprios portais.
    """
    return _exigir_niveis_permitidos(
        usuario,
        _NIVEIS_PERMITIDOS_APP,
        "Acesso permitido apenas para Inspetores.",
        contexto_log="portal_inspetor",
    )


def exigir_revisor(usuario: Usuario = Depends(obter_usuario_api)) -> Usuario:
    """
    Mesa avaliadora:
    REVISOR e DIRETORIA.
    """
    return _exigir_niveis_permitidos(
        usuario,
        _NIVEIS_PERMITIDOS_REVISAO,
        "Acesso restrito à Engenharia/Revisão.",
        contexto_log="portal_revisor",
    )


def exigir_admin_cliente(usuario: Usuario = Depends(obter_usuario_api)) -> Usuario:
    """
    Portal /cliente:
    somente ADMIN_CLIENTE.
    """
    return _exigir_niveis_permitidos(
        usuario,
        _NIVEIS_PERMITIDOS_CLIENTE,
        "Acesso restrito ao portal admin-cliente.",
        contexto_log="portal_cliente",
    )


def exigir_diretoria(usuario: Usuario = Depends(obter_usuario_api)) -> Usuario:
    """
    Painel admin:
    somente DIRETORIA.
    """
    return _exigir_niveis_permitidos(
        usuario,
        _NIVEIS_PERMITIDOS_ADMIN,
        "Acesso restrito ao portal Admin-CEO.",
        contexto_log="portal_admin",
    )


# =========================================================
# CONSTANTES EXPORTADAS
# =========================================================
