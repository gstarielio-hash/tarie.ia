from __future__ import annotations

import io
import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from sqlalchemy import select
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.websockets import WebSocketDisconnect

import app.shared.database as banco_dados
import app.shared.security as seguranca
import main
import app.domains.admin.routes as rotas_admin
import app.domains.chat.routes as rotas_inspetor
import app.domains.revisor.routes as rotas_revisor
from app.shared.database import (
    Base,
    Empresa,
    Laudo,
    LaudoRevisao,
    LimitePlano,
    MensagemLaudo,
    NivelAcesso,
    PlanoEmpresa,
    SessaoAtiva,
    StatusRevisao,
    TemplateLaudo,
    TipoMensagem,
    Usuario,
)
from app.shared.security import criar_hash_senha, verificar_senha

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
    writer.add_blank_page(width=595, height=842)  # A4 aproximado em pontos
    writer.add_blank_page(width=595, height=842)
    writer.add_blank_page(width=595, height=842)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


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
) -> int:
    laudo = Laudo(
        empresa_id=empresa_id,
        usuario_id=usuario_id,
        setor_industrial="geral",
        tipo_template="padrao",
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
        inspetor_b = Usuario(
            empresa_id=empresa_b.id,
            nome_completo="Inspetor B",
            email="inspetor@empresa-b.test",
            senha_hash=SENHA_HASH_PADRAO,
            nivel_acesso=NivelAcesso.INSPETOR.value,
        )
        banco.add_all([inspetor_a, revisor_a, admin_a, inspetor_b])
        banco.commit()

        ids = {
            "empresa_a": empresa_a.id,
            "empresa_b": empresa_b.id,
            "inspetor_a": inspetor_a.id,
            "revisor_a": revisor_a.id,
            "admin_a": admin_a.id,
            "inspetor_b": inspetor_b.id,
        }

    def override_obter_banco():
        banco = SessionLocal()
        try:
            yield banco
        finally:
            banco.close()

    main.app.dependency_overrides[banco_dados.obter_banco] = override_obter_banco

    sessao_local_banco_original = banco_dados.SessaoLocal
    sessao_local_seguranca_original = seguranca.SessaoLocal
    sessao_local_inspetor_original = rotas_inspetor.SessaoLocal
    sessao_local_revisor_original = rotas_revisor.SessaoLocal
    banco_dados.SessaoLocal = SessionLocal
    seguranca.SessaoLocal = SessionLocal
    rotas_inspetor.SessaoLocal = SessionLocal
    rotas_revisor.SessaoLocal = SessionLocal

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

    main.app.dependency_overrides.clear()
    seguranca.SESSOES_ATIVAS.clear()
    seguranca._SESSAO_EXPIRACAO.clear()  # noqa: SLF001
    seguranca._SESSAO_META.clear()  # noqa: SLF001
    engine.dispose()


def test_admin_login_exige_csrf_valido(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    resposta = client.post(
        "/admin/login",
        data={
            "email": "admin@empresa-a.test",
            "senha": SENHA_PADRAO,
            "csrf_token": "csrf-invalido",
        },
    )

    assert resposta.status_code == 400
    assert "Requisição inválida." in resposta.text


def test_sessao_admin_nao_vaza_para_portal_app(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_admin(client, "admin@empresa-a.test")

    resposta_app = client.get("/app/", follow_redirects=False)
    assert resposta_app.status_code == 303
    assert resposta_app.headers["location"] == "/app/login"

    tela_login_app = client.get("/app/login")
    assert tela_login_app.status_code == 200
    assert 'name="csrf_token"' in tela_login_app.text


def test_sessao_revisor_nao_vaza_para_portal_app(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_revisor(client, "revisor@empresa-a.test")

    resposta_app = client.get("/app/", follow_redirects=False)
    assert resposta_app.status_code == 303
    assert resposta_app.headers["location"] == "/app/login"


def test_sessao_inspetor_nao_vaza_para_portal_revisao(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta_revisao = client.get("/revisao/painel", follow_redirects=False)
    assert resposta_revisao.status_code in (303, 401)
    if resposta_revisao.status_code == 303:
        assert resposta_revisao.headers["location"] == "/revisao/login"


def test_sessao_inspetor_nao_vaza_para_portal_admin(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta_admin = client.get("/admin/painel", follow_redirects=False)
    assert resposta_admin.status_code == 303
    assert resposta_admin.headers["location"] == "/admin/login"


def test_sessao_revisor_nao_vaza_para_portal_admin(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_revisor(client, "revisor@empresa-a.test")

    resposta_admin = client.get("/admin/painel", follow_redirects=False)
    assert resposta_admin.status_code == 303
    assert resposta_admin.headers["location"] == "/admin/login"


def test_404_em_rotas_api_app_retorna_json_sem_redirect(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.get("/app/api/rota-que-nao-existe", follow_redirects=False)

    assert resposta.status_code == 404
    assert "application/json" in (resposta.headers.get("content-type", "").lower())
    assert resposta.json()["detail"] == "Recurso não encontrado."


def test_404_em_rotas_api_revisao_retorna_json_sem_redirect(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    _login_revisor(client, "revisor@empresa-a.test")

    resposta = client.get("/revisao/api/rota-que-nao-existe", follow_redirects=False)

    assert resposta.status_code == 404
    assert "application/json" in (resposta.headers.get("content-type", "").lower())
    assert resposta.json()["detail"] == "Recurso não encontrado."


def test_revisor_login_funciona_e_painel_abre(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_revisor(client, "revisor@empresa-a.test")
    painel = client.get("/revisao/painel")

    assert painel.status_code == 200


def test_revisor_tela_templates_laudo_abre(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    _login_revisor(client, "revisor@empresa-a.test")

    resposta = client.get("/revisao/templates-laudo")

    assert resposta.status_code == 200
    assert "Biblioteca de Templates" in resposta.text
    assert "Mapeador Visual" in resposta.text
    assert "Snap inteligente" in resposta.text
    assert "Modo do snap" in resposta.text
    assert "Atualizar selecionado" in resposta.text
    assert 'name="csrf-token"' in resposta.text


def test_revisor_upload_template_laudo_e_lista(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    mapeamento = {
        "pages": [
            {
                "page": 1,
                "fields": [
                    {
                        "key": "informacoes_gerais.responsavel_pela_inspecao",
                        "x": 12,
                        "y": 95,
                        "w": 90,
                        "h": 4.5,
                        "font_size": 8,
                    }
                ],
            }
        ]
    }

    resposta_upload = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Checklist CBMGO Padrão",
            "codigo_template": "cbmgo_cmar",
            "versao": "1",
            "mapeamento_campos_json": json.dumps(mapeamento),
        },
        files={
            "arquivo_base": ("cbmgo_base.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )

    assert resposta_upload.status_code == 201
    corpo_upload = resposta_upload.json()
    template_id = int(corpo_upload["id"])
    assert corpo_upload["codigo_template"] == "cbmgo_cmar"
    assert corpo_upload["versao"] == 1

    resposta_lista = client.get("/revisao/api/templates-laudo")
    assert resposta_lista.status_code == 200
    corpo_lista = resposta_lista.json()
    assert any(int(item["id"]) == template_id for item in corpo_lista["itens"])

    with SessionLocal() as banco:
        template = banco.get(TemplateLaudo, template_id)
        assert template is not None
        assert template.nome == "Checklist CBMGO Padrão"
        assert template.codigo_template == "cbmgo_cmar"
        assert template.arquivo_pdf_base.lower().endswith(".pdf")


def test_revisor_arquivo_base_template_laudo_retorna_pdf(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_upload = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Template para baixar base",
            "codigo_template": "cbmgo_cmar",
            "versao": "4",
        },
        files={
            "arquivo_base": ("cbmgo_base.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )
    assert resposta_upload.status_code == 201
    template_id = int(resposta_upload.json()["id"])

    resposta_pdf_base = client.get(f"/revisao/api/templates-laudo/{template_id}/arquivo-base")

    assert resposta_pdf_base.status_code == 200
    assert "application/pdf" in (resposta_pdf_base.headers.get("content-type", "").lower())
    assert resposta_pdf_base.content.startswith(b"%PDF")


def test_revisor_preview_template_laudo_retorna_pdf(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_upload = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Checklist CBMGO Preview",
            "codigo_template": "cbmgo_cmar",
            "versao": "2",
        },
        files={
            "arquivo_base": ("cbmgo_base.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )
    assert resposta_upload.status_code == 201
    template_id = int(resposta_upload.json()["id"])

    payload_preview = {
        "dados_formulario": {
            "informacoes_gerais": {
                "responsavel_pela_inspecao": "Gabriel Santos",
                "data_inspecao": "09/03/2026",
                "local_inspecao": "Planta Norte",
            },
            "trrf_observacoes": "TRRF preliminar alinhado ao memorial.",
            "resumo_executivo": "Prévia de teste para validação da mesa.",
        }
    }

    resposta_preview = client.post(
        f"/revisao/api/templates-laudo/{template_id}/preview",
        headers={"X-CSRF-Token": csrf},
        json=payload_preview,
    )

    assert resposta_preview.status_code == 200
    assert "application/pdf" in (resposta_preview.headers.get("content-type", "").lower())
    assert resposta_preview.content.startswith(b"%PDF")

    with SessionLocal() as banco:
        template = banco.get(TemplateLaudo, template_id)
        assert template is not None
        assert template.mapeamento_campos_json is not None


def test_revisor_publicar_template_desativa_ativo_anterior(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_v1 = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Template CBMGO v1",
            "codigo_template": "cbmgo_cmar",
            "versao": "10",
            "ativo": "true",
        },
        files={
            "arquivo_base": ("cbmgo_v1.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )
    assert resposta_v1.status_code == 201
    id_v1 = int(resposta_v1.json()["id"])

    resposta_v2 = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Template CBMGO v2",
            "codigo_template": "cbmgo_cmar",
            "versao": "11",
        },
        files={
            "arquivo_base": ("cbmgo_v2.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )
    assert resposta_v2.status_code == 201
    id_v2 = int(resposta_v2.json()["id"])

    resposta_publicar = client.post(
        f"/revisao/api/templates-laudo/{id_v2}/publicar",
        headers={"X-CSRF-Token": csrf},
        data={"csrf_token": csrf},
    )
    assert resposta_publicar.status_code == 200
    assert resposta_publicar.json().get("status") == "publicado"

    with SessionLocal() as banco:
        template_v1 = banco.get(TemplateLaudo, id_v1)
        template_v2 = banco.get(TemplateLaudo, id_v2)
        assert template_v1 is not None
        assert template_v2 is not None
        assert template_v1.ativo is False
        assert template_v2.ativo is True


def test_api_gerar_pdf_usa_template_ativo_da_empresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.tipo_template = "cbmgo"
        laudo.dados_formulario = {
            "informacoes_gerais": {
                "responsavel_pela_inspecao": "Gabriel Santos",
                "data_inspecao": "09/03/2026",
            }
        }
        banco.commit()

        _criar_template_ativo(
            banco,
            empresa_id=ids["empresa_a"],
            criado_por_id=ids["revisor_a"],
            codigo_template="cbmgo_cmar",
            versao=1,
            mapeamento={},
        )

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Diagnóstico teste para exportação por template ativo.",
            "inspetor": "Inspetor A",
            "empresa": "Empresa A",
            "setor": "geral",
            "data": "09/03/2026",
            "laudo_id": laudo_id,
            "tipo_template": "cbmgo",
        },
    )

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")
    assert "cbmgo_cmar_v1" in str(resposta.headers.get("content-disposition", "")).lower()


def test_api_gerar_pdf_fallback_legacy_quando_nao_ha_template_ativo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Diagnóstico sem template ativo.",
            "inspetor": "Inspetor A",
            "empresa": "Empresa A",
            "setor": "geral",
            "data": "09/03/2026",
        },
    )

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")
    assert "laudo_art_wf.pdf" in str(resposta.headers.get("content-disposition", "")).lower()


def test_api_gerar_pdf_fallback_legacy_quando_template_ativo_invalido(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.tipo_template = "cbmgo"
        laudo.dados_formulario = {
            "informacoes_gerais": {
                "responsavel_pela_inspecao": "Inspetor A",
            }
        }

        caminho_invalido = os.path.join(tempfile.gettempdir(), f"nao_existe_{uuid.uuid4().hex}.pdf")
        banco.add(
            TemplateLaudo(
                empresa_id=ids["empresa_a"],
                criado_por_id=ids["revisor_a"],
                nome="Template invalido",
                codigo_template="cbmgo_cmar",
                versao=1,
                ativo=True,
                arquivo_pdf_base=caminho_invalido,
                mapeamento_campos_json={},
            )
        )
        banco.commit()

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Diagnostico com template invalido deve usar fallback.",
            "inspetor": "Inspetor A",
            "empresa": "Empresa A",
            "setor": "geral",
            "data": "09/03/2026",
            "laudo_id": laudo_id,
            "tipo_template": "cbmgo",
        },
    )

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")
    assert "laudo_art_wf.pdf" in str(resposta.headers.get("content-disposition", "")).lower()


def test_api_gerar_pdf_ignora_template_ativo_de_outra_empresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.tipo_template = "cbmgo"
        laudo.dados_formulario = {
            "informacoes_gerais": {
                "responsavel_pela_inspecao": "Inspetor A",
            }
        }

        _criar_template_ativo(
            banco,
            empresa_id=ids["empresa_b"],
            criado_por_id=ids["revisor_a"],
            codigo_template="cbmgo_cmar",
            versao=1,
            mapeamento={},
        )
        banco.commit()

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Template de outra empresa nao pode ser aplicado.",
            "inspetor": "Inspetor A",
            "empresa": "Empresa A",
            "setor": "geral",
            "data": "09/03/2026",
            "laudo_id": laudo_id,
            "tipo_template": "cbmgo",
        },
    )

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")
    assert "laudo_art_wf.pdf" in str(resposta.headers.get("content-disposition", "")).lower()


def test_home_app_nao_desloga_inspetor(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_app_inspetor(client, "inspetor@empresa-a.test")

    home = client.get("/app/", follow_redirects=False)
    assert home.status_code == 200

    status_relatorio = client.get("/app/api/laudo/status", follow_redirects=False)
    assert status_relatorio.status_code == 200


def test_home_desativa_contexto_sem_excluir_laudo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]

    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    iniciar = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "padrao"},
        headers={"X-CSRF-Token": csrf},
    )
    assert iniciar.status_code == 200
    corpo_inicio = iniciar.json()
    laudo_id = int(corpo_inicio["laudo_id"])

    desativar = client.post(
        "/app/api/laudo/desativar",
        headers={"X-CSRF-Token": csrf},
    )
    assert desativar.status_code == 200
    corpo_desativar = desativar.json()
    assert corpo_desativar["success"] is True
    assert int(corpo_desativar["laudo_id"]) == laudo_id
    assert corpo_desativar["laudo_preservado"] is True

    status_relatorio = client.get("/app/api/laudo/status")
    assert status_relatorio.status_code == 200
    corpo_status = status_relatorio.json()
    assert corpo_status["estado"] == "sem_relatorio"
    assert corpo_status["laudo_id"] is None

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.RASCUNHO.value


def test_revisor_painel_exibe_laudos_em_andamento_rascunho(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        hash_curto = laudo.codigo_hash[-6:]

    painel = client.get("/revisao/painel")

    assert painel.status_code == 200
    assert "Em Andamento em Campo (1)" in painel.text
    assert f"#{hash_curto}" in painel.text


def test_revisor_painel_precarrega_whisper_em_laudo_rascunho(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["inspetor_a"],
                tipo=TipoMensagem.HUMANO_INSP.value,
                conteudo="Validar item de risco no campo",
                lida=False,
            )
        )
        banco.commit()

    painel = client.get("/revisao/painel")

    assert painel.status_code == 200
    assert "Whispers (Chamados)" in painel.text
    assert "Validar item de risco no campo" in painel.text


def test_revisor_painel_filtro_por_inspetor_restringe_laudos(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        inspetor_extra = Usuario(
            empresa_id=ids["empresa_a"],
            nome_completo="Inspetor Extra",
            email="inspetor-extra@empresa-a.test",
            senha_hash=SENHA_HASH_PADRAO,
            nivel_acesso=NivelAcesso.INSPETOR.value,
        )
        banco.add(inspetor_extra)
        banco.commit()
        banco.refresh(inspetor_extra)

        laudo_a_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_extra_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=inspetor_extra.id,
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        laudo_a = banco.get(Laudo, laudo_a_id)
        laudo_extra = banco.get(Laudo, laudo_extra_id)
        assert laudo_a is not None
        assert laudo_extra is not None
        hash_a = laudo_a.codigo_hash[-6:]
        hash_extra = laudo_extra.codigo_hash[-6:]

    painel_filtrado = client.get(f"/revisao/painel?inspetor={ids['inspetor_a']}")

    assert painel_filtrado.status_code == 200
    assert f"#{hash_a}" in painel_filtrado.text
    assert f"#{hash_extra}" not in painel_filtrado.text


def test_revisor_painel_filtro_busca_por_hash_e_texto(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_eletrico_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_caldeira_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        laudo_eletrico = banco.get(Laudo, laudo_eletrico_id)
        laudo_caldeira = banco.get(Laudo, laudo_caldeira_id)
        assert laudo_eletrico is not None
        assert laudo_caldeira is not None

        laudo_eletrico.primeira_mensagem = "Painel eletrico com nao conformidade de isolamento"
        laudo_caldeira.primeira_mensagem = "Caldeira com ponto de corrosao na linha principal"
        banco.commit()

        hash_eletrico = laudo_eletrico.codigo_hash[-6:]
        hash_caldeira = laudo_caldeira.codigo_hash[-6:]

    painel_hash = client.get(f"/revisao/painel?q={hash_eletrico}")
    assert painel_hash.status_code == 200
    assert f"#{hash_eletrico}" in painel_hash.text
    assert f"#{hash_caldeira}" not in painel_hash.text

    painel_texto = client.get("/revisao/painel?q=corrosao")
    assert painel_texto.status_code == 200
    assert "Caldeira com ponto de corrosao" in painel_texto.text
    assert "Painel eletrico com nao conformidade" not in painel_texto.text


def test_revisor_painel_em_andamento_prioriza_por_sla(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_ok_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_atencao_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_critico_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        laudo_ok = banco.get(Laudo, laudo_ok_id)
        laudo_atencao = banco.get(Laudo, laudo_atencao_id)
        laudo_critico = banco.get(Laudo, laudo_critico_id)
        assert laudo_ok is not None
        assert laudo_atencao is not None
        assert laudo_critico is not None

        laudo_ok.criado_em = datetime.now(timezone.utc) - timedelta(hours=3)
        laudo_atencao.criado_em = datetime.now(timezone.utc) - timedelta(hours=28)
        laudo_critico.criado_em = datetime.now(timezone.utc) - timedelta(hours=55)
        laudo_ok.primeira_mensagem = "TOKEN_SLA_OK"
        laudo_atencao.primeira_mensagem = "TOKEN_SLA_ATENCAO"
        laudo_critico.primeira_mensagem = "TOKEN_SLA_CRITICO"
        banco.commit()

    painel = client.get("/revisao/painel")

    assert painel.status_code == 200
    idx_critico = painel.text.find("TOKEN_SLA_CRITICO")
    idx_atencao = painel.text.find("TOKEN_SLA_ATENCAO")
    idx_ok = painel.text.find("TOKEN_SLA_OK")
    assert idx_critico != -1
    assert idx_atencao != -1
    assert idx_ok != -1
    assert idx_critico < idx_atencao < idx_ok


def test_revisor_painel_em_andamento_exibe_chip_sla_critico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.criado_em = datetime.now(timezone.utc) - timedelta(hours=50, minutes=3)
        banco.commit()

    painel = client.get("/revisao/painel")

    assert painel.status_code == 200
    assert "sla-critico" in painel.text
    assert "Em campo h" in painel.text


def test_inspetor_com_senha_temporaria_e_obrigado_a_trocar_no_primeiro_login(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    nova_senha = "InspetorNova@123"

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "inspetor@empresa-a.test"))
        assert usuario is not None
        usuario.senha_temporaria_ativa = True
        banco.commit()

    tela_login = client.get("/app/login")
    csrf_login = _extrair_csrf(tela_login.text)
    resposta_login = client.post(
        "/app/login",
        data={
            "email": "inspetor@empresa-a.test",
            "senha": SENHA_PADRAO,
            "csrf_token": csrf_login,
        },
        follow_redirects=False,
    )
    assert resposta_login.status_code == 303
    assert resposta_login.headers["location"] == "/app/trocar-senha"

    tela_troca = client.get("/app/trocar-senha")
    assert tela_troca.status_code == 200
    csrf_troca = _extrair_csrf(tela_troca.text)

    resposta_troca = client.post(
        "/app/trocar-senha",
        data={
            "senha_atual": SENHA_PADRAO,
            "nova_senha": nova_senha,
            "confirmar_senha": nova_senha,
            "csrf_token": csrf_troca,
        },
        follow_redirects=False,
    )
    assert resposta_troca.status_code == 303
    assert resposta_troca.headers["location"] == "/app/"

    acesso = client.get("/app/", follow_redirects=False)
    assert acesso.status_code == 200

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "inspetor@empresa-a.test"))
        assert usuario is not None
        assert usuario.senha_temporaria_ativa is False
        assert verificar_senha(nova_senha, usuario.senha_hash)


def test_revisor_com_senha_temporaria_e_obrigado_a_trocar_no_primeiro_login(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    nova_senha = "RevisorNova@123"

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "revisor@empresa-a.test"))
        assert usuario is not None
        usuario.senha_temporaria_ativa = True
        banco.commit()

    tela_login = client.get("/revisao/login")
    csrf_login = _extrair_csrf(tela_login.text)
    resposta_login = client.post(
        "/revisao/login",
        data={
            "email": "revisor@empresa-a.test",
            "senha": SENHA_PADRAO,
            "csrf_token": csrf_login,
        },
        follow_redirects=False,
    )
    assert resposta_login.status_code == 303
    assert resposta_login.headers["location"] == "/revisao/trocar-senha"

    tela_troca = client.get("/revisao/trocar-senha")
    assert tela_troca.status_code == 200
    csrf_troca = _extrair_csrf(tela_troca.text)

    resposta_troca = client.post(
        "/revisao/trocar-senha",
        data={
            "senha_atual": SENHA_PADRAO,
            "nova_senha": nova_senha,
            "confirmar_senha": nova_senha,
            "csrf_token": csrf_troca,
        },
        follow_redirects=False,
    )
    assert resposta_troca.status_code == 303
    assert resposta_troca.headers["location"] == "/revisao/painel"

    painel = client.get("/revisao/painel", follow_redirects=False)
    assert painel.status_code == 200

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "revisor@empresa-a.test"))
        assert usuario is not None
        assert usuario.senha_temporaria_ativa is False
        assert verificar_senha(nova_senha, usuario.senha_hash)


def test_admin_com_senha_temporaria_e_obrigado_a_trocar_no_primeiro_login(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    nova_senha = "AdminNova@123"

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "admin@empresa-a.test"))
        assert usuario is not None
        usuario.senha_temporaria_ativa = True
        banco.commit()

    tela_login = client.get("/admin/login")
    csrf_login = _extrair_csrf(tela_login.text)
    resposta_login = client.post(
        "/admin/login",
        data={
            "email": "admin@empresa-a.test",
            "senha": SENHA_PADRAO,
            "csrf_token": csrf_login,
        },
        follow_redirects=False,
    )
    assert resposta_login.status_code == 303
    assert resposta_login.headers["location"] == "/admin/trocar-senha"

    tela_troca = client.get("/admin/trocar-senha")
    assert tela_troca.status_code == 200
    csrf_troca = _extrair_csrf(tela_troca.text)

    resposta_troca = client.post(
        "/admin/trocar-senha",
        data={
            "senha_atual": SENHA_PADRAO,
            "nova_senha": nova_senha,
            "confirmar_senha": nova_senha,
            "csrf_token": csrf_troca,
        },
        follow_redirects=False,
    )
    assert resposta_troca.status_code == 303
    assert resposta_troca.headers["location"] == "/admin/painel"

    painel = client.get("/admin/painel", follow_redirects=False)
    assert painel.status_code == 200

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "admin@empresa-a.test"))
        assert usuario is not None
        assert usuario.senha_temporaria_ativa is False
        assert verificar_senha(nova_senha, usuario.senha_hash)


def test_admin_metricas_grafico_retorna_json(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_admin(client, "admin@empresa-a.test")
    resposta = client.get("/admin/api/metricas-grafico")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert isinstance(corpo.get("labels"), list)
    assert isinstance(corpo.get("valores"), list)
    assert len(corpo["labels"]) == len(corpo["valores"])


def test_iniciar_relatorio_rejeita_tipo_template_desconhecido(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "template_inexistente"},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Tipo de relatório inválido."

    with SessionLocal() as banco:
        assert banco.query(Laudo).count() == 0


def test_inspetor_nao_pode_finalizar_laudo_nao_rascunho(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/finalizar",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Laudo já foi enviado ou finalizado."


def test_inspetor_gate_qualidade_endpoint_reprova_sem_evidencias(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.get(
        f"/app/api/laudo/{laudo_id}/gate-qualidade",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["codigo"] == "GATE_QUALIDADE_REPROVADO"
    assert corpo["aprovado"] is False
    assert corpo["tipo_template"] == "padrao"
    assert isinstance(corpo["faltantes"], list)
    assert len(corpo["faltantes"]) >= 1


def test_inspetor_finalizacao_bloqueada_por_gate_qualidade(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/finalizar",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 422
    corpo = resposta.json()
    detalhe = corpo.get("detail", {})
    assert detalhe["codigo"] == "GATE_QUALIDADE_REPROVADO"
    assert detalhe["aprovado"] is False
    assert isinstance(detalhe["itens"], list)
    assert isinstance(detalhe["faltantes"], list)
    assert len(detalhe["faltantes"]) >= 1

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.RASCUNHO.value


def test_inspetor_finalizacao_aprovada_com_evidencias_minimas(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Inspeção inicial em painel elétrico da área de prensas."

        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="Verifiquei risco de aquecimento em conexões do quadro principal.",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="[imagem]",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    tipo=TipoMensagem.IA.value,
                    conteudo="Parecer preliminar: existe não conformidade e recomenda-se isolamento imediato.",
                ),
            ]
        )
        banco.commit()

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/finalizar",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["success"] is True

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.AGUARDANDO.value


def test_api_chat_comando_finalizar_retorna_payload_gate_quando_reprovado(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "COMANDO_SISTEMA FINALIZARLAUDOAGORA TIPO padrao",
            "historico": [],
        },
    )

    assert resposta.status_code == 422
    corpo = resposta.json()
    detalhe = corpo.get("detail", {})
    assert detalhe["codigo"] == "GATE_QUALIDADE_REPROVADO"
    assert detalhe["aprovado"] is False
    assert isinstance(detalhe["faltantes"], list)
    assert len(detalhe["faltantes"]) >= 1

    with SessionLocal() as banco:
        laudo = (
            banco.query(Laudo)
            .filter(
                Laudo.empresa_id == ids["empresa_a"],
                Laudo.usuario_id == ids["inspetor_a"],
            )
            .order_by(Laudo.id.desc())
            .first()
        )
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.RASCUNHO.value


def test_api_chat_comando_rapido_pendencias_retorna_json(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["revisor_a"],
                tipo=TipoMensagem.HUMANO_ENG.value,
                conteudo="Favor anexar foto adicional do painel.",
                lida=False,
            )
        )
        banco.commit()

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/pendencias abertas",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["tipo"] == "comando_rapido"
    assert corpo["comando"] == "/pendencias"
    assert "Pendências da Mesa" in corpo["texto"]

    with SessionLocal() as banco:
        comando_salvo = (
            banco.query(MensagemLaudo)
            .filter(
                MensagemLaudo.laudo_id == laudo_id,
                MensagemLaudo.tipo == TipoMensagem.USER.value,
                MensagemLaudo.conteudo.like("[COMANDO_RAPIDO]%"),
            )
            .count()
        )
        assert comando_salvo >= 1


def test_api_chat_comando_rapido_resumo_retorna_json(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Inspeção em quadro elétrico principal."
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["inspetor_a"],
                tipo=TipoMensagem.USER.value,
                conteudo="Foi identificado aquecimento em borne de alimentação.",
            )
        )
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                tipo=TipoMensagem.IA.value,
                conteudo="Parecer preliminar emitido.",
            )
        )
        banco.commit()

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/resumo",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["tipo"] == "comando_rapido"
    assert corpo["comando"] == "/resumo"
    assert "Resumo da Sessão" in corpo["texto"]


def test_api_chat_comando_rapido_gerar_previa_retorna_json(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Inspeção inicial em área de caldeiras."
        laudo.parecer_ia = "Rascunho técnico com riscos e recomendações."
        banco.commit()

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/gerar_previa",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["tipo"] == "comando_rapido"
    assert corpo["comando"] == "/gerar_previa"
    assert "Prévia Operacional do Laudo" in corpo["texto"]


def test_api_chat_comando_rapido_enviar_mesa_gera_whisper(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/enviar_mesa Validar extintores e sinalização da área.",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    assert "text/event-stream" in (resposta.headers.get("content-type", "").lower())
    assert "humano_insp" in resposta.text

    with SessionLocal() as banco:
        ultima = (
            banco.query(MensagemLaudo)
            .filter(MensagemLaudo.laudo_id == laudo_id)
            .order_by(MensagemLaudo.id.desc())
            .first()
        )
        assert ultima is not None
        assert ultima.tipo == TipoMensagem.HUMANO_INSP.value
        assert "Validar extintores" in ultima.conteudo


def test_api_chat_comando_rapido_enviar_mesa_sem_texto_retorna_400(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/enviar_mesa",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 400
    assert "Use /enviar_mesa" in resposta.json()["detail"]


def test_api_chat_comando_rapido_enviar_mesa_sem_inspecao_ativa_retorna_400(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/enviar_mesa Validar extintores do almoxarifado.",
            "historico": [],
        },
    )

    assert resposta.status_code == 400
    assert "só é permitida após iniciar uma nova inspeção" in resposta.json()["detail"]


def test_canais_ia_e_mesa_ficam_isolados_no_historico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="Mensagem normal do chat IA",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    tipo=TipoMensagem.IA.value,
                    conteudo="Resposta da IA para o inspetor",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.HUMANO_INSP.value,
                    conteudo="Pergunta do inspetor para a mesa",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Retorno da mesa avaliadora",
                ),
            ]
        )
        banco.commit()

    resposta_chat = client.get(f"/app/api/laudo/{laudo_id}/mensagens")
    assert resposta_chat.status_code == 200
    itens_chat = resposta_chat.json()["itens"]
    tipos_chat = {item["tipo"] for item in itens_chat}
    assert TipoMensagem.USER.value in tipos_chat
    assert TipoMensagem.IA.value in tipos_chat
    assert TipoMensagem.HUMANO_INSP.value not in tipos_chat
    assert TipoMensagem.HUMANO_ENG.value not in tipos_chat

    resposta_mesa = client.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")
    assert resposta_mesa.status_code == 200
    itens_mesa = resposta_mesa.json()["itens"]
    tipos_mesa = {item["tipo"] for item in itens_mesa}
    assert TipoMensagem.HUMANO_INSP.value in tipos_mesa
    assert TipoMensagem.HUMANO_ENG.value in tipos_mesa
    assert TipoMensagem.USER.value not in tipos_mesa
    assert TipoMensagem.IA.value not in tipos_mesa


def test_inspetor_envia_mensagem_mesa_com_referencia_valida(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        msg_mesa = MensagemLaudo(
            laudo_id=laudo_id,
            remetente_id=ids["revisor_a"],
            tipo=TipoMensagem.HUMANO_ENG.value,
            conteudo="Corrigir o item de proteção coletiva.",
        )
        banco.add(msg_mesa)
        banco.commit()
        banco.refresh(msg_mesa)
        referencia_id = msg_mesa.id

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf},
        json={
            "texto": "Ajuste realizado em campo, favor revalidar.",
            "referencia_mensagem_id": referencia_id,
        },
    )

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["laudo_id"] == laudo_id
    assert corpo["mensagem"]["tipo"] == TipoMensagem.HUMANO_INSP.value
    assert corpo["mensagem"]["referencia_mensagem_id"] == referencia_id
    assert "Ajuste realizado em campo" in corpo["mensagem"]["texto"]

    with SessionLocal() as banco:
        ultima = (
            banco.query(MensagemLaudo)
            .filter(MensagemLaudo.laudo_id == laudo_id)
            .order_by(MensagemLaudo.id.desc())
            .first()
        )
        assert ultima is not None
        assert ultima.tipo == TipoMensagem.HUMANO_INSP.value
        assert ultima.conteudo.startswith(f"[REF_MSG_ID:{referencia_id}]")


def test_inspetor_envia_mensagem_mesa_com_referencia_invalida_retorna_404(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf},
        json={
            "texto": "Resposta do inspetor para a mesa.",
            "referencia_mensagem_id": 999999,
        },
        follow_redirects=False,
    )

    assert resposta.status_code == 404
    assert resposta.json()["detail"] == "Mensagem de referência não encontrada."


def test_revisor_responde_e_inspetor_visualiza_no_canal_mesa(ambiente_critico) -> None:
    client_revisor = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_revisor = _login_revisor(client_revisor, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta_revisor = client_revisor.post(
        f"/revisao/api/laudo/{laudo_id}/responder",
        headers={"X-CSRF-Token": csrf_revisor},
        json={"texto": "Mesa avaliadora: incluir foto da placa de identificação."},
    )
    assert resposta_revisor.status_code == 200
    assert resposta_revisor.json()["success"] is True

    with TestClient(main.app) as client_inspetor:
        _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")
        resposta_mesa = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")

    assert resposta_mesa.status_code == 200
    itens = resposta_mesa.json()["itens"]
    assert len(itens) >= 1
    assert itens[-1]["tipo"] == TipoMensagem.HUMANO_ENG.value
    assert "Mesa avaliadora" in itens[-1]["texto"]


def test_revisor_whisper_responder_rejeita_destinatario_diferente_do_responsavel(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        inspetor_extra = Usuario(
            empresa_id=ids["empresa_a"],
            nome_completo="Inspetor Extra",
            email=f"inspetor.extra.{uuid.uuid4().hex[:6]}@empresa-a.test",
            senha_hash=SENHA_HASH_PADRAO,
            nivel_acesso=NivelAcesso.INSPETOR.value,
        )
        banco.add(inspetor_extra)
        banco.flush()

        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.commit()
        destinatario_invalido = inspetor_extra.id

    resposta = client.post(
        "/revisao/api/whisper/responder",
        headers={"X-CSRF-Token": csrf},
        json={
            "laudo_id": laudo_id,
            "destinatario_id": destinatario_invalido,
            "mensagem": "Mensagem da mesa para inspetor incorreto.",
        },
    )

    assert resposta.status_code == 400
    assert "não corresponde ao inspetor responsável" in resposta.json()["detail"]


def test_jornada_e2e_chat_ia_e_mesa_comunicacao_bilateral(ambiente_critico) -> None:
    client_inspetor = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_inspetor = _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")

    with TestClient(main.app) as client_revisor:
        csrf_revisor = _login_revisor(client_revisor, "revisor@empresa-a.test")

        resposta_inicio = client_inspetor.post(
            "/app/api/laudo/iniciar",
            headers={"X-CSRF-Token": csrf_inspetor},
            data={"tipo_template": "padrao"},
        )
        assert resposta_inicio.status_code == 200
        laudo_id = int(resposta_inicio.json()["laudo_id"])

        class ClienteIAStub:
            def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
                yield "Diagnóstico técnico da IA para validação.\n"
                yield "Existe risco moderado em proteção mecânica.\n"

        cliente_original = rotas_inspetor.cliente_ia
        rotas_inspetor.cliente_ia = ClienteIAStub()
        try:
            resposta_chat = client_inspetor.post(
                "/app/api/chat",
                headers={"X-CSRF-Token": csrf_inspetor},
                json={
                    "mensagem": "Analise os riscos da prensa hidráulica.",
                    "historico": [],
                    "laudo_id": laudo_id,
                },
            )
        finally:
            rotas_inspetor.cliente_ia = cliente_original

        assert resposta_chat.status_code == 200
        assert "text/event-stream" in (resposta_chat.headers.get("content-type", "").lower())
        assert "Diagnóstico técnico da IA" in resposta_chat.text

        resposta_inspetor_para_mesa = client_inspetor.post(
            f"/app/api/laudo/{laudo_id}/mesa/mensagem",
            headers={"X-CSRF-Token": csrf_inspetor},
            json={"texto": "Mesa, validar item 4 da NR-12 na foto enviada."},
        )
        assert resposta_inspetor_para_mesa.status_code == 201
        mensagem_inspetor_id = int(resposta_inspetor_para_mesa.json()["mensagem"]["id"])

        historico_revisor = client_revisor.get(f"/revisao/api/laudo/{laudo_id}/completo?incluir_historico=true")
        assert historico_revisor.status_code == 200
        corpo_historico_revisor = historico_revisor.json()
        assert any(item["is_whisper"] for item in corpo_historico_revisor["historico"])
        assert any(item["tipo"] == TipoMensagem.HUMANO_INSP.value for item in corpo_historico_revisor["whispers"])

        resposta_revisor = client_revisor.post(
            f"/revisao/api/laudo/{laudo_id}/responder",
            headers={"X-CSRF-Token": csrf_revisor},
            json={
                "texto": "Mesa avaliadora: ponto recebido, pode seguir com evidência complementar.",
                "referencia_mensagem_id": mensagem_inspetor_id,
            },
        )
        assert resposta_revisor.status_code == 200
        assert resposta_revisor.json()["success"] is True

        resposta_mesa_inspetor = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")
        assert resposta_mesa_inspetor.status_code == 200
        itens_mesa = resposta_mesa_inspetor.json()["itens"]
        assert any(
            item["tipo"] == TipoMensagem.HUMANO_ENG.value
            and item.get("referencia_mensagem_id") == mensagem_inspetor_id
            for item in itens_mesa
        )

        resposta_chat_inspetor = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mensagens")
        assert resposta_chat_inspetor.status_code == 200
        tipos_chat = {item["tipo"] for item in resposta_chat_inspetor.json()["itens"]}
        assert TipoMensagem.USER.value in tipos_chat
        assert TipoMensagem.IA.value in tipos_chat
        assert TipoMensagem.HUMANO_INSP.value not in tipos_chat
        assert TipoMensagem.HUMANO_ENG.value not in tipos_chat


def test_jornada_e2e_whisper_revisor_para_inspetor_com_referencia(ambiente_critico) -> None:
    client_inspetor = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_inspetor = _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta_base = client_inspetor.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf_inspetor},
        json={"texto": "Favor avaliar item de aterramento da máquina."},
    )
    assert resposta_base.status_code == 201
    referencia_id = int(resposta_base.json()["mensagem"]["id"])

    with TestClient(main.app) as client_revisor:
        csrf_revisor = _login_revisor(client_revisor, "revisor@empresa-a.test")

        resposta_whisper = client_revisor.post(
            "/revisao/api/whisper/responder",
            headers={"X-CSRF-Token": csrf_revisor},
            json={
                "laudo_id": laudo_id,
                "destinatario_id": ids["inspetor_a"],
                "mensagem": "Mesa: validar continuidade elétrica com instrumento calibrado.",
                "referencia_mensagem_id": referencia_id,
            },
        )

    assert resposta_whisper.status_code == 200
    assert resposta_whisper.json()["success"] is True
    assert int(resposta_whisper.json()["destinatario_id"]) == ids["inspetor_a"]

    resposta_mesa = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")
    assert resposta_mesa.status_code == 200
    itens_mesa = resposta_mesa.json()["itens"]
    assert any(
        item["tipo"] == TipoMensagem.HUMANO_ENG.value
        and item.get("referencia_mensagem_id") == referencia_id
        and "Mesa: validar continuidade elétrica" in item["texto"]
        for item in itens_mesa
    )


def test_jornada_e2e_isolamento_multiempresa_no_chat_e_mesa(ambiente_critico) -> None:
    client_inspetor_a = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_a = _login_app_inspetor(client_inspetor_a, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id_a = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id_a,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="Mensagem do inspetor A no chat IA.",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id_a,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Mensagem da mesa para o inspetor A.",
                ),
            ]
        )
        banco.commit()

    with TestClient(main.app) as client_inspetor_b:
        csrf_b = _login_app_inspetor(client_inspetor_b, "inspetor@empresa-b.test")

        resposta_chat = client_inspetor_b.get(f"/app/api/laudo/{laudo_id_a}/mensagens", follow_redirects=False)
        assert resposta_chat.status_code == 404

        resposta_mesa = client_inspetor_b.get(f"/app/api/laudo/{laudo_id_a}/mesa/mensagens", follow_redirects=False)
        assert resposta_mesa.status_code == 404

        resposta_envio = client_inspetor_b.post(
            f"/app/api/laudo/{laudo_id_a}/mesa/mensagem",
            headers={"X-CSRF-Token": csrf_b},
            json={"texto": "Tentativa indevida de acesso cruzado."},
            follow_redirects=False,
        )
        assert resposta_envio.status_code == 404

    resposta_legitima = client_inspetor_a.post(
        f"/app/api/laudo/{laudo_id_a}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf_a},
        json={"texto": "Mensagem legítima do inspetor A para mesa."},
    )
    assert resposta_legitima.status_code == 201


def test_api_chat_stream_emite_confianca_e_salva_revisao(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Inspecao inicial da area de prensas."
        banco.commit()

    class ClienteIAStub:
        def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
            yield "### Diagnostico Tecnico\n"
            yield "Foram verificadas evidencias na NR-12 e medicao de 12 mm.\n"
            yield "Ha ponto com possivel desgaste; necessario validar em campo.\n"

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Analise os riscos da linha de prensas e entregue parecer tecnico.",
                "historico": [],
                "laudo_id": laudo_id,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta.status_code == 200
    assert "text/event-stream" in (resposta.headers.get("content-type", "").lower())
    assert "confianca_ia" in resposta.text

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert isinstance(laudo.confianca_ia_json, dict)
        assert laudo.confianca_ia_json.get("geral") in {"alta", "media", "baixa"}

        revisoes = (
            banco.query(LaudoRevisao)
            .filter(LaudoRevisao.laudo_id == laudo_id)
            .order_by(LaudoRevisao.numero_versao.asc())
            .all()
        )
        assert len(revisoes) == 1
        assert revisoes[0].numero_versao == 1
        assert revisoes[0].confianca_geral in {"alta", "media", "baixa"}


def test_inspetor_api_revisoes_lista_e_diff(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add_all(
            [
                LaudoRevisao(
                    laudo_id=laudo_id,
                    numero_versao=1,
                    origem="ia",
                    resumo="Versao inicial",
                    conteudo="Linha A: sem nao conformidade.",
                    confianca_geral="alta",
                    confianca_json={"geral": "alta", "secoes": [], "pontos_validacao_humana": []},
                ),
                LaudoRevisao(
                    laudo_id=laudo_id,
                    numero_versao=2,
                    origem="ia",
                    resumo="Versao atualizada",
                    conteudo="Linha A: sem nao conformidade.\nLinha B: ajustar bloqueio LOTO.",
                    confianca_geral="media",
                    confianca_json={"geral": "media", "secoes": [], "pontos_validacao_humana": []},
                ),
            ]
        )
        banco.commit()

    resposta_lista = client.get(f"/app/api/laudo/{laudo_id}/revisoes")
    assert resposta_lista.status_code == 200
    corpo_lista = resposta_lista.json()
    assert corpo_lista["laudo_id"] == laudo_id
    assert corpo_lista["total_revisoes"] == 2
    assert corpo_lista["ultima_versao"] == 2
    assert len(corpo_lista["revisoes"]) == 2

    resposta_diff = client.get(f"/app/api/laudo/{laudo_id}/revisoes/diff?base=1&comparar=2")
    assert resposta_diff.status_code == 200
    corpo_diff = resposta_diff.json()
    assert corpo_diff["base"]["versao"] == 1
    assert corpo_diff["comparar"]["versao"] == 2
    assert "versao_base" in corpo_diff["diff_unificado"]
    assert "versao_comparada" in corpo_diff["diff_unificado"]
    assert corpo_diff["resumo_diff"]["linhas_adicionadas"] >= 1
    assert corpo_diff["resumo_diff"]["total_alteracoes"] >= 1


def test_api_chat_comando_resumo_exibe_confianca_e_versionamento(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Inspecao eletrica em painel principal."
        laudo.confianca_ia_json = {
            "geral": "baixa",
            "secoes": [],
            "pontos_validacao_humana": [
                "Sintese geral: validar medicao com instrumento calibrado.",
            ],
        }
        banco.add(
            LaudoRevisao(
                laudo_id=laudo_id,
                numero_versao=1,
                origem="ia",
                resumo="Primeira versao",
                conteudo="Versao inicial do parecer tecnico.",
                confianca_geral="baixa",
                confianca_json=laudo.confianca_ia_json,
            )
        )
        banco.commit()

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/resumo",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["tipo"] == "comando_rapido"
    assert "Confiança IA" in corpo["texto"]
    assert "Versionamento: **v1**" in corpo["texto"]
    assert "Pontos para validação humana" in corpo["texto"]


def test_inspetor_nao_pode_deletar_laudo_aguardando(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

    resposta = client.request(
        "DELETE",
        f"/app/api/laudo/{laudo_id}",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Esse laudo não pode ser excluído no estado atual."


def test_inspetor_pendencias_lista_somente_mensagens_da_mesa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência 1",
                    lida=False,
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência 2",
                    lida=True,
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="Mensagem comum do inspetor",
                    lida=False,
                ),
            ]
        )
        banco.commit()

    resposta = client.get(f"/app/api/laudo/{laudo_id}/pendencias")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["laudo_id"] == laudo_id
    assert corpo["filtro"] == "abertas"
    assert corpo["abertas"] == 1
    assert corpo["resolvidas"] == 1
    assert corpo["total"] == 2
    assert corpo["total_filtrado"] == 1
    assert len(corpo["pendencias"]) == 1
    assert all("Pendência" in item["texto"] for item in corpo["pendencias"])
    assert all(item["lida"] is False for item in corpo["pendencias"])


def test_inspetor_pendencias_filtros_todas_e_resolvidas(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência aberta",
                    lida=False,
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência resolvida",
                    lida=True,
                ),
            ]
        )
        banco.commit()

    resposta_todas = client.get(f"/app/api/laudo/{laudo_id}/pendencias?filtro=todas")
    assert resposta_todas.status_code == 200
    corpo_todas = resposta_todas.json()
    assert corpo_todas["filtro"] == "todas"
    assert corpo_todas["total"] == 2
    assert corpo_todas["total_filtrado"] == 2
    assert len(corpo_todas["pendencias"]) == 2

    resposta_resolvidas = client.get(f"/app/api/laudo/{laudo_id}/pendencias?filtro=resolvidas")
    assert resposta_resolvidas.status_code == 200
    corpo_resolvidas = resposta_resolvidas.json()
    assert corpo_resolvidas["filtro"] == "resolvidas"
    assert corpo_resolvidas["total"] == 2
    assert corpo_resolvidas["total_filtrado"] == 1
    assert len(corpo_resolvidas["pendencias"]) == 1
    assert corpo_resolvidas["pendencias"][0]["lida"] is True


def test_inspetor_pendencias_paginacao_respeita_filtro(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        mensagens = []
        for indice in range(17):
            mensagens.append(
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo=f"Pendência aberta {indice}",
                    lida=False,
                )
            )

        for indice in range(4):
            mensagens.append(
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo=f"Pendência resolvida {indice}",
                    lida=True,
                )
            )

        banco.add_all(mensagens)
        banco.commit()

    resposta = client.get(f"/app/api/laudo/{laudo_id}/pendencias?filtro=abertas&pagina=2&tamanho=5")
    assert resposta.status_code == 200

    corpo = resposta.json()
    assert corpo["filtro"] == "abertas"
    assert corpo["pagina"] == 2
    assert corpo["tamanho"] == 5
    assert corpo["total"] == 21
    assert corpo["total_filtrado"] == 17
    assert corpo["tem_mais"] is True
    assert len(corpo["pendencias"]) == 5
    assert all(item["lida"] is False for item in corpo["pendencias"])


def test_inspetor_pendencias_marcar_lidas_atualiza_apenas_humano_eng(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendente A",
                    lida=False,
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendente B",
                    lida=False,
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.HUMANO_INSP.value,
                    conteudo="Whisper do inspetor",
                    lida=False,
                ),
            ]
        )
        banco.commit()

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/pendencias/marcar-lidas",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["ok"] is True
    assert corpo["marcadas"] == 2

    with SessionLocal() as banco:
        abertas_humano_eng = (
            banco.query(MensagemLaudo)
            .filter(
                MensagemLaudo.laudo_id == laudo_id,
                MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
                MensagemLaudo.lida.is_(False),
            )
            .count()
        )
        assert abertas_humano_eng == 0

        aberto_humano_insp = (
            banco.query(MensagemLaudo)
            .filter(
                MensagemLaudo.laudo_id == laudo_id,
                MensagemLaudo.tipo == TipoMensagem.HUMANO_INSP.value,
                MensagemLaudo.lida.is_(False),
            )
            .count()
        )
        assert aberto_humano_insp == 1


def test_inspetor_pendencia_individual_registra_historico_e_reabre(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        msg = MensagemLaudo(
            laudo_id=laudo_id,
            remetente_id=ids["revisor_a"],
            tipo=TipoMensagem.HUMANO_ENG.value,
            conteudo="Corrigir item de segurança da NR.",
            lida=False,
        )
        banco.add(msg)
        banco.commit()
        banco.refresh(msg)
        mensagem_id = msg.id

    resposta_resolver = client.patch(
        f"/app/api/laudo/{laudo_id}/pendencias/{mensagem_id}",
        json={"lida": True},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta_resolver.status_code == 200
    corpo_resolver = resposta_resolver.json()
    assert corpo_resolver["ok"] is True
    assert corpo_resolver["lida"] is True
    assert corpo_resolver["resolvida_por_id"] == ids["inspetor_a"]
    assert corpo_resolver["resolvida_em"]

    with SessionLocal() as banco:
        msg_db = banco.get(MensagemLaudo, mensagem_id)
        assert msg_db is not None
        assert msg_db.lida is True
        assert msg_db.resolvida_por_id == ids["inspetor_a"]
        assert msg_db.resolvida_em is not None

    resposta_reabrir = client.patch(
        f"/app/api/laudo/{laudo_id}/pendencias/{mensagem_id}",
        json={"lida": False},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta_reabrir.status_code == 200
    corpo_reabrir = resposta_reabrir.json()
    assert corpo_reabrir["ok"] is True
    assert corpo_reabrir["lida"] is False
    assert corpo_reabrir["resolvida_por_id"] is None
    assert corpo_reabrir["resolvida_em"] == ""

    with SessionLocal() as banco:
        msg_db = banco.get(MensagemLaudo, mensagem_id)
        assert msg_db is not None
        assert msg_db.lida is False
        assert msg_db.resolvida_por_id is None
        assert msg_db.resolvida_em is None


def test_inspetor_exportar_pendencias_pdf_retorna_arquivo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        revisor = banco.get(Usuario, ids["revisor_a"])
        assert revisor is not None
        revisor.crea = "123456-SP"

        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["revisor_a"],
                tipo=TipoMensagem.HUMANO_ENG.value,
                conteudo="Ajustar item do laudo para adequacao.",
                lida=False,
            )
        )
        banco.commit()

    resposta = client.get(f"/app/api/laudo/{laudo_id}/pendencias/exportar-pdf?filtro=abertas")

    assert resposta.status_code == 200
    content_type = resposta.headers.get("content-type", "").lower()
    assert "application/pdf" in content_type

    content_disposition = resposta.headers.get("content-disposition", "").lower()
    assert "filename=" in content_disposition
    assert len(resposta.content) > 300

    pypdf = pytest.importorskip("pypdf")
    leitor = pypdf.PdfReader(io.BytesIO(resposta.content))
    texto_pdf = "\n".join((pagina.extract_text() or "") for pagina in leitor.pages)
    texto_pdf_maiusculo = texto_pdf.upper()

    assert "RELATORIO DE PENDENCIAS DA MESA AVALIADORA" in texto_pdf_maiusculo
    assert "CARIMBO DIGITAL WF" in texto_pdf_maiusculo
    assert "REVISOR A" in texto_pdf_maiusculo
    assert "123456-SP" in texto_pdf_maiusculo


def test_revisor_rejeitar_exige_motivo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

    resposta = client.post(
        f"/revisao/api/laudo/{laudo_id}/avaliar",
        data={"acao": "rejeitar", "motivo": "", "csrf_token": csrf},
    )

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Motivo obrigatório."


def test_revisor_aprovar_atualiza_status_e_registra_mensagem(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

    resposta = client.post(
        f"/revisao/api/laudo/{laudo_id}/avaliar",
        data={"acao": "aprovar", "motivo": "", "csrf_token": csrf},
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert resposta.headers["location"] == "/revisao/painel"

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.APROVADO.value
        assert laudo.revisado_por == ids["revisor_a"]

        msg = banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo_id).order_by(MensagemLaudo.id.desc()).first()
        assert msg is not None
        assert msg.tipo == TipoMensagem.HUMANO_ENG.value
        assert "APROVADO" in msg.conteudo


def test_inspetor_login_permite_bloqueio_temporario_expirado(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "inspetor@empresa-a.test"))
        assert usuario is not None
        usuario.status_bloqueio = True
        usuario.bloqueado_ate = datetime.now(timezone.utc) - timedelta(minutes=1)
        banco.commit()

    tela_login = client.get("/app/login")
    csrf = _extrair_csrf(tela_login.text)

    resposta = client.post(
        "/app/login",
        data={
            "email": "inspetor@empresa-a.test",
            "senha": SENHA_PADRAO,
            "csrf_token": csrf,
        },
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert resposta.headers["location"] == "/app/"


def test_revisor_websocket_rejeita_sessao_inativa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]

    _login_revisor(client, "revisor@empresa-a.test")

    seguranca.SESSOES_ATIVAS.clear()
    seguranca._SESSAO_EXPIRACAO.clear()  # noqa: SLF001
    seguranca._SESSAO_META.clear()  # noqa: SLF001
    with SessionLocal() as banco:
        banco.query(SessaoAtiva).delete()
        banco.commit()

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/revisao/ws/whispers"):
            pass

    assert exc.value.code == 4401


def test_sessao_admin_recupera_do_banco_apos_limpar_cache_memoria(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]

    _login_admin(client, "admin@empresa-a.test")

    with SessionLocal() as banco:
        assert banco.query(SessaoAtiva).count() == 1

    seguranca.SESSOES_ATIVAS.clear()
    seguranca._SESSAO_EXPIRACAO.clear()  # noqa: SLF001
    seguranca._SESSAO_META.clear()  # noqa: SLF001

    resposta = client.get("/admin/painel", follow_redirects=False)

    assert resposta.status_code == 200
    assert len(seguranca.SESSOES_ATIVAS) == 1


def test_reset_senha_revoga_sessoes_ativas_do_usuario(ambiente_critico) -> None:
    client_admin = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with TestClient(main.app) as client_inspetor:
        _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")

        resposta_autenticada = client_inspetor.get("/app/", follow_redirects=False)
        assert resposta_autenticada.status_code == 200

        _login_admin(client_admin, "admin@empresa-a.test")
        csrf_admin = _csrf_pagina(client_admin, f"/admin/clientes/{ids['empresa_a']}")

        reset = client_admin.post(
            f"/admin/clientes/{ids['empresa_a']}/resetar-senha/{ids['inspetor_a']}",
            data={"csrf_token": csrf_admin},
            follow_redirects=False,
        )
        assert reset.status_code == 303

        with SessionLocal() as banco:
            sessoes_usuario = banco.query(SessaoAtiva).filter(SessaoAtiva.usuario_id == ids["inspetor_a"]).count()
            assert sessoes_usuario == 0

        resposta_pos_reset = client_inspetor.get("/app/", follow_redirects=False)
        assert resposta_pos_reset.status_code == 303
        assert resposta_pos_reset.headers["location"] == "/app/login"


def test_admin_reset_senha_exibe_senha_temporaria_em_flash(ambiente_critico, monkeypatch: pytest.MonkeyPatch) -> None:
    client = ambiente_critico["client"]
    ids = ambiente_critico["ids"]
    senha_temporaria = "Reset@Temp123"

    _login_admin(client, "admin@empresa-a.test")
    csrf = _csrf_pagina(client, f"/admin/clientes/{ids['empresa_a']}")

    def _resetar_stub(_db: Session, _usuario_id: int) -> str:
        return senha_temporaria

    monkeypatch.setattr(rotas_admin, "resetar_senha_inspetor", _resetar_stub)

    resposta = client.post(
        f"/admin/clientes/{ids['empresa_a']}/resetar-senha/{ids['inspetor_a']}",
        data={"csrf_token": csrf},
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert senha_temporaria not in resposta.headers["location"]

    primeira_view = client.get(resposta.headers["location"])
    assert primeira_view.status_code == 200
    assert senha_temporaria in primeira_view.text

    segunda_view = client.get(f"/admin/clientes/{ids['empresa_a']}")
    assert segunda_view.status_code == 200
    assert senha_temporaria not in segunda_view.text


def test_admin_adicionar_inspetor_exibe_senha_temporaria_em_flash(ambiente_critico, monkeypatch: pytest.MonkeyPatch) -> None:
    client = ambiente_critico["client"]
    ids = ambiente_critico["ids"]
    senha_temporaria = "Novo@Temp123"

    _login_admin(client, "admin@empresa-a.test")
    csrf = _csrf_pagina(client, f"/admin/clientes/{ids['empresa_a']}")

    def _adicionar_stub(_db: Session, _empresa_id: int, _nome: str, _email: str) -> str:
        return senha_temporaria

    monkeypatch.setattr(rotas_admin, "adicionar_inspetor", _adicionar_stub)

    resposta = client.post(
        f"/admin/clientes/{ids['empresa_a']}/adicionar-inspetor",
        data={
            "csrf_token": csrf,
            "nome": "Novo Inspetor",
            "email": "novo.inspetor@empresa-a.test",
        },
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert senha_temporaria not in resposta.headers["location"]

    primeira_view = client.get(resposta.headers["location"])
    assert primeira_view.status_code == 200
    assert senha_temporaria in primeira_view.text

    segunda_view = client.get(f"/admin/clientes/{ids['empresa_a']}")
    assert segunda_view.status_code == 200
    assert senha_temporaria not in segunda_view.text


def test_admin_atualizar_crea_revisor(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    _login_admin(client, "admin@empresa-a.test")
    csrf = _csrf_pagina(client, f"/admin/clientes/{ids['empresa_a']}")

    resposta = client.post(
        f"/admin/clientes/{ids['empresa_a']}/usuarios/{ids['revisor_a']}/atualizar-crea",
        data={"csrf_token": csrf, "crea": " 123456-sp "},
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert resposta.headers["location"] == f"/admin/clientes/{ids['empresa_a']}?sucesso=CREA%20atualizado%20para%20Revisor%20A."

    with SessionLocal() as banco:
        revisor = banco.get(Usuario, ids["revisor_a"])
        assert revisor is not None
        assert revisor.crea == "123456-SP"


def test_admin_atualizar_crea_rejeita_inspetor(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    _login_admin(client, "admin@empresa-a.test")
    csrf = _csrf_pagina(client, f"/admin/clientes/{ids['empresa_a']}")

    resposta = client.post(
        f"/admin/clientes/{ids['empresa_a']}/usuarios/{ids['inspetor_a']}/atualizar-crea",
        data={"csrf_token": csrf, "crea": "123456-SP"},
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert "erro=" in resposta.headers["location"]

    with SessionLocal() as banco:
        inspetor = banco.get(Usuario, ids["inspetor_a"])
        assert inspetor is not None
        assert inspetor.crea in (None, "")


def test_admin_cadastrar_empresa_exibe_senha_temporaria_em_flash(ambiente_critico, monkeypatch: pytest.MonkeyPatch) -> None:
    client = ambiente_critico["client"]
    senha_temporaria = "Onboard@Temp123"

    _login_admin(client, "admin@empresa-a.test")
    csrf = _csrf_pagina(client, "/admin/painel")

    class _EmpresaStub:
        id = 999
        nome_fantasia = "Cliente Stub"

    def _registrar_stub(_db: Session, **_kwargs) -> tuple[_EmpresaStub, str]:
        return _EmpresaStub(), senha_temporaria

    monkeypatch.setattr(rotas_admin, "registrar_novo_cliente", _registrar_stub)

    resposta = client.post(
        "/admin/cadastrar-empresa",
        data={
            "csrf_token": csrf,
            "nome": "Cliente Stub",
            "cnpj": "99999999000199",
            "email": "admin@cliente-stub.test",
            "plano": "Ilimitado",
        },
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert senha_temporaria not in resposta.headers["location"]

    primeira_view = client.get(resposta.headers["location"])
    assert primeira_view.status_code == 200
    assert senha_temporaria in primeira_view.text

    segunda_view = client.get("/admin/clientes")
    assert segunda_view.status_code == 200
    assert senha_temporaria not in segunda_view.text
