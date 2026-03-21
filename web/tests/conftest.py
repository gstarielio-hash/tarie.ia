from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.shared.database as banco_dados
import app.shared.security as seguranca
import app.domains.chat.routes as rotas_inspetor
import app.domains.revisor.routes as rotas_revisor
import main
from app.shared.database import Base, Empresa, LimitePlano, NivelAcesso, PlanoEmpresa, Usuario
from tests.regras_rotas_criticas_support import SENHA_HASH_PADRAO


@pytest.fixture
def ambiente_critico():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False, class_=Session)
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as banco:
        banco.add(
            LimitePlano(
                plano=PlanoEmpresa.ILIMITADO.value,
                laudos_mes=None,
                usuarios_max=None,
                upload_doc=True,
                deep_research=True,
                integracoes_max=None,
                retencao_dias=None,
            )
        )

        empresa_a = Empresa(nome_fantasia="Empresa A", cnpj="12345678000190", plano_ativo=PlanoEmpresa.ILIMITADO.value)
        empresa_b = Empresa(nome_fantasia="Empresa B", cnpj="22345678000190", plano_ativo=PlanoEmpresa.ILIMITADO.value)
        banco.add_all([empresa_a, empresa_b])
        banco.flush()

        inspetor_a = Usuario(
            empresa_id=empresa_a.id,
            nome_completo="Inspetor A",
            email="inspetor@empresa-a.test",
            senha_hash=SENHA_HASH_PADRAO,
            nivel_acesso=NivelAcesso.INSPETOR.value,
        )
        revisor_a = Usuario(
            empresa_id=empresa_a.id,
            nome_completo="Revisor A",
            email="revisor@empresa-a.test",
            senha_hash=SENHA_HASH_PADRAO,
            nivel_acesso=NivelAcesso.REVISOR.value,
        )
        admin_a = Usuario(
            empresa_id=empresa_a.id,
            nome_completo="Admin A",
            email="admin@empresa-a.test",
            senha_hash=SENHA_HASH_PADRAO,
            nivel_acesso=NivelAcesso.DIRETORIA.value,
        )
        admin_cliente_a = Usuario(
            empresa_id=empresa_a.id,
            nome_completo="Admin Cliente A",
            email="cliente@empresa-a.test",
            senha_hash=SENHA_HASH_PADRAO,
            nivel_acesso=NivelAcesso.ADMIN_CLIENTE.value,
        )
        inspetor_b = Usuario(
            empresa_id=empresa_b.id,
            nome_completo="Inspetor B",
            email="inspetor@empresa-b.test",
            senha_hash=SENHA_HASH_PADRAO,
            nivel_acesso=NivelAcesso.INSPETOR.value,
        )
        banco.add_all([inspetor_a, revisor_a, admin_a, admin_cliente_a, inspetor_b])
        banco.commit()

        ids = {
            "empresa_a": empresa_a.id,
            "empresa_b": empresa_b.id,
            "inspetor_a": inspetor_a.id,
            "revisor_a": revisor_a.id,
            "admin_a": admin_a.id,
            "admin_cliente_a": admin_cliente_a.id,
            "inspetor_b": inspetor_b.id,
        }

    def override_obter_banco():
        banco = SessionLocal()
        try:
            yield banco
            if banco_dados.sessao_tem_mutacoes_pendentes(banco):
                banco.commit()
        except Exception:
            banco.rollback()
            raise
        finally:
            banco.close()

    main.app.dependency_overrides[banco_dados.obter_banco] = override_obter_banco

    sessao_local_banco_original = banco_dados.SessaoLocal
    sessao_local_seguranca_original = seguranca.SessaoLocal
    sessao_local_inspetor_original = rotas_inspetor.SessaoLocal
    sessao_local_revisor_original = rotas_revisor.SessaoLocal
    inicializar_banco_original = main.inicializar_banco
    banco_dados.SessaoLocal = SessionLocal
    seguranca.SessaoLocal = SessionLocal
    rotas_inspetor.SessaoLocal = SessionLocal
    rotas_revisor.SessaoLocal = SessionLocal
    main.inicializar_banco = lambda: None

    try:
        with TestClient(main.app) as client:
            yield {
                "client": client,
                "SessionLocal": SessionLocal,
                "ids": ids,
            }
    finally:
        banco_dados.SessaoLocal = sessao_local_banco_original
        seguranca.SessaoLocal = sessao_local_seguranca_original
        rotas_inspetor.SessaoLocal = sessao_local_inspetor_original
        rotas_revisor.SessaoLocal = sessao_local_revisor_original
        main.inicializar_banco = inicializar_banco_original

    main.app.dependency_overrides.clear()
    seguranca.SESSOES_ATIVAS.clear()
    seguranca._SESSAO_EXPIRACAO.clear()  # noqa: SLF001
    seguranca._SESSAO_META.clear()  # noqa: SLF001
    engine.dispose()
