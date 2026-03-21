# ==========================================
# TARIEL CONTROL TOWER — BANCO_DADOS.PY
# Responsabilidade:
# - engine SQLAlchemy
# - session factory
# - agregacao dos models centrais do ecossistema
# - contrato transacional da Session
# - seeds e migracao versionada via Alembic
# ==========================================

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Generator

from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import ORMExecuteState, Session

from app.core.settings import env_bool, get_settings
from app.shared.db.contracts import (
    LIMITES_PADRAO,
    LimitePlanoFallback,
    ModoResposta,
    NivelAcesso,
    PlanoEmpresa,
    StatusAprendizadoIa,
    StatusLaudo,
    StatusRevisao,
    TipoMensagem,
    VereditoAprendizadoIa,
)
from app.shared.db.models_auth import (
    AprendizadoVisualIa,
    Empresa,
    LimitePlano,
    PreferenciaMobileUsuario,
    RegistroAuditoriaEmpresa,
    SessaoAtiva,
    Usuario,
)
from app.shared.db.models_base import Base, MixinAuditoria, agora_utc
from app.shared.db.models_laudo import (
    AnexoMesa,
    CitacaoLaudo,
    Laudo,
    LaudoRevisao,
    MensagemLaudo,
    TemplateLaudo,
)
from app.shared.db.runtime import (
    SessaoLocal,
    URL_BANCO as URL_BANCO_RUNTIME,
    _normalizar_url_banco as _normalizar_url_banco_runtime,
    motor_banco as motor_banco_runtime,
)

logger = logging.getLogger("tariel.banco_dados")
_INFO_CHAVE_MUTACOES_PENDENTES = "tariel_mutacoes_pendentes"


# =========================================================
# CONFIGURACAO DE AMBIENTE / ENGINE
# =========================================================

_DIR_PROJETO = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _DIR_PROJETO / "alembic.ini"
_ALEMBIC_DIR = _DIR_PROJETO / "alembic"

_settings = get_settings()
_SEED_DEV_BOOTSTRAP = env_bool("SEED_DEV_BOOTSTRAP", False)
_EM_PRODUCAO = _settings.em_producao


def _normalizar_url_banco(valor: str) -> str:
    return _normalizar_url_banco_runtime(valor)


URL_BANCO = URL_BANCO_RUNTIME
motor_banco = motor_banco_runtime


# =========================================================
# CONTRATO TRANSACIONAL DA SESSION
# =========================================================


@event.listens_for(Session, "before_flush")
def _marcar_sessao_com_mutacoes(_session: Session, _flush_context: Any, _instances: Any) -> None:
    _session.info[_INFO_CHAVE_MUTACOES_PENDENTES] = True


@event.listens_for(Session, "do_orm_execute")
def _marcar_sessao_em_bulk_orm(orm_execute_state: ORMExecuteState) -> None:
    if orm_execute_state.is_insert or orm_execute_state.is_update or orm_execute_state.is_delete:
        orm_execute_state.session.info[_INFO_CHAVE_MUTACOES_PENDENTES] = True


@event.listens_for(Session, "after_bulk_update")
def _marcar_sessao_apos_bulk_update(update_context: Any) -> None:
    update_context.session.info[_INFO_CHAVE_MUTACOES_PENDENTES] = True


@event.listens_for(Session, "after_bulk_delete")
def _marcar_sessao_apos_bulk_delete(delete_context: Any) -> None:
    delete_context.session.info[_INFO_CHAVE_MUTACOES_PENDENTES] = True


@event.listens_for(Session, "after_commit")
def _limpar_marcador_mutacoes_apos_commit(session: Session) -> None:
    session.info.pop(_INFO_CHAVE_MUTACOES_PENDENTES, None)


@event.listens_for(Session, "after_rollback")
def _limpar_marcador_mutacoes_apos_rollback(session: Session) -> None:
    session.info.pop(_INFO_CHAVE_MUTACOES_PENDENTES, None)


def sessao_tem_mutacoes_pendentes(banco: Session) -> bool:
    if bool(banco.new or banco.dirty or banco.deleted):
        return True
    return bool(banco.info.get(_INFO_CHAVE_MUTACOES_PENDENTES))


# =========================================================
# DEPENDENCY FASTAPI
# =========================================================


def obter_banco() -> Generator[Session, None, None]:
    banco: Session = SessaoLocal()
    try:
        yield banco
        if sessao_tem_mutacoes_pendentes(banco):
            banco.commit()
    except HTTPException:
        banco.rollback()
        raise
    except Exception:
        banco.rollback()
        logger.error("Erro na sessao do banco. Rollback executado.", exc_info=True)
        raise
    finally:
        banco.close()


def commit_ou_rollback_operacional(
    banco: Session,
    *,
    logger_operacao: logging.Logger,
    mensagem_erro: str,
) -> None:
    try:
        banco.commit()
    except Exception:
        banco.rollback()
        logger_operacao.error(mensagem_erro, exc_info=True)
        raise


def commit_ou_rollback_integridade(
    banco: Session,
    *,
    logger_operacao: logging.Logger,
    mensagem_erro: str,
) -> None:
    try:
        banco.commit()
    except IntegrityError as erro:
        banco.rollback()
        logger_operacao.warning("%s | integrity_error=%s", mensagem_erro, erro)
        raise ValueError(mensagem_erro) from erro


def flush_ou_rollback_integridade(
    banco: Session,
    *,
    logger_operacao: logging.Logger,
    mensagem_erro: str,
) -> None:
    try:
        banco.flush()
    except IntegrityError as erro:
        banco.rollback()
        logger_operacao.warning("%s | integrity_error=%s", mensagem_erro, erro)
        raise ValueError(mensagem_erro) from erro


# =========================================================
# INICIALIZACAO / SEED / MIGRACAO
# =========================================================


def _aplicar_migracoes_versionadas() -> None:
    from app.shared.db.bootstrap import _aplicar_migracoes_versionadas as _aplicar_migracoes_versionadas_impl

    _aplicar_migracoes_versionadas_impl()


def inicializar_banco() -> None:
    from app.shared.db.bootstrap import inicializar_banco as inicializar_banco_impl

    inicializar_banco_impl()


def _seed_dev() -> None:
    from app.shared.db.bootstrap import _seed_dev as _seed_dev_impl

    _seed_dev_impl()


def _bootstrap_admin_inicial_producao() -> None:
    from app.shared.db.bootstrap import _bootstrap_admin_inicial_producao as _bootstrap_admin_inicial_producao_impl

    _bootstrap_admin_inicial_producao_impl()


def seed_limites_plano() -> None:
    from app.shared.db.bootstrap import seed_limites_plano as seed_limites_plano_impl

    seed_limites_plano_impl()


__all__ = [
    "AnexoMesa",
    "AprendizadoVisualIa",
    "Base",
    "CitacaoLaudo",
    "Empresa",
    "LIMITES_PADRAO",
    "Laudo",
    "LaudoRevisao",
    "LimitePlano",
    "LimitePlanoFallback",
    "MensagemLaudo",
    "MixinAuditoria",
    "ModoResposta",
    "NivelAcesso",
    "PlanoEmpresa",
    "PreferenciaMobileUsuario",
    "RegistroAuditoriaEmpresa",
    "SessaoAtiva",
    "SessaoLocal",
    "StatusAprendizadoIa",
    "StatusLaudo",
    "StatusRevisao",
    "TemplateLaudo",
    "TipoMensagem",
    "URL_BANCO",
    "Usuario",
    "VereditoAprendizadoIa",
    "_ALEMBIC_DIR",
    "_ALEMBIC_INI",
    "_EM_PRODUCAO",
    "_SEED_DEV_BOOTSTRAP",
    "_aplicar_migracoes_versionadas",
    "_bootstrap_admin_inicial_producao",
    "_normalizar_url_banco",
    "_seed_dev",
    "agora_utc",
    "commit_ou_rollback_integridade",
    "commit_ou_rollback_operacional",
    "flush_ou_rollback_integridade",
    "inicializar_banco",
    "motor_banco",
    "obter_banco",
    "seed_limites_plano",
    "sessao_tem_mutacoes_pendentes",
]
