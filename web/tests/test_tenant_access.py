from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.shared.database import Base, Empresa, Laudo, NivelAcesso, StatusRevisao, Usuario
from app.shared.security import criar_hash_senha
from app.shared.tenant_access import (
    obter_empresa_id_usuario,
    obter_empresa_usuario,
    obter_laudo_empresa,
    obter_laudo_empresa_usuario,
)


@pytest.fixture
def sessao_teste() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    try:
        with SessionLocal() as banco:
            yield banco
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def _criar_empresa(banco: Session, *, nome: str, cnpj: str) -> Empresa:
    empresa = Empresa(
        nome_fantasia=nome,
        cnpj=cnpj,
    )
    banco.add(empresa)
    banco.commit()
    banco.refresh(empresa)
    return empresa


def _criar_usuario(
    banco: Session,
    *,
    empresa_id: int,
    email: str,
) -> Usuario:
    usuario = Usuario(
        empresa_id=empresa_id,
        nome_completo="Usuario Teste",
        email=email,
        senha_hash=criar_hash_senha("Senha@Teste123"),
        nivel_acesso=int(NivelAcesso.ADMIN_CLIENTE),
        ativo=True,
    )
    banco.add(usuario)
    banco.commit()
    banco.refresh(usuario)
    return usuario


def _criar_laudo(
    banco: Session,
    *,
    empresa_id: int,
    usuario_id: int,
) -> Laudo:
    laudo = Laudo(
        empresa_id=empresa_id,
        usuario_id=usuario_id,
        setor_industrial="geral",
        tipo_template="padrao",
        status_revisao=StatusRevisao.RASCUNHO.value,
        codigo_hash=uuid.uuid4().hex,
        modo_resposta="detalhado",
        is_deep_research=False,
    )
    banco.add(laudo)
    banco.commit()
    banco.refresh(laudo)
    return laudo


def test_obter_empresa_id_usuario_rejeita_usuario_sem_empresa() -> None:
    usuario = Usuario(
        empresa_id=0,
        nome_completo="Sem Empresa",
        email="sem-empresa@test.local",
        senha_hash=criar_hash_senha("Senha@Teste123"),
        nivel_acesso=int(NivelAcesso.ADMIN_CLIENTE),
        ativo=True,
    )

    with pytest.raises(HTTPException) as exc_info:
        obter_empresa_id_usuario(usuario)

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Usuário sem empresa vinculada."


def test_obter_empresa_usuario_carrega_empresa_vinculada(sessao_teste: Session) -> None:
    empresa = _criar_empresa(sessao_teste, nome="Empresa Tenant", cnpj="12.345.678/0001-90")
    usuario = _criar_usuario(sessao_teste, empresa_id=int(empresa.id), email="cliente@tenant.test")

    empresa_carregada = obter_empresa_usuario(sessao_teste, usuario)

    assert int(empresa_carregada.id) == int(empresa.id)
    assert empresa_carregada.nome_fantasia == "Empresa Tenant"


def test_obter_laudo_empresa_usuario_bloqueia_acesso_cruzado(sessao_teste: Session) -> None:
    empresa_a = _criar_empresa(sessao_teste, nome="Empresa A", cnpj="12.345.678/0001-91")
    empresa_b = _criar_empresa(sessao_teste, nome="Empresa B", cnpj="12.345.678/0001-92")
    usuario_a = _criar_usuario(sessao_teste, empresa_id=int(empresa_a.id), email="cliente@empresa-a.test")
    usuario_b = _criar_usuario(sessao_teste, empresa_id=int(empresa_b.id), email="cliente@empresa-b.test")
    laudo_a = _criar_laudo(
        sessao_teste,
        empresa_id=int(empresa_a.id),
        usuario_id=int(usuario_a.id),
    )

    laudo_carregado = obter_laudo_empresa_usuario(sessao_teste, int(laudo_a.id), usuario_a)
    assert int(laudo_carregado.id) == int(laudo_a.id)

    with pytest.raises(HTTPException) as exc_info:
        obter_laudo_empresa_usuario(sessao_teste, int(laudo_a.id), usuario_b)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Laudo não encontrado."


def test_obter_laudo_empresa_retorna_404_para_empresa_errada(sessao_teste: Session) -> None:
    empresa = _criar_empresa(sessao_teste, nome="Empresa C", cnpj="12.345.678/0001-93")
    usuario = _criar_usuario(sessao_teste, empresa_id=int(empresa.id), email="cliente@empresa-c.test")
    laudo = _criar_laudo(
        sessao_teste,
        empresa_id=int(empresa.id),
        usuario_id=int(usuario.id),
    )

    with pytest.raises(HTTPException) as exc_info:
        obter_laudo_empresa(sessao_teste, int(laudo.id), int(empresa.id) + 1000)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Laudo não encontrado."
