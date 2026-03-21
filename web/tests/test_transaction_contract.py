from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.shared.database import Base, Empresa, sessao_tem_mutacoes_pendentes


def _session_factory() -> sessionmaker[Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False, class_=Session)


def test_sessao_sem_mutacao_nao_fica_marcada_apos_leitura() -> None:
    SessionLocal = _session_factory()

    with SessionLocal() as banco:
        banco.execute(text("SELECT 1"))
        assert sessao_tem_mutacoes_pendentes(banco) is False


def test_sessao_flushada_ainda_exige_commit_final() -> None:
    SessionLocal = _session_factory()

    with SessionLocal() as banco:
        empresa = Empresa(
            nome_fantasia="Empresa Flush",
            cnpj="12345678000199",
        )
        banco.add(empresa)

        assert sessao_tem_mutacoes_pendentes(banco) is True

        banco.flush()

        assert sessao_tem_mutacoes_pendentes(banco) is True

        banco.commit()

        assert sessao_tem_mutacoes_pendentes(banco) is False


def test_sessao_rollback_limpa_marcador_transacional() -> None:
    SessionLocal = _session_factory()

    with SessionLocal() as banco:
        banco.add(
            Empresa(
                nome_fantasia="Empresa Rollback",
                cnpj="12345678000198",
            )
        )

        assert sessao_tem_mutacoes_pendentes(banco) is True

        banco.rollback()

        assert sessao_tem_mutacoes_pendentes(banco) is False
