from __future__ import annotations

from tests.regras_rotas_criticas_support import (
    SENHA_PADRAO,
    _login_admin,
    _login_app_inspetor,
    _login_cliente,
    _login_revisor,
)


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
        "/app/api/mobile/account/profile",
        headers=headers,
        json={
            "nome_completo": "Inspetor Mobile A",
            "email": "inspetor@empresa-a.test",
            "telefone": "(11) 99999-0000",
        },
    )
    assert resposta_perfil.status_code == 200
    assert resposta_perfil.json()["usuario"]["nome_completo"] == "Inspetor Mobile A"

    resposta_suporte = client.post(
        "/app/api/mobile/support/report",
        headers=headers,
        json={
            "tipo": "bug",
            "titulo": "Campo de teste",
            "mensagem": "Fluxo mobile validado via teste automatizado.",
            "email_retorno": "inspetor@empresa-a.test",
            "contexto": "pytest",
            "anexo_nome": "screenshot.png",
        },
    )
    assert resposta_suporte.status_code == 200
    assert resposta_suporte.json()["status"] == "Recebido"

    resposta_senha = client.post(
        "/app/api/mobile/account/password",
        headers=headers,
        json={
            "senha_atual": SENHA_PADRAO,
            "nova_senha": "NovaSenha!123",
            "confirmar_senha": "NovaSenha!123",
        },
    )
    assert resposta_senha.status_code == 200

    resposta_settings_padrao = client.get("/app/api/mobile/account/settings", headers=headers)
    assert resposta_settings_padrao.status_code == 200
    assert resposta_settings_padrao.json()["settings"]["notificacoes"]["som_notificacao"] == "Ping"
    assert resposta_settings_padrao.json()["settings"]["experiencia_ia"]["modelo_ia"] == "equilibrado"

    resposta_settings_salva = client.put(
        "/app/api/mobile/account/settings",
        headers=headers,
        json={
            "notificacoes": {
                "notifica_respostas": False,
                "notifica_push": True,
                "som_notificacao": "Sino curto",
                "vibracao_ativa": False,
                "emails_ativos": True,
            },
            "privacidade": {
                "mostrar_conteudo_notificacao": False,
                "ocultar_conteudo_bloqueado": True,
                "mostrar_somente_nova_mensagem": True,
                "salvar_historico_conversas": False,
                "compartilhar_melhoria_ia": False,
                "retencao_dados": "30 dias",
            },
            "permissoes": {
                "microfone_permitido": True,
                "camera_permitida": True,
                "arquivos_permitidos": False,
                "notificacoes_permitidas": True,
                "biometria_permitida": True,
            },
            "experiencia_ia": {
                "modelo_ia": "avançado",
            },
        },
    )
    assert resposta_settings_salva.status_code == 200
    assert resposta_settings_salva.json()["settings"]["privacidade"]["retencao_dados"] == "30 dias"
    assert resposta_settings_salva.json()["settings"]["experiencia_ia"]["modelo_ia"] == "avançado"

    resposta_settings_lida = client.get("/app/api/mobile/account/settings", headers=headers)
    assert resposta_settings_lida.status_code == 200
    assert resposta_settings_lida.json()["settings"]["notificacoes"]["som_notificacao"] == "Sino curto"
    assert resposta_settings_lida.json()["settings"]["permissoes"]["arquivos_permitidos"] is False
    assert resposta_settings_lida.json()["settings"]["experiencia_ia"]["modelo_ia"] == "avançado"

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
