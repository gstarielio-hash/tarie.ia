from __future__ import annotations

from starlette.requests import Request
from fastapi.responses import JSONResponse

import app.domains.cliente.route_support as route_support
from app.shared.database import NivelAcesso, RegistroAuditoriaEmpresa, Usuario
from app.shared.security import token_esta_ativo
from tests.regras_rotas_criticas_support import _criar_laudo


def _request(path: str = "/cliente/painel", *, session: dict | None = None) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": path,
        "headers": [],
        "query_string": b"",
        "scheme": "http",
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
        "state": {},
        "session": session or {},
    }
    request = Request(scope)
    request.state.csp_nonce = "nonce-teste"
    return request


def test_render_helpers_cliente_aplicam_headers_e_contexto() -> None:
    request = _request("/cliente/login")

    resposta_login = route_support._render_login_cliente(request, erro="Falha no login", status_code=401)
    resposta_troca = route_support._render_troca_senha(request, erro="Senha inválida", status_code=400)

    assert resposta_login.status_code == 401
    assert resposta_login.headers["Cache-Control"] == "no-store, no-cache, must-revalidate, max-age=0"
    assert "Falha no login" in resposta_login.body.decode("utf-8")

    assert resposta_troca.status_code == 400
    assert "Troca Obrigatória de Senha" in resposta_troca.body.decode("utf-8")


def test_sessao_cliente_registra_e_limpa_token(ambiente_critico) -> None:
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    request = _request()

    with SessionLocal() as banco:
        usuario = banco.get(Usuario, ids["admin_cliente_a"])
        assert usuario is not None
        route_support._registrar_sessao_cliente(request, usuario, lembrar=True)

    token = request.session["session_token_cliente"]
    assert request.session["csrf_token"] == request.session["csrf_token_cliente"]
    assert token_esta_ativo(token) is True

    route_support._limpar_sessao_cliente(request)

    assert request.session == {}
    assert token_esta_ativo(token) is False


def test_fluxo_troca_senha_cliente_identifica_usuario_pendente(ambiente_critico) -> None:
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    request = _request()

    with SessionLocal() as banco:
        usuario = banco.get(Usuario, ids["admin_cliente_a"])
        assert usuario is not None
        usuario.senha_temporaria_ativa = True
        banco.commit()

    route_support._iniciar_fluxo_troca_senha(request, usuario_id=ids["admin_cliente_a"], lembrar=True)

    with SessionLocal() as banco:
        usuario_pendente = route_support._usuario_pendente_troca_senha(request, banco)
        assert usuario_pendente is not None
        assert int(usuario_pendente.id) == ids["admin_cliente_a"]

    request.session[route_support.CHAVE_TROCA_SENHA_UID] = "invalido"
    with SessionLocal() as banco:
        assert route_support._usuario_pendente_troca_senha(request, banco) is None

    assert route_support.CHAVE_TROCA_SENHA_UID not in request.session


def test_helpers_cliente_traduzem_erros_payloads_e_urls() -> None:
    assert route_support._mensagem_portal_correto(Usuario(nivel_acesso=NivelAcesso.INSPETOR.value)) == "Este usuário deve acessar /app/login."
    assert route_support._mensagem_portal_correto(Usuario(nivel_acesso=NivelAcesso.REVISOR.value)) == "Este usuário deve acessar /revisao/login."
    assert route_support._mensagem_portal_correto(Usuario(nivel_acesso=NivelAcesso.DIRETORIA.value)) == "Este usuário deve acessar /admin/login."
    assert route_support._mensagem_portal_correto(Usuario(nivel_acesso=NivelAcesso.ADMIN_CLIENTE.value)) == "Acesso negado para este portal."

    assert route_support._validar_nova_senha("", "", "") == "Preencha senha atual, nova senha e confirmação."
    assert route_support._validar_nova_senha("Senha@1", "Nova@1", "Outra@1") == "A confirmação da nova senha não confere."
    assert route_support._validar_nova_senha("Senha@1", "curta", "curta") == "A nova senha deve ter no mínimo 8 caracteres."
    assert (
        route_support._validar_nova_senha("Senha@123", "Senha@123", "Senha@123")
        == "A nova senha deve ser diferente da senha temporária."
    )
    assert route_support._validar_nova_senha("Senha@1", "NovaSenha@123", "NovaSenha@123") == ""

    assert route_support._traduzir_erro_servico_cliente(ValueError("Usuário não encontrado")).status_code == 404
    assert route_support._traduzir_erro_servico_cliente(ValueError("E-mail já cadastrado")).status_code == 409
    assert route_support._traduzir_erro_servico_cliente(ValueError("Operação inválida")).status_code == 400

    payload = {
        "itens": [
            {"anexos": [{"id": 3}, {"id": "x"}, "ignorar"]},
            {"filho": {"anexos": [{"id": 9}]}}
        ]
    }
    ajustado = route_support._rebase_urls_anexos_cliente(payload, laudo_id=55)
    assert ajustado["itens"][0]["anexos"][0]["url"] == "/cliente/api/mesa/laudos/55/anexos/3"
    assert ajustado["itens"][1]["filho"]["anexos"][0]["url"] == "/cliente/api/mesa/laudos/55/anexos/9"

    resposta = JSONResponse({"ok": True, "valor": 1})
    assert route_support._payload_json_resposta(resposta) == {"ok": True, "valor": 1}
    assert route_support._payload_json_resposta(JSONResponse([1, 2, 3])) == {}
    assert route_support._payload_json_resposta(object()) == {}

    assert route_support._resumir_texto_auditoria("texto curto") == "texto curto"
    assert route_support._resumir_texto_auditoria("x" * 200).endswith("...")


def test_titulo_laudo_e_auditoria_cliente(ambiente_critico) -> None:
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        usuario = banco.get(Usuario, ids["admin_cliente_a"])
        assert usuario is not None
        empresa = route_support._empresa_usuario(banco, usuario)
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao="rascunho",
        )

        assert int(empresa.id) == ids["empresa_a"]
        assert route_support._titulo_laudo_cliente(banco, empresa_id=ids["empresa_a"], laudo_id=laudo_id) == "geral"
        assert route_support._titulo_laudo_cliente(banco, empresa_id=ids["empresa_b"], laudo_id=laudo_id) == f"Laudo #{laudo_id}"

        route_support._registrar_auditoria_cliente_segura(
            banco,
            empresa_id=ids["empresa_a"],
            ator_usuario_id=ids["admin_cliente_a"],
            acao="usuario_criado",
            resumo="Usuário criado no portal cliente",
            detalhe="Detalhe complementar",
            alvo_usuario_id=ids["inspetor_a"],
            payload={"origem": "teste"},
        )
        banco.commit()

        auditoria = banco.query(RegistroAuditoriaEmpresa).filter(RegistroAuditoriaEmpresa.empresa_id == ids["empresa_a"]).one()
        assert auditoria.acao == "usuario_criado"
        assert auditoria.resumo == "Usuário criado no portal cliente"
        assert auditoria.payload_json == {"origem": "teste"}
