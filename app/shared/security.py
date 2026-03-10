# ==========================================
# TARIEL CONTROL TOWER — SEGURANCA.PY
# Responsabilidade: Hashing, Sessões e Dependências RBAC
# ==========================================

from __future__ import annotations

import hashlib
import logging
import os
import secrets
import string
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import Depends, HTTPException, Request, status
from passlib.context import CryptContext
from passlib.exc import PasslibSecurityError, UnknownHashError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.shared.database import (
    NivelAcesso,
    SessaoAtiva,
    SessaoLocal,
    Usuario,
    obter_banco,
)

logger = logging.getLogger("tariel.seguranca")


# =========================================================
# CONFIGURAÇÃO
# =========================================================


def _bool_env(nome: str, padrao: bool = False) -> bool:
    valor = str(os.getenv(nome, str(padrao))).strip().lower()
    return valor in {"1", "true", "yes", "on", "sim"}


_AMBIENTE_BRUTO = os.getenv("AMBIENTE", "").strip()
if not _AMBIENTE_BRUTO:
    raise RuntimeError(
        "AMBIENTE é obrigatório. Defina no .env (ex.: AMBIENTE=dev ou AMBIENTE=producao)."
    )

AMBIENTE = _AMBIENTE_BRUTO.lower()
_AMBIENTES_DEV = {"dev", "development", "local"}
_AMBIENTES_PRODUCAO = {"producao", "production", "prod"}
if AMBIENTE not in (_AMBIENTES_DEV | _AMBIENTES_PRODUCAO):
    raise RuntimeError(
        "AMBIENTE inválido. Use: dev, development, local, producao, production ou prod."
    )

EM_PRODUCAO = AMBIENTE in _AMBIENTES_PRODUCAO

BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "12"))
TTL_SESSAO_HORAS = int(os.getenv("SESSAO_TTL_HORAS", "8"))
TTL_SESSAO_LEMBRAR_DIAS = int(os.getenv("SESSAO_TTL_LEMBRAR_DIAS", "30"))
MAX_SESSOES_POR_USUARIO = int(os.getenv("SESSAO_MAX_POR_USUARIO", "5"))

SESSAO_VINCULAR_USER_AGENT = _bool_env("SESSAO_VINCULAR_USER_AGENT", False)
SESSAO_VINCULAR_IP = _bool_env("SESSAO_VINCULAR_IP", False)
SESSAO_RENOVACAO_ATIVA = _bool_env("SESSAO_RENOVACAO_ATIVA", True)

# Quando faltar menos que isso para expirar, a sessão é renovada.
JANELA_RENOVACAO_MINUTOS = int(os.getenv("SESSAO_JANELA_RENOVACAO_MINUTOS", "30"))

# Limpeza lazy: 1 em N requests.
_CHANCE_LIMPEZA = max(int(os.getenv("SESSAO_CHANCE_LIMPEZA", "100")), 1)

contexto_senha = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=BCRYPT_ROUNDS,
)

CHAVE_SESSION_TOKEN = "session_token"
CHAVE_USUARIO_ID = "usuario_id"
CHAVE_EMPRESA_ID = "empresa_id"
CHAVE_NIVEL_ACESSO = "nivel_acesso"
CHAVE_NOME = "nome"

PORTAL_INSPETOR = "inspetor"
PORTAL_REVISOR = "revisor"
PORTAL_ADMIN = "admin"

_CHAVES_SESSAO_POR_PORTAL: dict[str, dict[str, str]] = {
    PORTAL_INSPETOR: {
        "token": "session_token_inspetor",
        "usuario_id": "usuario_id_inspetor",
        "empresa_id": "empresa_id_inspetor",
        "nivel_acesso": "nivel_acesso_inspetor",
        "nome": "nome_inspetor",
    },
    PORTAL_REVISOR: {
        "token": "session_token_revisor",
        "usuario_id": "usuario_id_revisor",
        "empresa_id": "empresa_id_revisor",
        "nivel_acesso": "nivel_acesso_revisor",
        "nome": "nome_revisor",
    },
    PORTAL_ADMIN: {
        "token": "session_token_admin",
        "usuario_id": "usuario_id_admin",
        "empresa_id": "empresa_id_admin",
        "nivel_acesso": "nivel_acesso_admin",
        "nome": "nome_admin",
    },
}


# =========================================================
# ESTRUTURA DE SESSÃO
# =========================================================


@dataclass(slots=True)
class MetaSessao:
    usuario_id: int
    criada_em: datetime
    expira_em: datetime
    ultima_atividade_em: datetime
    lembrar: bool
    ip_hash: str | None = None
    user_agent_hash: str | None = None


_lock_sessoes = threading.Lock()

# Mantidos por compatibilidade com o restante do projeto.
SESSOES_ATIVAS: dict[str, int] = {}
_SESSAO_EXPIRACAO: dict[str, datetime] = {}

# Estrutura nova, mais rica.
_SESSAO_META: dict[str, MetaSessao] = {}


# =========================================================
# HELPERS GERAIS
# =========================================================


def _agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def _normalizar_datetime_utc(valor: datetime) -> datetime:
    if valor.tzinfo is None:
        return valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(timezone.utc)


def _ttl_sessao(lembrar: bool = False) -> timedelta:
    return timedelta(days=TTL_SESSAO_LEMBRAR_DIAS) if lembrar else timedelta(hours=TTL_SESSAO_HORAS)


def _hash_contexto(valor: str | None) -> str | None:
    texto = (valor or "").strip()
    if not texto:
        return None
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def _normalizar_ip(request: Request) -> str | None:
    if not request.client:
        return None
    return request.client.host or None


def _normalizar_user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent", "").strip() or None


def _remover_token_interno(token: str) -> int | None:
    usuario_id = SESSOES_ATIVAS.pop(token, None)
    _SESSAO_EXPIRACAO.pop(token, None)
    _SESSAO_META.pop(token, None)
    return usuario_id


def _salvar_sessao_bd(token: str, meta: MetaSessao) -> None:
    try:
        with SessaoLocal() as banco:
            banco.merge(
                SessaoAtiva(
                    token=token,
                    usuario_id=meta.usuario_id,
                    criada_em=meta.criada_em,
                    expira_em=meta.expira_em,
                    ultima_atividade_em=meta.ultima_atividade_em,
                    lembrar=meta.lembrar,
                    ip_hash=meta.ip_hash,
                    user_agent_hash=meta.user_agent_hash,
                )
            )
            banco.commit()
    except Exception:
        logger.error(
            "Falha ao persistir sessão no banco | usuario_id=%s",
            meta.usuario_id,
            exc_info=True,
        )


def _carregar_sessao_bd(token: str) -> MetaSessao | None:
    try:
        with SessaoLocal() as banco:
            registro = banco.get(SessaoAtiva, token)
            if not registro:
                return None

            return MetaSessao(
                usuario_id=int(registro.usuario_id),
                criada_em=_normalizar_datetime_utc(registro.criada_em),
                expira_em=_normalizar_datetime_utc(registro.expira_em),
                ultima_atividade_em=_normalizar_datetime_utc(registro.ultima_atividade_em),
                lembrar=bool(registro.lembrar),
                ip_hash=registro.ip_hash,
                user_agent_hash=registro.user_agent_hash,
            )
    except Exception:
        logger.error("Falha ao carregar sessão do banco.", exc_info=True)
        return None


def _atualizar_sessao_bd(token: str, meta: MetaSessao) -> None:
    try:
        with SessaoLocal() as banco:
            registro = banco.get(SessaoAtiva, token)
            if not registro:
                return

            registro.expira_em = meta.expira_em
            registro.ultima_atividade_em = meta.ultima_atividade_em
            registro.lembrar = meta.lembrar
            registro.ip_hash = meta.ip_hash
            registro.user_agent_hash = meta.user_agent_hash
            banco.commit()
    except Exception:
        logger.error("Falha ao atualizar sessão no banco.", exc_info=True)


def _remover_sessao_bd(token: str) -> None:
    try:
        with SessaoLocal() as banco:
            banco.execute(delete(SessaoAtiva).where(SessaoAtiva.token == token))
            banco.commit()
    except Exception:
        logger.error("Falha ao remover sessão no banco.", exc_info=True)


def _remover_sessoes_bd(tokens: list[str]) -> None:
    if not tokens:
        return

    try:
        with SessaoLocal() as banco:
            banco.execute(delete(SessaoAtiva).where(SessaoAtiva.token.in_(tokens)))
            banco.commit()
    except Exception:
        logger.error("Falha ao remover sessões em lote no banco.", exc_info=True)


def _limpar_sessoes_expiradas_bd(agora: datetime) -> list[str]:
    try:
        with SessaoLocal() as banco:
            tokens = list(banco.scalars(select(SessaoAtiva.token).where(SessaoAtiva.expira_em < agora)).all())
            if tokens:
                banco.execute(delete(SessaoAtiva).where(SessaoAtiva.token.in_(tokens)))
                banco.commit()
            return tokens
    except Exception:
        logger.error("Falha ao limpar sessões expiradas no banco.", exc_info=True)
        return []


def _tokens_sessoes_usuario_bd(usuario_id: int, *, incluir_token: str | None = None) -> list[str]:
    try:
        with SessaoLocal() as banco:
            stmt = select(SessaoAtiva.token).where(SessaoAtiva.usuario_id == usuario_id)
            if incluir_token is None:
                return list(banco.scalars(stmt).all())
            return list(banco.scalars(stmt.where(SessaoAtiva.token != incluir_token)).all())
    except Exception:
        logger.error("Falha ao consultar sessões do usuário no banco.", exc_info=True)
        return []


def _encerrar_sessoes_excedentes_do_usuario_bd(usuario_id: int) -> list[str]:
    if MAX_SESSOES_POR_USUARIO <= 0:
        return []

    try:
        with SessaoLocal() as banco:
            registros = list(banco.scalars(select(SessaoAtiva).where(SessaoAtiva.usuario_id == usuario_id).order_by(SessaoAtiva.criada_em.asc())).all())

            if len(registros) < MAX_SESSOES_POR_USUARIO:
                return []

            excesso = len(registros) - MAX_SESSOES_POR_USUARIO + 1
            tokens_remover = [registro.token for registro in registros[:excesso]]
            banco.execute(delete(SessaoAtiva).where(SessaoAtiva.token.in_(tokens_remover)))
            banco.commit()
            return tokens_remover
    except Exception:
        logger.error("Falha ao encerrar sessões excedentes do usuário no banco.", exc_info=True)
        return []


def normalizar_portal_sessao(portal: str | None) -> str | None:
    valor = str(portal or "").strip().lower()
    if valor in _CHAVES_SESSAO_POR_PORTAL:
        return valor
    return None


def portal_por_caminho(caminho: str | None) -> str | None:
    rota = str(caminho or "").strip().lower()
    if rota.startswith("/app"):
        return PORTAL_INSPETOR
    if rota.startswith("/revisao"):
        return PORTAL_REVISOR
    if rota.startswith("/admin"):
        return PORTAL_ADMIN
    return None


def _chaves_sessao_do_portal(portal: str | None) -> dict[str, str] | None:
    portal_normalizado = normalizar_portal_sessao(portal)
    if not portal_normalizado:
        return None
    return _CHAVES_SESSAO_POR_PORTAL.get(portal_normalizado)


def _nivel_compativel_com_portal(portal: str | None, nivel_acesso: Any) -> bool:
    try:
        nivel_int = int(nivel_acesso)
    except (TypeError, ValueError):
        return False

    if portal == PORTAL_INSPETOR:
        return nivel_int == NivelAcesso.INSPETOR.value

    if portal == PORTAL_REVISOR:
        return nivel_int >= NivelAcesso.REVISOR.value

    if portal == PORTAL_ADMIN:
        return nivel_int >= NivelAcesso.DIRETORIA.value

    return True


def obter_dados_sessao_portal(
    sessao: Any,
    *,
    portal: str | None = None,
    caminho: str | None = None,
) -> dict[str, Any]:
    portal_alvo = normalizar_portal_sessao(portal) or portal_por_caminho(caminho)
    chaves = _chaves_sessao_do_portal(portal_alvo)

    token = sessao.get(CHAVE_SESSION_TOKEN)
    usuario_id = sessao.get(CHAVE_USUARIO_ID)
    empresa_id = sessao.get(CHAVE_EMPRESA_ID)
    nivel_acesso = sessao.get(CHAVE_NIVEL_ACESSO)
    nome = sessao.get(CHAVE_NOME)

    if chaves:
        token_portal = sessao.get(chaves["token"])
        usuario_id_portal = sessao.get(chaves["usuario_id"])
        empresa_id_portal = sessao.get(chaves["empresa_id"])
        nivel_portal = sessao.get(chaves["nivel_acesso"])
        nome_portal = sessao.get(chaves["nome"])

        if token_portal:
            token = token_portal
            usuario_id = usuario_id_portal or usuario_id
            empresa_id = empresa_id_portal or empresa_id
            nivel_acesso = nivel_portal or nivel_acesso
            nome = nome_portal or nome
        elif not _nivel_compativel_com_portal(portal_alvo, nivel_acesso):
            # Evita vazamento entre portais:
            # ex.: token global de admin sendo aceito em /app.
            token = None
            usuario_id = None
            empresa_id = None
            nivel_acesso = None
            nome = None

    return {
        "portal": portal_alvo,
        "token": token,
        "usuario_id": usuario_id,
        "empresa_id": empresa_id,
        "nivel_acesso": nivel_acesso,
        "nome": nome,
    }


def definir_sessao_portal(
    sessao: Any,
    *,
    portal: str,
    token: str,
    usuario_id: int,
    empresa_id: int | None,
    nivel_acesso: int,
    nome: str,
) -> None:
    portal_normalizado = normalizar_portal_sessao(portal)
    chaves = _chaves_sessao_do_portal(portal_normalizado)
    if not chaves:
        raise ValueError("Portal inválido para definição de sessão.")

    sessao[chaves["token"]] = token
    sessao[chaves["usuario_id"]] = int(usuario_id)
    sessao[chaves["empresa_id"]] = int(empresa_id) if empresa_id is not None else None
    sessao[chaves["nivel_acesso"]] = int(nivel_acesso)
    sessao[chaves["nome"]] = str(nome or "").strip()

    # Compatibilidade com chaves legadas existentes no projeto.
    sessao[CHAVE_SESSION_TOKEN] = token
    sessao[CHAVE_USUARIO_ID] = int(usuario_id)
    sessao[CHAVE_EMPRESA_ID] = int(empresa_id) if empresa_id is not None else None
    sessao[CHAVE_NIVEL_ACESSO] = int(nivel_acesso)
    sessao[CHAVE_NOME] = str(nome or "").strip()


def limpar_sessao_portal(sessao: Any, *, portal: str) -> None:
    chaves = _chaves_sessao_do_portal(portal)
    if not chaves:
        return

    token_portal = sessao.get(chaves["token"])
    token_global = sessao.get(CHAVE_SESSION_TOKEN)

    for chave in chaves.values():
        sessao.pop(chave, None)

    deve_limpar_global = bool(token_portal and token_global == token_portal)
    if not deve_limpar_global and not token_portal and token_global:
        try:
            nivel_global = int(sessao.get(CHAVE_NIVEL_ACESSO))
        except (TypeError, ValueError):
            nivel_global = None

        if portal == PORTAL_INSPETOR and nivel_global == NivelAcesso.INSPETOR.value:
            deve_limpar_global = True
        elif portal == PORTAL_REVISOR and nivel_global is not None and nivel_global >= NivelAcesso.REVISOR.value:
            deve_limpar_global = True
        elif portal == PORTAL_ADMIN and nivel_global == NivelAcesso.DIRETORIA.value:
            deve_limpar_global = True

    if deve_limpar_global:
        for chave in (CHAVE_SESSION_TOKEN, CHAVE_USUARIO_ID, CHAVE_EMPRESA_ID, CHAVE_NIVEL_ACESSO, CHAVE_NOME):
            sessao.pop(chave, None)


def _limpar_chaves_sessao_request(request: Request, *, portal: str | None = None) -> None:
    portal_normalizado = normalizar_portal_sessao(portal) or portal_por_caminho(request.url.path)
    if portal_normalizado:
        limpar_sessao_portal(request.session, portal=portal_normalizado)
        return

    for chave in (CHAVE_SESSION_TOKEN, CHAVE_USUARIO_ID, CHAVE_EMPRESA_ID, CHAVE_NIVEL_ACESSO, CHAVE_NOME):
        request.session.pop(chave, None)


def usuario_tem_bloqueio_ativo(usuario: Usuario) -> bool:
    if not getattr(usuario, "ativo", True):
        return True

    bloqueio_temporario_ativo = False
    if hasattr(usuario, "esta_bloqueado") and callable(usuario.esta_bloqueado):
        try:
            bloqueio_temporario_ativo = bool(usuario.esta_bloqueado())
        except Exception:
            logger.warning(
                "Falha ao verificar bloqueio temporal do usuário | usuario_id=%s",
                getattr(usuario, "id", None),
                exc_info=True,
            )

    status_bloqueio = bool(getattr(usuario, "status_bloqueio", False))
    bloqueado_ate = getattr(usuario, "bloqueado_ate", None)

    if status_bloqueio:
        # Bloqueio manual/administrativo (sem prazo) permanece ativo.
        if bloqueado_ate is None:
            return True
        # Bloqueio temporário ainda válido.
        if bloqueio_temporario_ativo:
            return True
        # Se existe prazo e já expirou, não bloqueia mais.
    elif bloqueio_temporario_ativo:
        return True

    empresa = getattr(usuario, "empresa", None)
    if empresa and getattr(empresa, "status_bloqueio", False):
        return True

    return False


def _token_expirado(meta: MetaSessao | None) -> bool:
    if not meta:
        return True
    meta.expira_em = _normalizar_datetime_utc(meta.expira_em)
    return _agora_utc() > meta.expira_em


def _contexto_sessao_confere(meta: MetaSessao, request: Request) -> bool:
    if SESSAO_VINCULAR_USER_AGENT and meta.user_agent_hash:
        user_agent_atual = _hash_contexto(_normalizar_user_agent(request))
        if not user_agent_atual or user_agent_atual != meta.user_agent_hash:
            return False

    if SESSAO_VINCULAR_IP and meta.ip_hash:
        ip_atual = _hash_contexto(_normalizar_ip(request))
        if not ip_atual or ip_atual != meta.ip_hash:
            return False

    return True


def _renovar_sessao_se_necessario(token: str) -> None:
    if not SESSAO_RENOVACAO_ATIVA:
        return

    agora = _agora_utc()

    with _lock_sessoes:
        meta = _SESSAO_META.get(token)
        if not meta:
            return

        restante = meta.expira_em - agora
        if restante > timedelta(minutes=JANELA_RENOVACAO_MINUTOS):
            meta.ultima_atividade_em = agora
            return

        nova_expiracao = agora + _ttl_sessao(meta.lembrar)
        meta.expira_em = nova_expiracao
        meta.ultima_atividade_em = agora
        _SESSAO_EXPIRACAO[token] = nova_expiracao

    _atualizar_sessao_bd(token, meta)


def _encerrar_sessoes_excedentes_do_usuario(usuario_id: int) -> None:
    if MAX_SESSOES_POR_USUARIO <= 0:
        return

    tokens_bd = _encerrar_sessoes_excedentes_do_usuario_bd(usuario_id)

    if not tokens_bd:
        return

    with _lock_sessoes:
        for token in tokens_bd:
            _remover_token_interno(token)
            logger.info(
                "Sessão antiga removida por limite de sessões simultâneas | usuario_id=%s",
                usuario_id,
            )


# =========================================================
# SENHAS
# =========================================================


def criar_hash_senha(senha_pura: str) -> str:
    senha = str(senha_pura or "")
    if not senha:
        raise ValueError("Senha vazia não é permitida.")
    return contexto_senha.hash(senha)


def verificar_senha(senha_pura: str, senha_hash: str) -> bool:
    senha = str(senha_pura or "")
    hash_salvo = str(senha_hash or "")

    if not senha or not hash_salvo:
        return False

    try:
        return bool(contexto_senha.verify(senha, hash_salvo))
    except (UnknownHashError, PasslibSecurityError, ValueError) as erro:
        logger.warning("Falha ao verificar hash de senha: %s", erro)
        return False


def hash_precisa_upgrade(senha_hash: str) -> bool:
    hash_salvo = str(senha_hash or "")
    if not hash_salvo:
        return False

    try:
        return bool(contexto_senha.needs_update(hash_salvo))
    except (UnknownHashError, PasslibSecurityError, ValueError):
        return False


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
# SESSÕES
# =========================================================


def criar_sessao(
    usuario_id: int,
    lembrar: bool = False,
    ip: str | None = None,
    user_agent: str | None = None,
) -> str:
    if not isinstance(usuario_id, int) or usuario_id <= 0:
        raise ValueError("usuario_id inválido para criação de sessão.")

    agora = _agora_utc()
    ttl = _ttl_sessao(lembrar)
    token = secrets.token_urlsafe(64)
    expira_em = agora + ttl

    meta = MetaSessao(
        usuario_id=usuario_id,
        criada_em=agora,
        expira_em=expira_em,
        ultima_atividade_em=agora,
        lembrar=lembrar,
        ip_hash=_hash_contexto(ip) if SESSAO_VINCULAR_IP else None,
        user_agent_hash=_hash_contexto(user_agent) if SESSAO_VINCULAR_USER_AGENT else None,
    )

    _encerrar_sessoes_excedentes_do_usuario(usuario_id)

    with _lock_sessoes:
        SESSOES_ATIVAS[token] = usuario_id
        _SESSAO_EXPIRACAO[token] = expira_em
        _SESSAO_META[token] = meta

    _salvar_sessao_bd(token, meta)

    logger.info(
        "Sessão criada | usuario_id=%s | persistente=%s",
        usuario_id,
        lembrar,
    )
    return token


def encerrar_sessao(token: Optional[str]) -> None:
    if not token:
        return

    with _lock_sessoes:
        usuario_id = _remover_token_interno(token)

    _remover_sessao_bd(token)

    if usuario_id:
        logger.info("Sessão encerrada | usuario_id=%s", usuario_id)


def encerrar_todas_sessoes_usuario(usuario_id: int, exceto_token: str | None = None) -> int:
    tokens_bd = _tokens_sessoes_usuario_bd(usuario_id, incluir_token=exceto_token)
    _remover_sessoes_bd(tokens_bd)

    removidas = 0
    with _lock_sessoes:
        tokens = [token for token, meta in _SESSAO_META.items() if meta.usuario_id == usuario_id and token != exceto_token]
        tokens.extend([token for token in tokens_bd if token not in tokens])
        for token in tokens:
            _remover_token_interno(token)
            removidas += 1

    if removidas:
        logger.info(
            "Todas as sessões do usuário foram encerradas | usuario_id=%s | removidas=%s",
            usuario_id,
            removidas,
        )

    return removidas


def token_esta_ativo(token: str) -> bool:
    if not token:
        return False

    with _lock_sessoes:
        meta = _SESSAO_META.get(token)

    if not meta:
        meta_bd = _carregar_sessao_bd(token)
        if not meta_bd:
            return False

        with _lock_sessoes:
            meta = _SESSAO_META.get(token)
            if not meta:
                SESSOES_ATIVAS[token] = meta_bd.usuario_id
                _SESSAO_EXPIRACAO[token] = meta_bd.expira_em
                _SESSAO_META[token] = meta_bd
                meta = meta_bd

    if _token_expirado(meta):
        with _lock_sessoes:
            _remover_token_interno(token)
        _remover_sessao_bd(token)
        return False

    return True


def _limpar_sessoes_expiradas() -> int:
    agora = _agora_utc()
    removidas = 0
    tokens_expirados_bd = _limpar_sessoes_expiradas_bd(agora)

    with _lock_sessoes:
        tokens_expirados = list(tokens_expirados_bd)
        tokens_expirados.extend([token for token, meta in _SESSAO_META.items() if agora > meta.expira_em])

        # Fallback defensivo para tokens legados sem meta.
        for token, expira_em in list(_SESSAO_EXPIRACAO.items()):
            if token not in _SESSAO_META and agora > expira_em:
                tokens_expirados.append(token)

        for token in set(tokens_expirados):
            if _remover_token_interno(token) is not None:
                removidas += 1

    if removidas:
        logger.info("Limpeza lazy: %d sessão(ões) removida(s)", removidas)

    return removidas


def contar_sessoes_ativas() -> int:
    with _lock_sessoes:
        return len(SESSOES_ATIVAS)


# =========================================================
# LÓGICA CENTRAL DE AUTENTICAÇÃO
# =========================================================


def _resolver_usuario(request: Request, banco: Session) -> Optional[Usuario]:
    if secrets.randbelow(_CHANCE_LIMPEZA) == 0:
        _limpar_sessoes_expiradas()

    portal_atual = portal_por_caminho(request.url.path)
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
        _limpar_chaves_sessao_request(request, portal=portal_atual)
        return None

    usuario = banco.get(Usuario, usuario_id)
    if not usuario:
        encerrar_sessao(token)
        _limpar_chaves_sessao_request(request, portal=portal_atual)
        logger.warning(
            "Usuário inexistente com sessão ativa | usuario_id=%s | ip=%s",
            usuario_id,
            ip,
        )
        return None

    if usuario_tem_bloqueio_ativo(usuario):
        encerrar_sessao(token)
        _limpar_chaves_sessao_request(request, portal=portal_atual)
        logger.warning(
            "Acesso negado — bloqueio ativo | usuario_id=%s | ip=%s",
            usuario.id,
            ip,
        )
        return None

    if meta and not _contexto_sessao_confere(meta, request):
        encerrar_sessao(token)
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
    except Exception:
        pass

    return usuario


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


def _exigir_nivel_exato(usuario: Usuario, nivel: NivelAcesso, detalhe: str) -> Usuario:
    if usuario.nivel_acesso != nivel.value:
        logger.warning(
            "Acesso negado [nivel_exato] | usuario_id=%s | nivel_atual=%s | nivel_esperado=%s",
            usuario.id,
            usuario.nivel_acesso,
            nivel.value,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detalhe,
        )
    return usuario


def _exigir_nivel_minimo(usuario: Usuario, nivel: NivelAcesso, detalhe: str) -> Usuario:
    if usuario.nivel_acesso < nivel.value:
        logger.warning(
            "Acesso negado [nivel_minimo] | usuario_id=%s | nivel_atual=%s | nivel_minimo=%s",
            usuario.id,
            usuario.nivel_acesso,
            nivel.value,
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
    return _exigir_nivel_exato(
        usuario,
        NivelAcesso.INSPETOR,
        "Acesso permitido apenas para Inspetores.",
    )


def exigir_revisor(usuario: Usuario = Depends(obter_usuario_api)) -> Usuario:
    """
    Mesa avaliadora:
    REVISOR e DIRETORIA.
    """
    return _exigir_nivel_minimo(
        usuario,
        NivelAcesso.REVISOR,
        "Acesso restrito à Engenharia/Revisão.",
    )


def exigir_diretoria(usuario: Usuario = Depends(obter_usuario_api)) -> Usuario:
    """
    Painel admin:
    somente DIRETORIA.
    """
    return _exigir_nivel_minimo(
        usuario,
        NivelAcesso.DIRETORIA,
        "Acesso restrito à Diretoria.",
    )


# =========================================================
# CONSTANTES EXPORTADAS
# =========================================================

_NIVEIS_PERMITIDOS_APP = frozenset({NivelAcesso.INSPETOR.value})
_NIVEIS_PERMITIDOS_REVISAO = frozenset({NivelAcesso.REVISOR.value, NivelAcesso.DIRETORIA.value})
_NIVEIS_PERMITIDOS_ADMIN = frozenset({NivelAcesso.DIRETORIA.value})
