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
    assert "/revisao/api/laudo/${state.laudoAtivoId}/pacote" in painel_revisor_html
    assert "/revisao/api/laudo/${state.laudoAtivoId}/pacote/exportar-pdf" in painel_revisor_html
    assert "js-btn-pacote-json" in painel_revisor_html
    assert "js-btn-pacote-pdf" in painel_revisor_html
    assert 'id="modal-pacote"' in painel_revisor_html


def test_tela_templates_laudo_separa_biblioteca_e_editor_word() -> None:
    raiz = Path(__file__).resolve().parents[1]
    html_biblioteca = (raiz / "templates" / "revisor_templates_biblioteca.html").read_text(encoding="utf-8")
    html_editor = (raiz / "templates" / "revisor_templates_editor_word.html").read_text(encoding="utf-8")
    js_biblioteca = (raiz / "static" / "js" / "revisor" / "templates_biblioteca_page.js").read_text(encoding="utf-8")
    js_word = (raiz / "static" / "js" / "revisor" / "templates_editor_word.js").read_text(encoding="utf-8")

    assert 'id="search-templates"' in html_biblioteca
    assert 'id="filter-modo"' in html_biblioteca
    assert 'id="sort-templates"' in html_biblioteca
    assert 'id="metric-total"' in html_biblioteca
    assert 'id="metric-word"' in html_biblioteca
    assert 'id="metric-ativo"' in html_biblioteca
    assert 'id="metric-recente"' in html_biblioteca
    assert "Criar seu modelo" in html_biblioteca
    assert "/static/js/revisor/templates_biblioteca_page.js" in html_biblioteca

    assert 'id="btn-open-editor-a4"' in html_editor
    assert 'id="card-editor-word"' in html_editor
    assert 'id="editor-word-surface"' in html_editor
    assert 'id="btn-editor-preview"' in html_editor
    assert "/static/js/revisor/templates_editor_word.js" in html_editor

    assert "/revisao/api/templates-laudo" in js_biblioteca
    assert "/revisao/api/templates-laudo/editor/${Number(id)}/publicar" in js_biblioteca
    assert "/revisao/api/templates-laudo/${Number(id)}" in js_biblioteca
    assert "/revisao/templates-laudo/editor?template_id=${id}" in js_biblioteca
    assert "js-usar" in js_biblioteca
    assert "ordenacao" in js_biblioteca
    assert "atualizarMetricas" in js_biblioteca
    assert "renderizarThumbTemplate" in js_biblioteca

    assert "/revisao/api/templates-laudo/editor" in js_word
    assert "asset://" in js_word
    assert "origem_modo" in js_word


def test_chat_sidebar_e_modal_perfil_expoem_controles_essenciais() -> None:
    raiz = Path(__file__).resolve().parents[1]
    sidebar_html = (raiz / "templates" / "componentes" / "sidebar.html").read_text(encoding="utf-8")
    index_html = (raiz / "templates" / "index.html").read_text(encoding="utf-8")

    assert 'id="banner-relatorio-sidebar"' in sidebar_html
    assert 'role="button"' in sidebar_html
    assert 'data-laudo-id="' in sidebar_html
    assert 'id="btn-abrir-perfil-chat"' in sidebar_html
    assert 'id="avatar-usuario-sidebar"' in sidebar_html

    assert 'id="modal-perfil-chat"' in index_html
    assert 'id="input-perfil-nome"' in index_html
    assert 'id="input-perfil-email"' in index_html
    assert 'id="input-perfil-telefone"' in index_html
    assert 'id="input-foto-perfil"' in index_html
