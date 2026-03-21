from __future__ import annotations

import base64
import io
import os
import re
import tempfile
import uuid

import pytest
from docx import Document
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.shared.database as banco_dados
import app.shared.security as seguranca
import app.domains.chat.routes as rotas_inspetor
import app.domains.revisor.routes as rotas_revisor
import main
from app.shared.database import (
    Base,
    Empresa,
    Laudo,
    LimitePlano,
    NivelAcesso,
    PlanoEmpresa,
    TemplateLaudo,
    Usuario,
)
from app.shared.security import criar_hash_senha

SENHA_PADRAO = "Senha@123"
SENHA_HASH_PADRAO = criar_hash_senha(SENHA_PADRAO)


def _extrair_csrf(html: str) -> str:
    match_meta = re.search(r'<meta\s+name="csrf-token"\s+content="([^"]+)"', html, flags=re.IGNORECASE)
    if match_meta:
        return match_meta.group(1)

    match_input = re.search(r'name="csrf_token"[^>]*\svalue="(?!\$\{)([^"]+)"', html, flags=re.IGNORECASE)
    if match_input:
        return match_input.group(1)

    match_boot = re.search(r'"csrfToken"\s*:\s*"([^"]+)"', html)
    if match_boot:
        return match_boot.group(1)

    raise AssertionError("Token CSRF nao encontrado no HTML.")


def _pdf_base_bytes_teste() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    writer.add_blank_page(width=595, height=842)
    writer.add_blank_page(width=595, height=842)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _docx_bytes_teste(texto: str = "Checklist operacional do admin-cliente.") -> bytes:
    documento = Document()
    documento.add_paragraph(texto)
    buffer = io.BytesIO()
    documento.save(buffer)
    return buffer.getvalue()


def _imagem_png_bytes_teste() -> bytes:
    return base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z2ioAAAAASUVORK5CYII=")


def _imagem_png_data_uri_teste() -> str:
    return "data:image/png;base64," + base64.b64encode(_imagem_png_bytes_teste()).decode()


def _salvar_pdf_temporario_teste(prefixo: str = "template") -> str:
    caminho = os.path.join(tempfile.gettempdir(), f"{prefixo}_{uuid.uuid4().hex[:10]}.pdf")
    with open(caminho, "wb") as arquivo:
        arquivo.write(_pdf_base_bytes_teste())
    return caminho


def _criar_laudo(
    banco: Session,
    *,
    empresa_id: int,
    usuario_id: int,
    status_revisao: str,
    tipo_template: str = "padrao",
) -> int:
    laudo = Laudo(
        empresa_id=empresa_id,
        usuario_id=usuario_id,
        setor_industrial="geral",
        tipo_template=tipo_template,
        status_revisao=status_revisao,
        codigo_hash=uuid.uuid4().hex,
        modo_resposta="detalhado",
        is_deep_research=False,
    )
    banco.add(laudo)
    banco.commit()
    banco.refresh(laudo)
    return laudo.id


def _criar_template_ativo(
    banco: Session,
    *,
    empresa_id: int,
    criado_por_id: int,
    codigo_template: str,
    versao: int,
    mapeamento: dict | None = None,
) -> int:
    template = TemplateLaudo(
        empresa_id=empresa_id,
        criado_por_id=criado_por_id,
        nome=f"Template {codigo_template} v{versao}",
        codigo_template=codigo_template,
        versao=versao,
        ativo=True,
        arquivo_pdf_base=_salvar_pdf_temporario_teste(codigo_template),
        mapeamento_campos_json=mapeamento or {},
    )
    banco.add(template)
    banco.commit()
    banco.refresh(template)
    return template.id


def _login_app_inspetor(client: TestClient, email: str) -> str:
    tela_login = client.get("/app/login")
    csrf = _extrair_csrf(tela_login.text)

    resposta = client.post(
        "/app/login",
        data={
            "email": email,
            "senha": SENHA_PADRAO,
            "csrf_token": csrf,
        },
        follow_redirects=False,
    )
    assert resposta.status_code == 303
    assert resposta.headers["location"] == "/app/"
    return _csrf_pagina(client, "/app/")


def _login_revisor(client: TestClient, email: str) -> str:
    tela_login = client.get("/revisao/login")
    csrf = _extrair_csrf(tela_login.text)

    resposta = client.post(
        "/revisao/login",
        data={
            "email": email,
            "senha": SENHA_PADRAO,
            "csrf_token": csrf,
        },
        follow_redirects=False,
    )
    assert resposta.status_code == 303
    assert resposta.headers["location"] == "/revisao/painel"
    return _csrf_pagina(client, "/revisao/painel")


def _login_admin(client: TestClient, email: str) -> str:
    tela_login = client.get("/admin/login")
    csrf = _extrair_csrf(tela_login.text)

    resposta = client.post(
        "/admin/login",
        data={
            "email": email,
            "senha": SENHA_PADRAO,
            "csrf_token": csrf,
        },
        follow_redirects=False,
    )
    assert resposta.status_code == 303
    assert resposta.headers["location"] == "/admin/painel"
    return _csrf_pagina(client, "/admin/painel")


def _login_cliente(client: TestClient, email: str) -> str:
    tela_login = client.get("/cliente/login")
    csrf = _extrair_csrf(tela_login.text)

    resposta = client.post(
        "/cliente/login",
        data={
            "email": email,
            "senha": SENHA_PADRAO,
            "csrf_token": csrf,
        },
        follow_redirects=False,
    )
    assert resposta.status_code == 303
    assert resposta.headers["location"] == "/cliente/painel"
    return _csrf_pagina(client, "/cliente/painel")


def _csrf_pagina(client: TestClient, rota: str) -> str:
    resposta = client.get(rota)
    assert resposta.status_code == 200
    return _extrair_csrf(resposta.text)


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
