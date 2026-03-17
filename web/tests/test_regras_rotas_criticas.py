from __future__ import annotations

import base64
import io
import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from docx import Document
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
    AnexoMesa,
    Base,
    Empresa,
    Laudo,
    LaudoRevisao,
    LimitePlano,
    MensagemLaudo,
    NivelAcesso,
    PlanoEmpresa,
    RegistroAuditoriaEmpresa,
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


def _docx_bytes_teste(texto: str = "Checklist operacional do admin-cliente.") -> bytes:
    documento = Document()
    documento.add_paragraph(texto)
    buffer = io.BytesIO()
    documento.save(buffer)
    return buffer.getvalue()


def _imagem_png_bytes_teste() -> bytes:
    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z2ioAAAAASUVORK5CYII="
    )


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


def test_login_mobile_inspetor_retorna_token_e_bootstrap_funciona(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    resposta_login = client.post(
        "/app/api/mobile/auth/login",
        json={
            "email": "inspetor@empresa-a.test",
            "senha": SENHA_PADRAO,
            "lembrar": True,
        },
    )

    assert resposta_login.status_code == 200
    corpo_login = resposta_login.json()
    assert corpo_login["auth_mode"] == "bearer"
    assert corpo_login["token_type"] == "bearer"
    assert corpo_login["usuario"]["email"] == "inspetor@empresa-a.test"

    headers = {"Authorization": f"Bearer {corpo_login['access_token']}"}

    resposta_bootstrap = client.get("/app/api/mobile/bootstrap", headers=headers)
    assert resposta_bootstrap.status_code == 200
    corpo_bootstrap = resposta_bootstrap.json()
    assert corpo_bootstrap["app"]["portal"] == "inspetor"
    assert corpo_bootstrap["usuario"]["empresa_nome"] == "Empresa A"

    resposta_perfil = client.put(
        "/app/api/perfil",
        headers=headers,
        json={
            "nome_completo": "Inspetor Mobile A",
            "email": "inspetor@empresa-a.test",
            "telefone": "(11) 99999-0000",
        },
    )
    assert resposta_perfil.status_code == 200
    assert resposta_perfil.json()["perfil"]["nome_completo"] == "Inspetor Mobile A"

    resposta_logout = client.post("/app/api/mobile/auth/logout", headers=headers)
    assert resposta_logout.status_code == 200

    resposta_bootstrap_expirado = client.get("/app/api/mobile/bootstrap", headers=headers)
    assert resposta_bootstrap_expirado.status_code == 401


def test_sessao_revisor_nao_vaza_para_portal_admin(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_revisor(client, "revisor@empresa-a.test")

    resposta_admin = client.get("/admin/painel", follow_redirects=False)
    assert resposta_admin.status_code == 303
    assert resposta_admin.headers["location"] == "/admin/login"


def test_admin_cliente_login_funciona_e_painel_abre(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_cliente(client, "cliente@empresa-a.test")

    resposta = client.get("/cliente/painel")
    assert resposta.status_code == 200
    assert "Portal unificado da empresa" in resposta.text


def test_admin_cliente_nao_acessa_admin_geral(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_cliente(client, "cliente@empresa-a.test")

    resposta = client.get("/admin/painel", follow_redirects=False)
    assert resposta.status_code == 303
    assert resposta.headers["location"] == "/admin/login"


def test_admin_cliente_bootstrap_fica_restrito_a_propria_empresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    _login_cliente(client, "cliente@empresa-a.test")

    resposta = client.get("/cliente/api/bootstrap")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["empresa"]["nome_fantasia"] == "Empresa A"
    emails = {item["email"] for item in corpo["usuarios"]}
    assert "cliente@empresa-a.test" in emails
    assert "inspetor@empresa-a.test" in emails
    assert "admin@empresa-a.test" not in emails
    assert "inspetor@empresa-b.test" not in emails
    assert corpo["empresa"]["total_usuarios"] == 3
    assert corpo["empresa"]["usuarios_em_uso"] == 3


def test_admin_cliente_nao_gerencia_admin_ceo_mesmo_na_mesma_empresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta_lista = client.get("/cliente/api/usuarios", headers={"X-CSRF-Token": csrf})

    assert resposta_lista.status_code == 200
    emails = {item["email"] for item in resposta_lista.json()["itens"]}
    assert "admin@empresa-a.test" not in emails

    resposta_atualizar = client.patch(
        f"/cliente/api/usuarios/{ids['admin_a']}",
        headers={"X-CSRF-Token": csrf},
        json={
            "nome": "Admin CEO Alterado",
            "email": "admin@empresa-a.test",
            "telefone": "",
            "crea": "",
        },
    )
    assert resposta_atualizar.status_code == 404

    resposta_bloqueio = client.patch(
        f"/cliente/api/usuarios/{ids['admin_a']}/bloqueio",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_bloqueio.status_code == 404

    resposta_reset = client.post(
        f"/cliente/api/usuarios/{ids['admin_a']}/resetar-senha",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_reset.status_code == 404


def test_admin_cliente_nao_acessa_revisao_geral(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_cliente(client, "cliente@empresa-a.test")

    resposta = client.get("/revisao/painel", follow_redirects=False)
    assert resposta.status_code in {303, 401}
    if resposta.status_code == 303:
        assert resposta.headers["location"] == "/revisao/login"


def test_admin_cliente_altera_plano_apenas_da_propria_empresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta = client.patch(
        "/cliente/api/empresa/plano",
        headers={"X-CSRF-Token": csrf},
        json={"plano": "Intermediario"},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["empresa"]["plano_ativo"] == "Intermediario"

    with SessionLocal() as banco:
        empresa_a = banco.get(Empresa, ids["empresa_a"])
        empresa_b = banco.get(Empresa, ids["empresa_b"])
        assert empresa_a is not None
        assert empresa_b is not None
        assert empresa_a.plano_ativo == "Intermediario"
        assert empresa_b.plano_ativo == PlanoEmpresa.ILIMITADO.value


def test_admin_cliente_cria_e_gerencia_usuarios_restritos_a_empresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta_inspetor = client.post(
        "/cliente/api/usuarios",
        headers={"X-CSRF-Token": csrf},
        json={
            "nome": "Inspetor Operacional A2",
            "email": "inspetor2@empresa-a.test",
            "nivel_acesso": "inspetor",
            "telefone": "62999990000",
            "crea": "",
        },
    )

    assert resposta_inspetor.status_code == 201
    corpo_inspetor = resposta_inspetor.json()
    assert corpo_inspetor["usuario"]["papel"] == "Inspetor"
    assert corpo_inspetor["senha_temporaria"]

    resposta_revisor = client.post(
        "/cliente/api/usuarios",
        headers={"X-CSRF-Token": csrf},
        json={
            "nome": "Mesa Operacional A2",
            "email": "mesa2@empresa-a.test",
            "nivel_acesso": "revisor",
            "telefone": "62999991111",
            "crea": "123456/GO",
        },
    )

    assert resposta_revisor.status_code == 201
    corpo_revisor = resposta_revisor.json()
    usuario_revisor_id = int(corpo_revisor["usuario"]["id"])
    assert corpo_revisor["usuario"]["papel"] == "Mesa Avaliadora"
    assert corpo_revisor["usuario"]["crea"] == "123456/GO"

    resposta_toggle_outra_empresa = client.patch(
        f"/cliente/api/usuarios/{ids['inspetor_b']}/bloqueio",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_toggle_outra_empresa.status_code == 404

    resposta_reset = client.post(
        f"/cliente/api/usuarios/{usuario_revisor_id}/resetar-senha",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_reset.status_code == 200
    assert resposta_reset.json()["senha_temporaria"]

    with SessionLocal() as banco:
        novo_inspetor = banco.scalar(select(Usuario).where(Usuario.email == "inspetor2@empresa-a.test"))
        novo_revisor = banco.scalar(select(Usuario).where(Usuario.email == "mesa2@empresa-a.test"))
        assert novo_inspetor is not None
        assert novo_revisor is not None
        assert int(novo_inspetor.empresa_id) == ids["empresa_a"]
        assert int(novo_revisor.empresa_id) == ids["empresa_a"]
        assert int(novo_inspetor.nivel_acesso) == int(NivelAcesso.INSPETOR)
        assert int(novo_revisor.nivel_acesso) == int(NivelAcesso.REVISOR)


def test_admin_cliente_chat_lista_laudos_da_empresa_sem_vazar_outra(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    with SessionLocal() as banco:
        laudo_empresa_a = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_empresa_b = _criar_laudo(
            banco,
            empresa_id=ids["empresa_b"],
            usuario_id=ids["inspetor_b"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta_lista = client.get("/cliente/api/chat/laudos", headers={"X-CSRF-Token": csrf})

    assert resposta_lista.status_code == 200
    ids_laudos = {int(item["id"]) for item in resposta_lista.json()["itens"]}
    assert laudo_empresa_a in ids_laudos
    assert laudo_empresa_b not in ids_laudos

    resposta_mensagens_empresa_a = client.get(
        f"/cliente/api/chat/laudos/{laudo_empresa_a}/mensagens",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_mensagens_empresa_a.status_code == 200

    resposta_mensagens_empresa_b = client.get(
        f"/cliente/api/chat/laudos/{laudo_empresa_b}/mensagens",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_mensagens_empresa_b.status_code == 404


def test_admin_cliente_mesa_reescreve_urls_de_anexo_para_o_proprio_portal(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    conteudo = _imagem_png_bytes_teste()
    caminho = ""

    try:
        with SessionLocal() as banco:
            laudo_id = _criar_laudo(
                banco,
                empresa_id=ids["empresa_a"],
                usuario_id=ids["inspetor_a"],
                status_revisao=StatusRevisao.AGUARDANDO.value,
            )

            mensagem = MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["revisor_a"],
                tipo=TipoMensagem.HUMANO_ENG.value,
                conteudo="Pendencia com evidencia anexada.",
                lida=False,
                custo_api_reais=Decimal("0.0000"),
            )
            banco.add(mensagem)
            banco.flush()

            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as arquivo:
                arquivo.write(conteudo)
                caminho = arquivo.name

            anexo = AnexoMesa(
                laudo_id=laudo_id,
                mensagem_id=mensagem.id,
                enviado_por_id=ids["revisor_a"],
                nome_original="retorno-mesa.png",
                nome_arquivo="retorno-mesa.png",
                mime_type="image/png",
                categoria="imagem",
                tamanho_bytes=len(conteudo),
                caminho_arquivo=caminho,
            )
            banco.add(anexo)
            banco.commit()
            banco.refresh(anexo)
            anexo_id = int(anexo.id)

        resposta = client.get(
            f"/cliente/api/mesa/laudos/{laudo_id}/mensagens",
            headers={"X-CSRF-Token": csrf},
        )

        assert resposta.status_code == 200
        itens = resposta.json()["itens"]
        assert itens
        anexo_payload = itens[-1]["anexos"][0]
        assert anexo_payload["nome"] == "retorno-mesa.png"
        assert anexo_payload["url"] == f"/cliente/api/mesa/laudos/{laudo_id}/anexos/{anexo_id}"

        resposta_completo = client.get(
            f"/cliente/api/mesa/laudos/{laudo_id}/completo",
            params={"incluir_historico": "true"},
            headers={"X-CSRF-Token": csrf},
        )
        assert resposta_completo.status_code == 200
        historico = resposta_completo.json()["historico"]
        assert historico[-1]["anexos"][0]["url"] == f"/cliente/api/mesa/laudos/{laudo_id}/anexos/{anexo_id}"

        resposta_pacote = client.get(
            f"/cliente/api/mesa/laudos/{laudo_id}/pacote",
            headers={"X-CSRF-Token": csrf},
        )
        assert resposta_pacote.status_code == 200
        pacote = resposta_pacote.json()
        assert pacote["pendencias_abertas"][0]["anexos"][0]["url"] == (
            f"/cliente/api/mesa/laudos/{laudo_id}/anexos/{anexo_id}"
        )

        download = client.get(anexo_payload["url"])
        assert download.status_code == 200
        assert download.content == conteudo
    finally:
        if caminho and os.path.exists(caminho):
            os.unlink(caminho)


def test_admin_cliente_upload_documental_reaproveita_fluxo_do_chat(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta = client.post(
        "/cliente/api/chat/upload_doc",
        headers={"X-CSRF-Token": csrf},
        files={
            "arquivo": (
                "checklist-operacional.docx",
                _docx_bytes_teste("Checklist operacional do admin-cliente para a empresa."),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert "Checklist operacional do admin-cliente" in corpo["texto"]
    assert corpo["nome"] == "checklist-operacional.docx"
    assert corpo["chars"] >= 20
    assert corpo["truncado"] is False


def test_admin_cliente_registra_auditoria_de_plano_e_usuarios(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta_plano = client.patch(
        "/cliente/api/empresa/plano",
        headers={"X-CSRF-Token": csrf},
        json={"plano": "Intermediario"},
    )
    assert resposta_plano.status_code == 200

    resposta_usuario = client.post(
        "/cliente/api/usuarios",
        headers={"X-CSRF-Token": csrf},
        json={
            "nome": "Auditado Empresa A",
            "email": "auditado@empresa-a.test",
            "nivel_acesso": "inspetor",
            "telefone": "62991110000",
            "crea": "",
        },
    )
    assert resposta_usuario.status_code == 201
    usuario_novo_id = int(resposta_usuario.json()["usuario"]["id"])

    resposta_auditoria = client.get("/cliente/api/auditoria")
    assert resposta_auditoria.status_code == 200
    itens = resposta_auditoria.json()["itens"]
    acoes = [item["acao"] for item in itens]
    assert "plano_alterado" in acoes
    assert "usuario_criado" in acoes
    assert all(item["portal"] == "cliente" for item in itens)
    assert any(item["ator_usuario_id"] == ids["admin_cliente_a"] for item in itens)
    assert any(
        item["alvo_usuario_id"] == usuario_novo_id
        for item in itens
        if item["acao"] == "usuario_criado"
    )
    registro_plano = next(item for item in itens if item["acao"] == "plano_alterado")
    assert registro_plano["payload"]["plano_anterior"] == "Ilimitado"
    assert registro_plano["payload"]["plano_novo"] == "Intermediario"
    assert registro_plano["payload"]["movimento"] == "downgrade"
    assert "Impacto esperado" in registro_plano["detalhe"]

    resposta_bootstrap = client.get("/cliente/api/bootstrap")
    assert resposta_bootstrap.status_code == 200
    bootstrap_itens = resposta_bootstrap.json()["auditoria"]["itens"]
    assert bootstrap_itens
    assert {item["acao"] for item in bootstrap_itens} >= {"plano_alterado", "usuario_criado"}

    with SessionLocal() as banco:
        registros = list(
            banco.scalars(
                select(RegistroAuditoriaEmpresa)
                .where(RegistroAuditoriaEmpresa.empresa_id == ids["empresa_a"])
                .order_by(RegistroAuditoriaEmpresa.id.desc())
            ).all()
        )
        assert registros
        assert all(int(item.empresa_id) == ids["empresa_a"] for item in registros)
        assert {item.acao for item in registros} >= {"plano_alterado", "usuario_criado"}


def test_admin_cliente_registra_interesse_em_upgrade_no_historico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta_plano = client.patch(
        "/cliente/api/empresa/plano",
        headers={"X-CSRF-Token": csrf},
        json={"plano": "Inicial"},
    )
    assert resposta_plano.status_code == 200

    resposta_interesse = client.post(
        "/cliente/api/empresa/plano/interesse",
        headers={"X-CSRF-Token": csrf},
        json={"plano": "Intermediario", "origem": "chat"},
    )
    assert resposta_interesse.status_code == 200
    corpo = resposta_interesse.json()
    assert corpo["success"] is True
    assert corpo["plano"]["plano"] == "Intermediario"
    assert corpo["plano"]["movimento"] == "upgrade"

    resposta_auditoria = client.get("/cliente/api/auditoria")
    assert resposta_auditoria.status_code == 200
    itens = resposta_auditoria.json()["itens"]
    registro = next(item for item in itens if item["acao"] == "plano_interesse_registrado")
    assert registro["payload"]["origem"] == "chat"
    assert registro["payload"]["plano_sugerido"] == "Intermediario"
    assert "Impacto esperado" in registro["detalhe"]


def test_admin_cliente_registra_auditoria_operacional_de_chat_e_mesa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta_criar = client.post(
        "/cliente/api/chat/laudos",
        headers={"X-CSRF-Token": csrf},
        data={"tipo_template": "padrao"},
    )
    assert resposta_criar.status_code == 200
    laudo_chat_id = int(resposta_criar.json()["laudo_id"])

    resposta_chat = client.post(
        "/cliente/api/chat/mensagem",
        headers={"X-CSRF-Token": csrf},
        json={
            "laudo_id": laudo_chat_id,
            "mensagem": "Fluxo auditado do admin-cliente no chat.",
            "historico": [],
            "setor": "geral",
            "modo": "detalhado",
        },
    )
    assert resposta_chat.status_code == 200

    with SessionLocal() as banco:
        laudo_reaberto_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.REJEITADO.value,
        )
        laudo_mesa_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

    resposta_reabrir = client.post(
        f"/cliente/api/chat/laudos/{laudo_reaberto_id}/reabrir",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_reabrir.status_code == 200

    resposta_mesa = client.post(
        f"/cliente/api/mesa/laudos/{laudo_mesa_id}/responder",
        headers={"X-CSRF-Token": csrf},
        json={"texto": "Mesa respondeu pelo portal do admin-cliente."},
    )
    assert resposta_mesa.status_code == 200

    resposta_avaliar = client.post(
        f"/cliente/api/mesa/laudos/{laudo_mesa_id}/avaliar",
        headers={"X-CSRF-Token": csrf},
        json={"acao": "aprovar", "motivo": ""},
    )
    assert resposta_avaliar.status_code == 200

    resposta_auditoria = client.get("/cliente/api/auditoria")
    assert resposta_auditoria.status_code == 200
    itens = resposta_auditoria.json()["itens"]
    acoes = {item["acao"] for item in itens}
    assert {
        "chat_laudo_criado",
        "chat_mensagem_enviada",
        "chat_laudo_reaberto",
        "mesa_resposta_enviada",
        "mesa_laudo_avaliado",
    }.issubset(acoes)

    registro_chat = next(item for item in itens if item["acao"] == "chat_mensagem_enviada")
    assert int(registro_chat["payload"]["laudo_id"]) == laudo_chat_id
    assert registro_chat["payload"]["modo"] == "detalhado"

    registro_mesa = next(item for item in itens if item["acao"] == "mesa_laudo_avaliado")
    assert int(registro_mesa["payload"]["laudo_id"]) == laudo_mesa_id
    assert registro_mesa["payload"]["acao"] == "aprovar"


def test_admin_cliente_resumo_empresa_explica_capacidade_e_upgrade_sugerido(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    with SessionLocal() as banco:
        _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta_plano = client.patch(
        "/cliente/api/empresa/plano",
        headers={"X-CSRF-Token": csrf},
        json={"plano": "Inicial"},
    )
    assert resposta_plano.status_code == 200

    resposta = client.get("/cliente/api/empresa/resumo")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["plano_ativo"] == "Inicial"
    assert corpo["usuarios_em_uso"] == 3
    assert corpo["usuarios_max"] == 1
    assert corpo["usuarios_restantes"] == 0
    assert corpo["usuarios_excedente"] == 2
    assert corpo["laudos_mes_atual"] == 2
    assert corpo["laudos_mes_limite"] == 50
    assert corpo["laudos_restantes"] == 48
    assert corpo["capacidade_status"] == "critico"
    assert corpo["capacidade_tone"] == "ajustes"
    assert corpo["capacidade_gargalo"] == "usuarios"
    assert corpo["plano_sugerido"] == "Intermediario"
    assert "usuarios" in corpo["plano_sugerido_motivo"].lower()
    assert any(item["plano"] == "Intermediario" and item["sugerido"] is True for item in corpo["planos_catalogo"])
    assert any(item["canal"] == "admin" and "acessos" in item["badge"].lower() for item in corpo["avisos_operacionais"])
    saude = corpo["saude_operacional"]
    assert saude["historico_mensal"]
    assert saude["historico_diario"]
    assert saude["mix_equipe"]["inspetores"] >= 1
    assert saude["usuarios_ativos_total"] >= 1
    assert saude["status"]
    assert saude["tendencia_rotulo"]


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
    assert "Biblioteca Profissional de Templates" in resposta.text
    assert "Criar seu modelo" in resposta.text
    assert "Templates da Empresa" in resposta.text
    assert 'name="csrf-token"' in resposta.text


def test_revisor_tela_editor_word_templates_abre(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    _login_revisor(client, "revisor@empresa-a.test")

    resposta = client.get("/revisao/templates-laudo/editor")

    assert resposta.status_code == 200
    assert "Editor Word" in resposta.text
    assert "Workspace Word de Templates" in resposta.text
    assert "Criar no Word (A4)" in resposta.text


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


def test_revisor_criar_template_editor_rico_e_detalhar(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_criar = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={
            "X-CSRF-Token": csrf,
            "Content-Type": "application/json",
        },
        json={
            "nome": "Template Word Tariel.ia",
            "codigo_template": "rti_word",
            "versao": 1,
            "origem_modo": "a4",
        },
    )

    assert resposta_criar.status_code == 201
    corpo_criar = resposta_criar.json()
    template_id = int(corpo_criar["id"])
    assert corpo_criar["modo_editor"] == "editor_rico"
    assert corpo_criar["is_editor_rico"] is True

    resposta_editor = client.get(f"/revisao/api/templates-laudo/editor/{template_id}")
    assert resposta_editor.status_code == 200
    corpo_editor = resposta_editor.json()
    assert int(corpo_editor["id"]) == template_id
    assert corpo_editor["modo_editor"] == "editor_rico"
    assert isinstance(corpo_editor.get("documento_editor_json"), dict)
    assert isinstance(corpo_editor.get("estilo_json"), dict)

    resposta_lista = client.get("/revisao/api/templates-laudo")
    assert resposta_lista.status_code == 200
    itens = resposta_lista.json().get("itens", [])
    encontrado = next((it for it in itens if int(it["id"]) == template_id), None)
    assert encontrado is not None
    assert encontrado["is_editor_rico"] is True


def test_revisor_salvar_e_preview_template_editor_rico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_criar = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template Word Preview",
            "codigo_template": "word_preview",
            "versao": 2,
            "origem_modo": "a4",
        },
    )
    assert resposta_criar.status_code == 201
    template_id = int(resposta_criar.json()["id"])

    resposta_salvar = client.put(
        f"/revisao/api/templates-laudo/editor/{template_id}",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template Word Preview Atualizado",
            "documento_editor_json": {
                "version": 1,
                "doc": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": "Empresa: {{json_path:informacoes_gerais.local_inspecao}}"},
                            ],
                        },
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": "Cliente: {{token:cliente_nome}}"},
                            ],
                        },
                    ],
                },
            },
            "estilo_json": {
                "cabecalho_texto": "Tariel.ia {{token:cliente_nome}}",
                "rodape_texto": "Revisão Técnica",
                "marca_dagua": {"texto": "CONFIDENCIAL", "opacity": 0.08},
                "pagina": {"margens_mm": {"top": 18, "right": 14, "bottom": 18, "left": 14}},
            },
        },
    )
    assert resposta_salvar.status_code == 200
    assert resposta_salvar.json()["nome"] == "Template Word Preview Atualizado"

    resposta_preview = client.post(
        f"/revisao/api/templates-laudo/editor/{template_id}/preview",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "dados_formulario": {
                "informacoes_gerais": {"local_inspecao": "Planta Sul"},
                "tokens": {"cliente_nome": "Cliente XPTO"},
            }
        },
    )
    assert resposta_preview.status_code == 200
    assert "application/pdf" in (resposta_preview.headers.get("content-type", "").lower())
    assert resposta_preview.content.startswith(b"%PDF")
    assert len(resposta_preview.content) > 300


def test_revisor_preview_template_editor_rico_fallback_playwright(ambiente_critico, monkeypatch) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_criar = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template Word Fallback Preview",
            "codigo_template": "word_preview_fallback",
            "versao": 3,
            "origem_modo": "a4",
        },
    )
    assert resposta_criar.status_code == 201
    template_id = int(resposta_criar.json()["id"])

    async def _playwright_falha(**_kwargs):
        raise RuntimeError("Falha forçada do Playwright")

    monkeypatch.setattr(
        "nucleo.template_editor_word.gerar_pdf_html_playwright",
        _playwright_falha,
    )

    resposta_preview = client.post(
        f"/revisao/api/templates-laudo/editor/{template_id}/preview",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={"dados_formulario": {"tokens": {"cliente_nome": "Fallback"}}},
    )

    assert resposta_preview.status_code == 200
    assert "application/pdf" in (resposta_preview.headers.get("content-type", "").lower())
    assert resposta_preview.content.startswith(b"%PDF")


def test_revisor_upload_asset_template_editor_rico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_criar = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template Word Asset",
            "codigo_template": "word_asset",
            "versao": 1,
            "origem_modo": "a4",
        },
    )
    assert resposta_criar.status_code == 201
    template_id = int(resposta_criar.json()["id"])

    resposta_asset = client.post(
        f"/revisao/api/templates-laudo/editor/{template_id}/assets",
        headers={"X-CSRF-Token": csrf},
        data={"csrf_token": csrf},
        files={"arquivo": ("logo.png", _imagem_png_bytes_teste(), "image/png")},
    )
    assert resposta_asset.status_code == 201
    asset = resposta_asset.json()["asset"]
    assert asset["id"]
    assert asset["src"].startswith("asset://")

    resposta_baixar_asset = client.get(
        f"/revisao/api/templates-laudo/editor/{template_id}/assets/{asset['id']}"
    )
    assert resposta_baixar_asset.status_code == 200
    assert "image/png" in (resposta_baixar_asset.headers.get("content-type", "").lower())


def test_revisor_criar_template_editor_rejeita_ativo_inteiro_por_contrato(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template Word Estrito",
            "codigo_template": "word_estrito",
            "versao": 1,
            "origem_modo": "a4",
            "ativo": 0,
        },
    )

    assert resposta.status_code == 422


def test_revisor_upload_template_rejeita_bool_form_invalido(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Template Bool Invalido",
            "codigo_template": "bool_invalido",
            "versao": "1",
            "ativo": "0",
        },
        files={
            "arquivo_base": ("bool_invalido.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )

    assert resposta.status_code == 422


def test_revisor_publicar_template_editor_rico_desativa_ativo_anterior(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_v1 = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Word RTI v1",
            "codigo_template": "word_rti",
            "versao": 1,
            "origem_modo": "a4",
            "ativo": True,
        },
    )
    assert resposta_v1.status_code == 201
    id_v1 = int(resposta_v1.json()["id"])

    resposta_v2 = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Word RTI v2",
            "codigo_template": "word_rti",
            "versao": 2,
            "origem_modo": "a4",
        },
    )
    assert resposta_v2.status_code == 201
    id_v2 = int(resposta_v2.json()["id"])

    resposta_publicar = client.post(
        f"/revisao/api/templates-laudo/editor/{id_v2}/publicar",
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
        assert str(template_v2.modo_editor) == "editor_rico"
        assert str(template_v2.arquivo_pdf_base).lower().endswith(".pdf")
        assert os.path.isfile(str(template_v2.arquivo_pdf_base))


def test_revisor_editor_rico_respeita_isolamento_multiempresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        template_b = TemplateLaudo(
            empresa_id=ids["empresa_b"],
            criado_por_id=ids["inspetor_b"],
            nome="Template B",
            codigo_template="word_b",
            versao=1,
            ativo=True,
            modo_editor="editor_rico",
            arquivo_pdf_base=_salvar_pdf_temporario_teste("word_b"),
            mapeamento_campos_json={},
            documento_editor_json={"version": 1, "doc": {"type": "doc", "content": []}},
            assets_json=[],
            estilo_json={},
        )
        banco.add(template_b)
        banco.commit()
        banco.refresh(template_b)
        template_id_b = int(template_b.id)

    resposta = client.get(f"/revisao/api/templates-laudo/editor/{template_id_b}", headers={"X-CSRF-Token": csrf})
    assert resposta.status_code == 404


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


def test_api_gerar_pdf_usa_template_editor_rico_ativo(ambiente_critico) -> None:
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
            "informacoes_gerais": {"local_inspecao": "Planta Leste"},
            "tokens": {"cliente_nome": "Cliente Tariel"},
        }

        banco.add(
            TemplateLaudo(
                empresa_id=ids["empresa_a"],
                criado_por_id=ids["revisor_a"],
                nome="Template Word Ativo",
                codigo_template="cbmgo_cmar",
                versao=5,
                ativo=True,
                modo_editor="editor_rico",
                arquivo_pdf_base=_salvar_pdf_temporario_teste("word_ativo"),
                mapeamento_campos_json={},
                documento_editor_json={
                    "version": 1,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Cliente {{token:cliente_nome}}"}],
                            },
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Local {{json_path:informacoes_gerais.local_inspecao}}"}],
                            },
                        ],
                    },
                },
                assets_json=[],
                estilo_json={"cabecalho_texto": "Tariel.ia", "rodape_texto": "Mesa"},
            )
        )
        banco.commit()

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Diagnóstico editor rico.",
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
    assert "cbmgo_cmar_v5" in str(resposta.headers.get("content-disposition", "")).lower()


def test_api_gerar_pdf_fallback_legacy_quando_render_rico_falha(ambiente_critico, monkeypatch) -> None:
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
        laudo.dados_formulario = {"tokens": {"cliente_nome": "Fallback Geral"}}

        banco.add(
            TemplateLaudo(
                empresa_id=ids["empresa_a"],
                criado_por_id=ids["revisor_a"],
                nome="Template Word Com Falha",
                codigo_template="cbmgo_cmar",
                versao=6,
                ativo=True,
                modo_editor="editor_rico",
                arquivo_pdf_base=_salvar_pdf_temporario_teste("word_falha"),
                mapeamento_campos_json={},
                documento_editor_json={
                    "version": 1,
                    "doc": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Teste"}]}]},
                },
                assets_json=[],
                estilo_json={},
            )
        )
        banco.commit()

    async def _falha_render(**_kwargs):
        raise RuntimeError("Falha forçada no render rico")

    monkeypatch.setattr("app.domains.chat.chat.gerar_pdf_editor_rico_bytes", _falha_render)

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Diagnóstico fallback por falha no render rico.",
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


def test_status_relatorio_retorna_405_em_delete_sem_cair_na_rota_dinamica(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.delete("/app/api/laudo/status", follow_redirects=False)

    assert resposta.status_code == 405
    assert resposta.json()["detail"] == "Method Not Allowed"
    assert resposta.headers.get("allow") == "GET"


def test_rotas_estaticas_laudo_retorna_405_em_delete_sem_cair_na_rota_dinamica(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_app_inspetor(client, "inspetor@empresa-a.test")

    for rota in (
        "/app/api/laudo/iniciar",
        "/app/api/laudo/cancelar",
        "/app/api/laudo/desativar",
    ):
        resposta = client.delete(rota, follow_redirects=False)
        assert resposta.status_code == 405
        assert resposta.json()["detail"] == "Method Not Allowed"
        assert resposta.headers.get("allow") == "POST"


def test_rotas_estaticas_pendencias_retorna_405_em_patch_sem_cair_na_rota_dinamica(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_app_inspetor(client, "inspetor@empresa-a.test")

    for rota, allow in (
        ("/app/api/laudo/1/pendencias/marcar-lidas", "POST"),
        ("/app/api/laudo/1/pendencias/exportar-pdf", "GET"),
    ):
        resposta = client.patch(rota, follow_redirects=False)
        assert resposta.status_code == 405
        assert resposta.json()["detail"] == "Method Not Allowed"
        assert resposta.headers.get("allow") == allow


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


def test_iniciar_relatorio_sem_tipo_assume_padrao_por_resiliencia(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/laudo/iniciar",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["success"] is True
    assert corpo["tipo_template"] == "padrao"
    assert corpo["message"].startswith("✅ Inspeção Inspeção Geral")


def test_iniciar_relatorio_com_campo_vazio_assume_padrao_por_resiliencia(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/laudo/iniciar",
        data={"tipotemplate": ""},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["success"] is True
    assert corpo["tipo_template"] == "padrao"


def test_relatorio_so_fica_ativo_apos_primeira_interacao_no_chat(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    iniciar = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "padrao"},
        headers={"X-CSRF-Token": csrf},
    )
    assert iniciar.status_code == 200
    corpo_inicio = iniciar.json()
    laudo_id = int(corpo_inicio["laudo_id"])
    assert corpo_inicio["estado"] == "sem_relatorio"

    status_antes = client.get("/app/api/laudo/status")
    assert status_antes.status_code == 200
    assert status_antes.json()["estado"] == "sem_relatorio"
    assert status_antes.json()["laudo_id"] is None

    class ClienteIAStub:
        def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
            yield "Resposta técnica inicial para ativar o laudo.\n"

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta_chat = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Primeira interação real com a IA.",
                "historico": [],
                "laudo_id": laudo_id,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta_chat.status_code == 200
    assert "text/event-stream" in (resposta_chat.headers.get("content-type", "").lower())

    status_depois = client.get("/app/api/laudo/status")
    assert status_depois.status_code == 200
    assert status_depois.json()["estado"] == "relatorio_ativo"
    assert int(status_depois.json()["laudo_id"]) == laudo_id


def test_home_nao_exibe_rascunho_sem_interacao_na_sidebar(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    iniciar = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "padrao"},
        headers={"X-CSRF-Token": csrf},
    )
    assert iniciar.status_code == 200
    laudo_id = int(iniciar.json()["laudo_id"])

    home = client.get("/app/", follow_redirects=False)

    assert home.status_code == 200
    assert f'data-laudo-id="{laudo_id}"' not in home.text
    assert "Nenhum laudo ainda" in home.text


def test_multiplos_laudos_abertos_aceitam_mensagens_em_paralelo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    iniciar_a = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "padrao"},
        headers={"X-CSRF-Token": csrf},
    )
    iniciar_b = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "avcb"},
        headers={"X-CSRF-Token": csrf},
    )
    assert iniciar_a.status_code == 200
    assert iniciar_b.status_code == 200
    laudo_a = int(iniciar_a.json()["laudo_id"])
    laudo_b = int(iniciar_b.json()["laudo_id"])

    class ClienteIAStub:
        def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
            yield "Resposta técnica em paralelo.\n"

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta_a_1 = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Primeira conversa do laudo A.",
                "historico": [],
                "laudo_id": laudo_a,
            },
        )
        resposta_b_1 = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Primeira conversa do laudo B.",
                "historico": [],
                "laudo_id": laudo_b,
            },
        )
        resposta_a_2 = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Segunda conversa do laudo A.",
                "historico": [],
                "laudo_id": laudo_a,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta_a_1.status_code == 200
    assert resposta_b_1.status_code == 200
    assert resposta_a_2.status_code == 200
    assert "Use apenas o relatório ativo" not in resposta_a_2.text

    with SessionLocal() as banco:
        laudo_a_db = banco.get(Laudo, laudo_a)
        laudo_b_db = banco.get(Laudo, laudo_b)
        assert laudo_a_db is not None
        assert laudo_b_db is not None
        assert laudo_a_db.status_revisao == StatusRevisao.RASCUNHO.value
        assert laudo_b_db.status_revisao == StatusRevisao.RASCUNHO.value
        assert (
            banco.query(MensagemLaudo)
            .filter(MensagemLaudo.laudo_id == laudo_a)
            .count()
        ) >= 4
        assert (
            banco.query(MensagemLaudo)
            .filter(MensagemLaudo.laudo_id == laudo_b)
            .count()
        ) >= 2


def test_inspetor_atualiza_perfil_chat_com_sucesso(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.put(
        "/app/api/perfil",
        headers={"X-CSRF-Token": csrf},
        json={
            "nome_completo": "Inspetor A Atualizado",
            "email": "inspetor@empresa-a.test",
            "telefone": "(16) 99999-0001",
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["ok"] is True
    assert corpo["perfil"]["nome_completo"] == "Inspetor A Atualizado"
    assert corpo["perfil"]["telefone"] == "(16) 99999-0001"

    with SessionLocal() as banco:
        usuario = banco.get(Usuario, ids["inspetor_a"])
        assert usuario is not None
        assert usuario.nome_completo == "Inspetor A Atualizado"
        assert usuario.telefone == "(16) 99999-0001"


def test_inspetor_upload_foto_perfil_rejeita_mime_invalido(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/perfil/foto",
        headers={"X-CSRF-Token": csrf},
        files={"foto": ("perfil.txt", b"arquivo-invalido", "text/plain")},
    )

    assert resposta.status_code == 415
    assert "Formato inválido" in resposta.text


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


def test_revisor_painel_abre_com_laudo_aguardando_sem_atualizado_em(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Laudo aguardando avaliação sem atualização manual."
        laudo.atualizado_em = None
        banco.commit()

    painel = client.get("/revisao/painel")

    assert painel.status_code == 200
    assert "Aguardando Avaliação" in painel.text
    assert "Laudo aguardando avaliação sem atualização manual." in painel.text


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
    assert corpo["roteiro_template"]["titulo"] == "Roteiro obrigatório do template"
    assert isinstance(corpo["roteiro_template"]["itens"], list)
    assert len(corpo["roteiro_template"]["itens"]) >= 5


def test_inspetor_gate_qualidade_cbmgo_expoe_roteiro_com_formulario(ambiente_critico) -> None:
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
            tipo_template="cbmgo",
        )

    resposta = client.get(
        f"/app/api/laudo/{laudo_id}/gate-qualidade",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["tipo_template"] == "cbmgo"
    faltantes_ids = {item["id"] for item in corpo["faltantes"]}
    assert "formulario_estruturado" in faltantes_ids

    roteiro_ids = {item["id"] for item in corpo["roteiro_template"]["itens"]}
    assert "roteiro_formulario_estruturado" in roteiro_ids
    assert "cbmgo_formulario_estruturado" in roteiro_ids


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


def test_api_chat_avisa_mesa_em_linguagem_natural_dispara_whisper(ambiente_critico) -> None:
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
            "mensagem": "Avise a mesa avaliadora que terminei a inspeção da NR10.",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    assert "text/event-stream" in (resposta.headers.get("content-type", "").lower())
    assert "terminei a inspeção da NR10" in resposta.text

    with SessionLocal() as banco:
        ultima = (
            banco.query(MensagemLaudo)
            .filter(MensagemLaudo.laudo_id == laudo_id)
            .order_by(MensagemLaudo.id.desc())
            .first()
        )
        assert ultima is not None
        assert ultima.tipo == TipoMensagem.HUMANO_INSP.value
        assert "terminei a inspeção da NR10" in ultima.conteudo


def test_api_chat_avisa_mesa_sem_texto_util_retorna_400(ambiente_critico) -> None:
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
            "mensagem": "Avise a mesa avaliadora",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Mensagem para a mesa está vazia."


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


def test_inspetor_envia_anexo_para_mesa_e_download_fica_protegido(ambiente_critico) -> None:
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
        f"/app/api/laudo/{laudo_id}/mesa/anexo",
        headers={"X-CSRF-Token": csrf},
        data={"texto": "Foto da proteção lateral anexada."},
        files={"arquivo": ("protecao.png", _imagem_png_bytes_teste(), "image/png")},
    )

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["mensagem"]["tipo"] == TipoMensagem.HUMANO_INSP.value
    assert "Foto da proteção lateral" in corpo["mensagem"]["texto"]
    assert len(corpo["mensagem"]["anexos"]) == 1
    anexo = corpo["mensagem"]["anexos"][0]
    assert anexo["nome"] == "protecao.png"
    assert anexo["categoria"] == "imagem"
    assert anexo["eh_imagem"] is True
    assert anexo["url"].endswith(f"/app/api/laudo/{laudo_id}/mesa/anexos/{anexo['id']}")

    resposta_lista = client.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")
    assert resposta_lista.status_code == 200
    itens = resposta_lista.json()["itens"]
    assert itens[-1]["anexos"][0]["nome"] == "protecao.png"

    resposta_download = client.get(anexo["url"])
    assert resposta_download.status_code == 200
    assert resposta_download.content == _imagem_png_bytes_teste()
    assert "image/png" in resposta_download.headers.get("content-type", "").lower()

    with SessionLocal() as banco:
        anexo_db = banco.get(AnexoMesa, int(anexo["id"]))
        assert anexo_db is not None
        assert anexo_db.laudo_id == laudo_id
        assert anexo_db.mensagem_id > 0
        assert anexo_db.categoria == "imagem"
        assert os.path.isfile(str(anexo_db.caminho_arquivo))


def test_mesa_anexo_multipart_invalido_retorna_422_json_serializavel(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    boundary = "mesa-malformado"
    corpo = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="arquivo"\r\n\r\n\r\n'
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="referencia_mensagem_id"; filename="referencia_mensagem_id"\r\n\r\nNone\r\n'
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="texto"\r\n\r\n\r\n'
        f"--{boundary}--\r\n"
    ).encode("utf-8")

    resposta = client.post(
        "/app/api/laudo/0/mesa/anexo",
        headers={
            "X-CSRF-Token": csrf,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        content=corpo,
    )

    assert resposta.status_code == 422
    detalhe = resposta.json()["detail"]
    assert isinstance(detalhe, list)
    assert detalhe[0]["loc"][0] == "body"
    assert detalhe[1]["input"]["__type__"] == "UploadFile"
    assert detalhe[1]["input"]["filename"] == "referencia_mensagem_id"


def test_primeira_interacao_com_mesa_cria_card_normal_no_historico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    iniciar = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "padrao"},
        headers={"X-CSRF-Token": csrf},
    )
    assert iniciar.status_code == 200
    laudo_id = int(iniciar.json()["laudo_id"])

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf},
        json={"texto": "Mesa, validar item estrutural antes da vistoria final."},
    )

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["estado"] == "relatorio_ativo"
    assert corpo["laudo_card"]["id"] == laudo_id
    assert corpo["laudo_card"]["status_card"] == "aberto"

    home = client.get("/app/", follow_redirects=False)
    assert home.status_code == 200
    assert f'data-laudo-id="{laudo_id}"' in home.text

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.primeira_mensagem == "Mesa, validar item estrutural antes da vistoria final."


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
    assert itens[-1]["lida"] is False
    assert itens[-1]["resolvida_por_nome"] == ""
    assert itens[-1]["resolvida_em"] == ""


def test_revisor_responde_com_anexo_e_inspetor_recebe_no_canal_mesa(ambiente_critico) -> None:
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
        f"/revisao/api/laudo/{laudo_id}/responder-anexo",
        headers={"X-CSRF-Token": csrf_revisor},
        data={"texto": "Segue checklist complementar da mesa."},
        files={"arquivo": ("checklist.pdf", _pdf_base_bytes_teste(), "application/pdf")},
    )
    assert resposta_revisor.status_code == 200
    corpo_revisor = resposta_revisor.json()
    assert corpo_revisor["success"] is True
    assert corpo_revisor["mensagem"]["anexos"][0]["nome"] == "checklist.pdf"
    assert corpo_revisor["mensagem"]["anexos"][0]["categoria"] == "documento"

    with TestClient(main.app) as client_inspetor:
        _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")
        resposta_mesa = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")

    assert resposta_mesa.status_code == 200
    itens = resposta_mesa.json()["itens"]
    assert itens[-1]["tipo"] == TipoMensagem.HUMANO_ENG.value
    assert itens[-1]["anexos"][0]["nome"] == "checklist.pdf"

    resposta_download = client_inspetor.get(itens[-1]["anexos"][0]["url"])
    assert resposta_download.status_code == 200
    assert resposta_download.content.startswith(b"%PDF")
    assert "application/pdf" in resposta_download.headers.get("content-type", "").lower()


def test_laudo_com_ajustes_exige_reabertura_manual_para_chat_e_mesa(ambiente_critico) -> None:
    client_inspetor = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_inspetor = _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.encerrado_pelo_inspetor_em = datetime.now(timezone.utc)
        laudo.primeira_mensagem = "Inspeção encerrada e enviada para a mesa."
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["inspetor_a"],
                tipo=TipoMensagem.USER.value,
                conteudo="Coleta concluída em campo.",
                custo_api_reais=Decimal("0.0000"),
            )
        )
        banco.commit()

    with TestClient(main.app) as client_revisor:
        csrf_revisor = _login_revisor(client_revisor, "revisor@empresa-a.test")
        resposta_revisor = client_revisor.post(
            f"/revisao/api/laudo/{laudo_id}/responder",
            headers={"X-CSRF-Token": csrf_revisor},
            json={"texto": "Mesa: complementar foto da proteção lateral."},
        )

    assert resposta_revisor.status_code == 200
    assert resposta_revisor.json()["success"] is True

    resposta_mensagens = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mensagens")
    assert resposta_mensagens.status_code == 200
    corpo_mensagens = resposta_mensagens.json()
    assert corpo_mensagens["estado"] == "ajustes"
    assert corpo_mensagens["permite_reabrir"] is True
    assert corpo_mensagens["laudo_card"]["status_card"] == "ajustes"

    status = client_inspetor.get("/app/api/laudo/status")
    assert status.status_code == 200
    corpo_status = status.json()
    assert corpo_status["estado"] == "ajustes"
    assert corpo_status["permite_reabrir"] is True
    assert corpo_status["laudo_card"]["status_card"] == "ajustes"

    resposta_chat_bloqueado = client_inspetor.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf_inspetor},
        json={
            "mensagem": "Quero continuar o laudo sem reabrir.",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )
    assert resposta_chat_bloqueado.status_code == 400
    assert "reaberto" in resposta_chat_bloqueado.json()["detail"].lower()

    resposta_mesa_bloqueada = client_inspetor.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf_inspetor},
        json={"texto": "Respondendo a mesa sem reabrir."},
    )
    assert resposta_mesa_bloqueada.status_code == 400
    assert "reaberto" in resposta_mesa_bloqueada.json()["detail"].lower()

    resposta_reabrir = client_inspetor.post(
        f"/app/api/laudo/{laudo_id}/reabrir",
        headers={"X-CSRF-Token": csrf_inspetor},
    )
    assert resposta_reabrir.status_code == 200
    corpo_reabrir = resposta_reabrir.json()
    assert corpo_reabrir["estado"] == "relatorio_ativo"
    assert corpo_reabrir["permite_reabrir"] is False
    assert corpo_reabrir["laudo_card"]["status_card"] == "aberto"

    class ClienteIAStub:
        def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
            yield "Laudo reaberto e pronto para complementação.\n"

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta_chat_ok = client_inspetor.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf_inspetor},
            json={
                "mensagem": "Agora sim, complementando após reabrir.",
                "historico": [],
                "laudo_id": laudo_id,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta_chat_ok.status_code == 200
    assert "text/event-stream" in (resposta_chat_ok.headers.get("content-type", "").lower())

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.RASCUNHO.value
        assert laudo.reabertura_pendente_em is None
        assert laudo.reaberto_em is not None


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


def test_inspetor_pendencias_rejeita_parametro_extra_com_formato_padrao_422(ambiente_critico) -> None:
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

    resposta = client.get(
        f"/app/api/laudo/{laudo_id}/pendencias?x-schemathesis-unknown-property=42"
    )

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert isinstance(corpo["detail"], list)
    assert corpo["detail"][0]["loc"] == ["query", "x-schemathesis-unknown-property"]
    assert corpo["detail"][0]["msg"] == "Extra inputs are not permitted"
    assert corpo["detail"][0]["type"] == "extra_forbidden"


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
    assert "CARIMBO DIGITAL TARIEL.IA" in texto_pdf_maiusculo
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


def test_revisor_rejeitar_via_api_com_header_sem_motivo_assume_padrao(ambiente_critico) -> None:
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
        data={"acao": "rejeitar", "motivo": "", "csrf_token": ""},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["success"] is True
    assert corpo["acao"] == "rejeitar"
    assert corpo["motivo"] == "Devolvido pela mesa sem motivo detalhado."

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.REJEITADO.value
        assert laudo.motivo_rejeicao == "Devolvido pela mesa sem motivo detalhado."


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


def test_admin_detalhe_empresa_exibe_admins_cliente_e_revisores(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    ids = ambiente_critico["ids"]

    _login_admin(client, "admin@empresa-a.test")

    resposta = client.get(f"/admin/clientes/{ids['empresa_a']}")

    assert resposta.status_code == 200
    assert "Admins-Cliente" in resposta.text
    assert "cliente@empresa-a.test" in resposta.text
    assert "Revisor A" in resposta.text


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


def test_revisor_api_pacote_mesa_consolida_resumo_e_pendencias(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        agora = datetime.now(timezone.utc)
        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="Descrição técnica da inspeção de campo.",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="[imagem]",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="documento: checklist_nr12.pdf",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.HUMANO_INSP.value,
                    conteudo="[@mesa] preciso validar um ponto de segurança.",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.IA.value,
                    conteudo="Análise preliminar da IA com riscos mapeados.",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência aberta: enviar foto detalhada do quadro.",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência resolvida: evidência validada.",
                    lida=True,
                    resolvida_por_id=ids["revisor_a"],
                    resolvida_em=agora,
                    custo_api_reais=Decimal("0.0000"),
                ),
                LaudoRevisao(
                    laudo_id=laudo_id,
                    numero_versao=1,
                    origem="ia",
                    resumo="Rascunho inicial da IA",
                    conteudo="Conteúdo da versão inicial",
                    confianca_geral="media",
                ),
                LaudoRevisao(
                    laudo_id=laudo_id,
                    numero_versao=2,
                    origem="mesa",
                    resumo="Ajustes da engenharia",
                    conteudo="Conteúdo revisado com ajustes",
                    confianca_geral="alta",
                ),
            ]
        )
        banco.commit()

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert int(corpo["laudo_id"]) == laudo_id

    resumo_mensagens = corpo["resumo_mensagens"]
    assert int(resumo_mensagens["total"]) == 7
    assert int(resumo_mensagens["inspetor"]) == 4
    assert int(resumo_mensagens["ia"]) == 1
    assert int(resumo_mensagens["mesa"]) == 2

    resumo_evidencias = corpo["resumo_evidencias"]
    assert int(resumo_evidencias["total"]) == 3
    assert int(resumo_evidencias["textuais"]) == 1
    assert int(resumo_evidencias["fotos"]) == 1
    assert int(resumo_evidencias["documentos"]) == 1

    resumo_pendencias = corpo["resumo_pendencias"]
    assert int(resumo_pendencias["total"]) == 2
    assert int(resumo_pendencias["abertas"]) == 1
    assert int(resumo_pendencias["resolvidas"]) == 1

    assert len(corpo["pendencias_abertas"]) == 1
    assert len(corpo["pendencias_resolvidas_recentes"]) == 1
    assert corpo["pendencias_resolvidas_recentes"][0]["resolvida_por_nome"] == "Revisor A"
    assert len(corpo["whispers_recentes"]) == 3
    assert len(corpo["revisoes_recentes"]) == 2


def test_revisor_api_pacote_mesa_serializa_anexos_por_mensagem(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    caminho_anexo = os.path.join(tempfile.gettempdir(), f"mesa_pkg_{uuid.uuid4().hex[:8]}.pdf")
    with open(caminho_anexo, "wb") as arquivo:
        arquivo.write(_pdf_base_bytes_teste())

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        mensagem = MensagemLaudo(
            laudo_id=laudo_id,
            remetente_id=ids["revisor_a"],
            tipo=TipoMensagem.HUMANO_ENG.value,
            conteudo="[ANEXO_MESA_SEM_TEXTO]",
            custo_api_reais=Decimal("0.0000"),
        )
        banco.add(mensagem)
        banco.flush()
        banco.add(
            AnexoMesa(
                laudo_id=laudo_id,
                mensagem_id=mensagem.id,
                enviado_por_id=ids["revisor_a"],
                nome_original="complemento.pdf",
                nome_arquivo="complemento.pdf",
                mime_type="application/pdf",
                categoria="documento",
                tamanho_bytes=len(_pdf_base_bytes_teste()),
                caminho_arquivo=caminho_anexo,
            )
        )
        banco.commit()

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert len(corpo["pendencias_abertas"]) == 1
    assert corpo["pendencias_abertas"][0]["texto"] == ""
    assert corpo["pendencias_abertas"][0]["anexos"][0]["nome"] == "complemento.pdf"
    assert corpo["pendencias_abertas"][0]["anexos"][0]["categoria"] == "documento"


def test_revisor_api_mensagens_e_completo_aceitam_cursor_nullish(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

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
                tipo=TipoMensagem.USER.value,
                conteudo="Mensagem seed para histórico do revisor.",
                custo_api_reais=Decimal("0.0000"),
            )
        )
        banco.commit()

    _login_revisor(client, "revisor@empresa-a.test")

    resposta_mensagens = client.get(f"/revisao/api/laudo/{laudo_id}/mensagens?cursor=null")
    assert resposta_mensagens.status_code == 200
    assert resposta_mensagens.json()["laudo_id"] == laudo_id

    resposta_completo = client.get(
        f"/revisao/api/laudo/{laudo_id}/completo?incluir_historico=true&cursor=null"
    )
    assert resposta_completo.status_code == 200
    assert int(resposta_completo.json()["id"]) == laudo_id


def test_revisor_api_pacote_rejeita_parametro_extra_com_formato_padrao_422(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote?x-schemathesis-unknown-property=42")

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert isinstance(corpo["detail"], list)
    assert corpo["detail"][0]["loc"] == ["query", "x-schemathesis-unknown-property"]
    assert corpo["detail"][0]["msg"] == "Extra inputs are not permitted"
    assert corpo["detail"][0]["type"] == "extra_forbidden"


def test_revisor_pode_resolver_e_reabrir_pendencia_da_mesa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

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
            conteudo="Pendência aberta para validar aterramento.",
            lida=False,
            custo_api_reais=Decimal("0.0000"),
        )
        banco.add(msg)
        banco.commit()
        banco.refresh(msg)
        mensagem_id = int(msg.id)

    resposta_resolver = client.patch(
        f"/revisao/api/laudo/{laudo_id}/pendencias/{mensagem_id}",
        json={"lida": True},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta_resolver.status_code == 200
    corpo_resolver = resposta_resolver.json()
    assert corpo_resolver["success"] is True
    assert corpo_resolver["lida"] is True
    assert corpo_resolver["resolvida_por_id"] == ids["revisor_a"]
    assert corpo_resolver["resolvida_por_nome"] == "Revisor A"
    assert corpo_resolver["resolvida_em"]
    assert int(corpo_resolver["pendencias_abertas"]) == 0

    with SessionLocal() as banco:
        msg_db = banco.get(MensagemLaudo, mensagem_id)
        assert msg_db is not None
        assert msg_db.lida is True
        assert msg_db.resolvida_por_id == ids["revisor_a"]
        assert msg_db.resolvida_em is not None

    with TestClient(main.app) as client_inspetor:
        _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")
        resposta_mesa_resolvida = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")

    assert resposta_mesa_resolvida.status_code == 200
    item_resolvido = next(
        item for item in resposta_mesa_resolvida.json()["itens"]
        if int(item["id"]) == mensagem_id
    )
    assert item_resolvido["lida"] is True
    assert item_resolvido["resolvida_por_nome"] == "Revisor A"
    assert item_resolvido["resolvida_em"]

    resposta_reabrir = client.patch(
        f"/revisao/api/laudo/{laudo_id}/pendencias/{mensagem_id}",
        json={"lida": False},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta_reabrir.status_code == 200
    corpo_reabrir = resposta_reabrir.json()
    assert corpo_reabrir["success"] is True
    assert corpo_reabrir["lida"] is False
    assert corpo_reabrir["resolvida_por_id"] is None
    assert corpo_reabrir["resolvida_por_nome"] == ""
    assert corpo_reabrir["resolvida_em"] == ""
    assert int(corpo_reabrir["pendencias_abertas"]) == 1

    with SessionLocal() as banco:
        msg_db = banco.get(MensagemLaudo, mensagem_id)
        assert msg_db is not None
        assert msg_db.lida is False
        assert msg_db.resolvida_por_id is None
        assert msg_db.resolvida_em is None

    with TestClient(main.app) as client_inspetor:
        _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")
        resposta_mesa_reaberta = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")

    assert resposta_mesa_reaberta.status_code == 200
    item_reaberto = next(
        item for item in resposta_mesa_reaberta.json()["itens"]
        if int(item["id"]) == mensagem_id
    )
    assert item_reaberto["lida"] is False
    assert item_reaberto["resolvida_por_nome"] == ""
    assert item_reaberto["resolvida_em"] == ""


def test_revisor_marca_whispers_como_lidos_no_servidor(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

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
                    tipo=TipoMensagem.HUMANO_INSP.value,
                    conteudo="Whisper 1",
                    lida=False,
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.HUMANO_INSP.value,
                    conteudo="Whisper 2",
                    lida=False,
                    custo_api_reais=Decimal("0.0000"),
                ),
            ]
        )
        banco.commit()

    resposta = client.post(
        f"/revisao/api/laudo/{laudo_id}/marcar-whispers-lidos",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["success"] is True
    assert int(corpo["marcadas"]) == 2

    with SessionLocal() as banco:
        total_aberto = (
            banco.query(MensagemLaudo)
            .filter(
                MensagemLaudo.laudo_id == laudo_id,
                MensagemLaudo.tipo == TipoMensagem.HUMANO_INSP.value,
                MensagemLaudo.lida.is_(False),
            )
            .count()
        )
        assert total_aberto == 0


def test_revisor_api_pacote_mesa_respeita_isolamento_multiempresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_empresa_b = _criar_laudo(
            banco,
            empresa_id=ids["empresa_b"],
            usuario_id=ids["inspetor_b"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_empresa_b}/pacote")

    assert resposta.status_code == 404


def test_revisor_exportar_pacote_mesa_pdf_retorna_arquivo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        revisor = banco.get(Usuario, ids["revisor_a"])
        assert revisor is not None
        revisor.crea = "987654-SP"

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
                    conteudo="Descricao de campo para consolidacao do pacote.",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendencia aberta para revisar instalacao eletrica.",
                    lida=False,
                    custo_api_reais=Decimal("0.0000"),
                ),
                LaudoRevisao(
                    laudo_id=laudo_id,
                    numero_versao=1,
                    origem="mesa",
                    resumo="Ajuste inicial da mesa",
                    conteudo="Conteudo revisado pela engenharia.",
                    confianca_geral="media",
                    criado_em=datetime.now(timezone.utc),
                ),
            ]
        )
        banco.commit()

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote/exportar-pdf")

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

    assert "PACOTE TECNICO DA MESA AVALIADORA" in texto_pdf_maiusculo
    assert "RESUMO CONSOLIDADO" in texto_pdf_maiusculo
    assert "REVISOR A" in texto_pdf_maiusculo
    assert "987654-SP" in texto_pdf_maiusculo


def test_revisor_exportar_pacote_mesa_pdf_suporta_anexos_nas_pendencias(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    caminho_anexo = os.path.join(tempfile.gettempdir(), f"mesa_pdf_{uuid.uuid4().hex[:8]}.pdf")
    with open(caminho_anexo, "wb") as arquivo:
        arquivo.write(_pdf_base_bytes_teste())

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        mensagem = MensagemLaudo(
            laudo_id=laudo_id,
            remetente_id=ids["revisor_a"],
            tipo=TipoMensagem.HUMANO_ENG.value,
            conteudo="[ANEXO_MESA_SEM_TEXTO]",
            lida=False,
            custo_api_reais=Decimal("0.0000"),
        )
        banco.add(mensagem)
        banco.flush()
        banco.add(
            AnexoMesa(
                laudo_id=laudo_id,
                mensagem_id=mensagem.id,
                enviado_por_id=ids["revisor_a"],
                nome_original="complemento.pdf",
                nome_arquivo="complemento.pdf",
                mime_type="application/pdf",
                categoria="documento",
                tamanho_bytes=os.path.getsize(caminho_anexo),
                caminho_arquivo=caminho_anexo,
            )
        )
        banco.commit()

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote/exportar-pdf")

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert len(resposta.content) > 300


def test_revisor_exportar_pacote_pdf_rejeita_parametro_extra_com_formato_padrao_422(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(
        f"/revisao/api/laudo/{laudo_id}/pacote/exportar-pdf?x-schemathesis-unknown-property=42"
    )

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert isinstance(corpo["detail"], list)
    assert corpo["detail"][0]["loc"] == ["query", "x-schemathesis-unknown-property"]
    assert corpo["detail"][0]["msg"] == "Extra inputs are not permitted"
    assert corpo["detail"][0]["type"] == "extra_forbidden"


def test_revisor_exportar_pacote_pdf_em_modo_schemathesis_retorna_placeholder_estavel(
    ambiente_critico, monkeypatch
) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    monkeypatch.setenv("SCHEMATHESIS_TEST_HINTS", "1")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote/exportar-pdf")

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")


def test_revisor_exportar_pacote_mesa_pdf_respeita_isolamento_multiempresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_empresa_b = _criar_laudo(
            banco,
            empresa_id=ids["empresa_b"],
            usuario_id=ids["inspetor_b"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_empresa_b}/pacote/exportar-pdf")
    assert resposta.status_code == 404
