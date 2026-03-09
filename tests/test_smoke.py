from fastapi.testclient import TestClient
from pathlib import Path

import main


def test_healthcheck_retorna_ok() -> None:
    with TestClient(main.app) as cliente:
        resposta = cliente.get("/health")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "ok"
    assert "versao" in corpo


def test_readiness_retorna_banco_ok() -> None:
    with TestClient(main.app) as cliente:
        resposta = cliente.get("/ready")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["status"] == "ok"
    assert corpo["banco"] == "ok"


def test_raiz_redireciona_para_login_sem_sessao() -> None:
    with TestClient(main.app) as cliente:
        resposta = cliente.get("/", follow_redirects=False)

    assert resposta.status_code in {302, 303, 307}
    assert resposta.headers["location"] == "/app/login"


def test_templates_chat_mantem_controles_essenciais_de_ui() -> None:
    raiz = Path(__file__).resolve().parents[1]
    base_html = (raiz / "templates" / "base.html").read_text(encoding="utf-8")
    index_html = (raiz / "templates" / "index.html").read_text(encoding="utf-8")

    assert 'id="btn-toggle-ui"' in base_html
    assert 'id="icone-toggle-ui"' in base_html

    assert 'class="btn-secundario btn-home-cabecalho"' in index_html
    assert "data-preprompt=" in index_html


def test_template_revisor_aponta_websocket_com_prefixo_revisao() -> None:
    raiz = Path(__file__).resolve().parents[1]
    painel_revisor_html = (raiz / "templates" / "painel_revisor.html").read_text(encoding="utf-8")
    assert "/revisao/ws/whispers" in painel_revisor_html
