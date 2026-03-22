# ==========================================
# TARIEL CONTROL TOWER — SECURITY_SESSION_STORE.PY
# Responsabilidade: Cache local, persistencia e ciclo de vida das sessoes
# ==========================================

from __future__ import annotations

import hashlib
import logging
import secrets
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, TypeVar

from fastapi import Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.settings import env_bool, env_int
import app.shared.database as banco_dados

logger = logging.getLogger("tariel.seguranca")

TTL_SESSAO_HORAS = env_int("SESSAO_TTL_HORAS", 8)
TTL_SESSAO_LEMBRAR_DIAS = env_int("SESSAO_TTL_LEMBRAR_DIAS", 30)
MAX_SESSOES_POR_USUARIO = env_int("SESSAO_MAX_POR_USUARIO", 5)

SESSAO_VINCULAR_USER_AGENT = env_bool("SESSAO_VINCULAR_USER_AGENT", False)
SESSAO_VINCULAR_IP = env_bool("SESSAO_VINCULAR_IP", False)
SESSAO_RENOVACAO_ATIVA = env_bool("SESSAO_RENOVACAO_ATIVA", True)
JANELA_RENOVACAO_MINUTOS = env_int("SESSAO_JANELA_RENOVACAO_MINUTOS", 30)
SESSAO_CACHE_DB_REVALIDACAO_SEGUNDOS = max(env_int("SESSAO_CACHE_DB_REVALIDACAO_SEGUNDOS", 0), 0)
_CHANCE_LIMPEZA = max(env_int("SESSAO_CHANCE_LIMPEZA", 100), 1)


@dataclass(slots=True)
class MetaSessao:
    usuario_id: int
    criada_em: datetime
    expira_em: datetime
    ultima_atividade_em: datetime
    lembrar: bool
    ip_hash: str | None = None
    user_agent_hash: str | None = None
    validada_no_banco_em: datetime | None = None


_lock_sessoes = threading.Lock()
SESSOES_ATIVAS: dict[str, int] = {}
_SESSAO_EXPIRACAO: dict[str, datetime] = {}
_SESSAO_META: dict[str, MetaSessao] = {}

_T = TypeVar("_T")


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


def _registrar_token_interno(token: str, meta: MetaSessao) -> None:
    SESSOES_ATIVAS[token] = meta.usuario_id
    _SESSAO_EXPIRACAO[token] = meta.expira_em
    _SESSAO_META[token] = meta


def _executar_leitura_sessao_bd(
    operacao: Callable[[Session], _T],
    *,
    mensagem_erro: str,
    fallback: _T,
) -> _T:
    try:
        with banco_dados.SessaoLocal() as banco:
            return operacao(banco)
    except Exception:
        logger.error(mensagem_erro, exc_info=True)
        return fallback


def _executar_mutacao_sessao_bd(
    operacao: Callable[[Session], _T],
    *,
    mensagem_erro: str,
    fallback: _T,
) -> _T:
    try:
        with banco_dados.SessaoLocal() as banco:
            resultado = operacao(banco)
            if banco_dados.sessao_tem_mutacoes_pendentes(banco):
                banco.commit()
            return resultado
    except Exception:
        logger.error(mensagem_erro, exc_info=True)
        return fallback


def _salvar_sessao_bd(token: str, meta: MetaSessao) -> bool:
    def _operacao(banco: Session) -> bool:
        banco.merge(
            banco_dados.SessaoAtiva(
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
        return True

    resultado = _executar_mutacao_sessao_bd(
        _operacao,
        mensagem_erro=f"Falha ao persistir sessao no banco | usuario_id={meta.usuario_id}",
        fallback=False,
    )
    return bool(resultado is not False)


def _carregar_sessao_bd_com_status(token: str) -> tuple[bool, MetaSessao | None]:
    def _operacao(banco: Session) -> tuple[bool, MetaSessao | None]:
        registro = banco.get(banco_dados.SessaoAtiva, token)
        if not registro:
            return True, None
        return True, MetaSessao(
            usuario_id=int(registro.usuario_id),
            criada_em=_normalizar_datetime_utc(registro.criada_em),
            expira_em=_normalizar_datetime_utc(registro.expira_em),
            ultima_atividade_em=_normalizar_datetime_utc(registro.ultima_atividade_em),
            lembrar=bool(registro.lembrar),
            ip_hash=registro.ip_hash,
            user_agent_hash=registro.user_agent_hash,
            validada_no_banco_em=_agora_utc(),
        )

    fallback: tuple[bool, MetaSessao | None] = (False, None)
    return _executar_leitura_sessao_bd(
        _operacao,
        mensagem_erro="Falha ao carregar sessao do banco.",
        fallback=fallback,
    )


def _carregar_sessao_bd(token: str) -> MetaSessao | None:
    _, meta = _carregar_sessao_bd_com_status(token)
    return meta


def _atualizar_sessao_bd(token: str, meta: MetaSessao) -> None:
    def _operacao(banco: Session) -> None:
        registro = banco.get(banco_dados.SessaoAtiva, token)
        if not registro:
            return
        registro.expira_em = meta.expira_em
        registro.ultima_atividade_em = meta.ultima_atividade_em
        registro.lembrar = meta.lembrar
        registro.ip_hash = meta.ip_hash
        registro.user_agent_hash = meta.user_agent_hash

    _executar_mutacao_sessao_bd(
        _operacao,
        mensagem_erro="Falha ao atualizar sessao no banco.",
        fallback=None,
    )


def _remover_sessao_bd(token: str) -> None:
    _executar_mutacao_sessao_bd(
        lambda banco: banco.execute(delete(banco_dados.SessaoAtiva).where(banco_dados.SessaoAtiva.token == token)),
        mensagem_erro="Falha ao remover sessao no banco.",
        fallback=None,
    )


def _remover_sessoes_bd(tokens: list[str]) -> None:
    if not tokens:
        return

    _executar_mutacao_sessao_bd(
        lambda banco: banco.execute(delete(banco_dados.SessaoAtiva).where(banco_dados.SessaoAtiva.token.in_(tokens))),
        mensagem_erro="Falha ao remover sessoes em lote no banco.",
        fallback=None,
    )


def _limpar_sessoes_expiradas_bd(agora: datetime) -> list[str]:
    def _operacao(banco: Session) -> list[str]:
        tokens = list(
            banco.scalars(
                select(banco_dados.SessaoAtiva.token).where(banco_dados.SessaoAtiva.expira_em < agora)
            ).all()
        )
        if tokens:
            banco.execute(delete(banco_dados.SessaoAtiva).where(banco_dados.SessaoAtiva.token.in_(tokens)))
        return tokens

    return _executar_mutacao_sessao_bd(
        _operacao,
        mensagem_erro="Falha ao limpar sessoes expiradas no banco.",
        fallback=[],
    )


def _tokens_sessoes_usuario_bd(usuario_id: int, *, incluir_token: str | None = None) -> list[str]:
    def _operacao(banco: Session) -> list[str]:
        stmt = select(banco_dados.SessaoAtiva.token).where(banco_dados.SessaoAtiva.usuario_id == usuario_id)
        if incluir_token is None:
            return list(banco.scalars(stmt).all())
        return list(banco.scalars(stmt.where(banco_dados.SessaoAtiva.token != incluir_token)).all())

    return _executar_leitura_sessao_bd(
        _operacao,
        mensagem_erro="Falha ao consultar sessoes do usuario no banco.",
        fallback=[],
    )


def _encerrar_sessoes_excedentes_do_usuario_bd(usuario_id: int) -> list[str]:
    if MAX_SESSOES_POR_USUARIO <= 0:
        return []

    def _operacao(banco: Session) -> list[str]:
        registros = list(
            banco.scalars(
                select(banco_dados.SessaoAtiva)
                .where(banco_dados.SessaoAtiva.usuario_id == usuario_id)
                .order_by(banco_dados.SessaoAtiva.criada_em.asc())
            ).all()
        )
        if len(registros) < MAX_SESSOES_POR_USUARIO:
            return []

        excesso = len(registros) - MAX_SESSOES_POR_USUARIO + 1
        tokens_remover = [registro.token for registro in registros[:excesso]]
        banco.execute(delete(banco_dados.SessaoAtiva).where(banco_dados.SessaoAtiva.token.in_(tokens_remover)))
        return tokens_remover

    return _executar_mutacao_sessao_bd(
        _operacao,
        mensagem_erro="Falha ao encerrar sessoes excedentes do usuario no banco.",
        fallback=[],
    )


def _token_expirado(meta: MetaSessao | None) -> bool:
    if not meta:
        return True
    meta.expira_em = _normalizar_datetime_utc(meta.expira_em)
    return _agora_utc() > meta.expira_em


def _precisa_revalidar_cache_no_banco(meta: MetaSessao, agora: datetime) -> bool:
    ultima_validacao = meta.validada_no_banco_em
    if ultima_validacao is None:
        return True
    if SESSAO_CACHE_DB_REVALIDACAO_SEGUNDOS == 0:
        return True
    return (agora - ultima_validacao) >= timedelta(seconds=SESSAO_CACHE_DB_REVALIDACAO_SEGUNDOS)


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

        meta.expira_em = agora + _ttl_sessao(meta.lembrar)
        meta.ultima_atividade_em = agora
        _SESSAO_EXPIRACAO[token] = meta.expira_em

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
                "Sessao antiga removida por limite de sessoes simultaneas | usuario_id=%s",
                usuario_id,
            )


def criar_sessao(
    usuario_id: int,
    lembrar: bool = False,
    ip: str | None = None,
    user_agent: str | None = None,
) -> str:
    if not isinstance(usuario_id, int) or usuario_id <= 0:
        raise ValueError("usuario_id invalido para criacao de sessao.")

    agora = _agora_utc()
    token = secrets.token_urlsafe(64)
    expira_em = agora + _ttl_sessao(lembrar)

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
        _registrar_token_interno(token, meta)

    if not _salvar_sessao_bd(token, meta):
        with _lock_sessoes:
            _remover_token_interno(token)
        raise RuntimeError("Falha ao persistir a sessao ativa no banco.")
    meta.validada_no_banco_em = _agora_utc()

    logger.info("Sessao criada | usuario_id=%s | persistente=%s", usuario_id, lembrar)
    return token


def encerrar_sessao(token: str | None) -> None:
    if not token:
        return

    with _lock_sessoes:
        usuario_id = _remover_token_interno(token)

    _remover_sessao_bd(token)

    if usuario_id:
        logger.info("Sessao encerrada | usuario_id=%s", usuario_id)


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
            "Todas as sessoes do usuario foram encerradas | usuario_id=%s | removidas=%s",
            usuario_id,
            removidas,
        )

    return removidas


def token_esta_ativo(token: str) -> bool:
    if not token:
        return False

    agora = _agora_utc()
    with _lock_sessoes:
        meta = _SESSAO_META.get(token)

    if meta is not None and _token_expirado(meta):
        with _lock_sessoes:
            _remover_token_interno(token)
        _remover_sessao_bd(token)
        return False

    if meta is None or _precisa_revalidar_cache_no_banco(meta, agora):
        consulta_ok, meta_bd = _carregar_sessao_bd_com_status(token)
        if consulta_ok:
            if not meta_bd:
                with _lock_sessoes:
                    _remover_token_interno(token)
                return False

            if _token_expirado(meta_bd):
                with _lock_sessoes:
                    _remover_token_interno(token)
                _remover_sessao_bd(token)
                return False

            with _lock_sessoes:
                meta = _SESSAO_META.get(token)
                if meta is None or _precisa_revalidar_cache_no_banco(meta, agora):
                    _registrar_token_interno(token, meta_bd)
                    meta = meta_bd
        elif meta is None:
            return False
        else:
            logger.warning(
                "Falha ao revalidar sessao no banco; usando cache local temporariamente | usuario_id=%s",
                meta.usuario_id,
            )

    return True


def _limpar_sessoes_expiradas() -> int:
    agora = _agora_utc()
    removidas = 0
    tokens_expirados_bd = _limpar_sessoes_expiradas_bd(agora)

    with _lock_sessoes:
        tokens_expirados = list(tokens_expirados_bd)
        tokens_expirados.extend([token for token, meta in _SESSAO_META.items() if agora > meta.expira_em])

        for token, expira_em in list(_SESSAO_EXPIRACAO.items()):
            if token not in _SESSAO_META and agora > expira_em:
                tokens_expirados.append(token)

        for token in set(tokens_expirados):
            if _remover_token_interno(token) is not None:
                removidas += 1

    if removidas:
        logger.info("Limpeza lazy: %d sessao(oes) removida(s)", removidas)

    return removidas


def contar_sessoes_ativas() -> int:
    with _lock_sessoes:
        return len(SESSOES_ATIVAS)


__all__ = [
    "MAX_SESSOES_POR_USUARIO",
    "MetaSessao",
    "SESSAO_CACHE_DB_REVALIDACAO_SEGUNDOS",
    "SESSAO_RENOVACAO_ATIVA",
    "SESSAO_VINCULAR_IP",
    "SESSAO_VINCULAR_USER_AGENT",
    "SESSOES_ATIVAS",
    "TTL_SESSAO_HORAS",
    "TTL_SESSAO_LEMBRAR_DIAS",
    "_CHANCE_LIMPEZA",
    "_SESSAO_EXPIRACAO",
    "_SESSAO_META",
    "_contexto_sessao_confere",
    "_limpar_sessoes_expiradas",
    "_lock_sessoes",
    "_normalizar_ip",
    "_renovar_sessao_se_necessario",
    "contar_sessoes_ativas",
    "criar_sessao",
    "encerrar_sessao",
    "encerrar_todas_sessoes_usuario",
    "token_esta_ativo",
]
