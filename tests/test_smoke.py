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
    assert 'id="btn-shell-home"' in base_html
    assert 'id="btn-shell-profile"' in base_html

    assert 'class="btn-secundario btn-home-cabecalho"' in index_html
    assert 'id="btn-anexo"' in index_html
    assert 'id="input-anexo"' in index_html
    assert 'id="preview-anexo"' in index_html
    assert 'id="mesa-widget-btn-anexo"' in index_html
    assert 'id="mesa-widget-input-anexo"' in index_html
    assert 'id="mesa-widget-preview-anexo"' in index_html
    assert 'id="mesa-widget-resumo"' in index_html
    assert 'id="mesa-widget-resumo-titulo"' in index_html
    assert 'id="mesa-widget-chip-pendencias"' in index_html
    assert 'id="mesa-widget-chip-nao-lidas"' in index_html
    assert 'id="bloco-gate-roteiro-template"' in index_html
    assert 'id="texto-gate-roteiro-template"' in index_html
    assert 'id="lista-gate-roteiro-template"' in index_html
    assert "data-preprompt=" in index_html


def test_chat_usa_assets_modulares_e_service_worker_compartilhado() -> None:
    raiz = Path(__file__).resolve().parents[1]
    base_html = (raiz / "templates" / "base.html").read_text(encoding="utf-8")
    index_html = (raiz / "templates" / "index.html").read_text(encoding="utf-8")
    main_py = (raiz / "main.py").read_text(encoding="utf-8")
    worker_compartilhado = (raiz / "static" / "js" / "shared" / "trabalhador_servico.js").read_text(encoding="utf-8")

    assert "/static/css/shared/global.css?v={{ v_app }}" in base_html
    assert "/static/css/shared/layout.css?v={{ v_app }}" in base_html
    assert "/static/css/shared/material-symbols.css?v={{ v_app }}" in base_html
    assert "/static/css/chat/chat_base.css?v={{ v_app }}" in base_html
    assert "/static/css/chat/chat_mobile.css?v={{ v_app }}" in base_html
    assert "/static/css/chat/chat_index.css?v={{ v_app }}" in base_html
    assert "/static/css/shared/app_shell.css?v={{ v_app }}" in base_html
    assert "/static/css/chat.css" not in base_html

    assert "/static/js/shared/api.js" in index_html
    assert "/static/js/shared/ui.js" in index_html
    assert "/static/js/shared/hardware.js" in index_html
    assert "/static/js/api.js" not in index_html
    assert "/static/js/ui.js" not in index_html
    assert "/static/js/hardware.js" not in index_html

    assert 'DIR_STATIC / "js" / "shared" / "trabalhador_servico.js"' in main_py
    assert "/static/js/shared/api.js" in worker_compartilhado
    assert "/static/js/shared/ui.js" in worker_compartilhado
    assert "/static/js/shared/hardware.js" in worker_compartilhado
    assert "/static/js/api.js" not in worker_compartilhado
    assert "/static/js/ui.js" not in worker_compartilhado
    assert "/static/js/hardware.js" not in worker_compartilhado
    assert "/static/css/chat.css" not in worker_compartilhado

    arquivos_legados = [
        raiz / "static" / "css" / "global.css",
        raiz / "static" / "css" / "layout.css",
        raiz / "static" / "css" / "chat.css",
        raiz / "static" / "js" / "api.js",
        raiz / "static" / "js" / "ui.js",
        raiz / "static" / "js" / "hardware.js",
        raiz / "static" / "js" / "trabalhador_servico.js",
        raiz / "static" / "js" / "chat" / "chat_panel_legacy.js",
    ]
    assert all(not caminho.exists() for caminho in arquivos_legados)


def test_chat_css_responsivo_separa_nucleo_e_index() -> None:
    raiz = Path(__file__).resolve().parents[1]
    chat_mobile = (raiz / "static" / "css" / "chat" / "chat_mobile.css").read_text(encoding="utf-8")
    chat_index = (raiz / "static" / "css" / "chat" / "chat_index.css").read_text(encoding="utf-8")

    assert ".barra-status-inspecao {" in chat_index
    assert ".banner-engenharia {" in chat_index
    assert ".modal-overlay {" in chat_index

    assert ".barra-status-inspecao {" not in chat_mobile
    assert ".banner-engenharia {" not in chat_mobile
    assert ".modal-overlay {" not in chat_mobile


def test_global_css_preserva_tipografia_do_body() -> None:
    raiz = Path(__file__).resolve().parents[1]
    global_css = (raiz / "static" / "css" / "shared" / "global.css").read_text(encoding="utf-8")

    assert "body,\nbutton,\ninput,\ntextarea,\nselect {" not in global_css
    assert "button,\ninput,\ntextarea,\nselect {\n    font: inherit;" in global_css
    assert "body {\n    margin: 0;" in global_css
    assert "font-family: var(--font-base);" in global_css


def test_template_revisor_aponta_websocket_com_prefixo_revisao() -> None:
    raiz = Path(__file__).resolve().parents[1]
    painel_revisor_html = (raiz / "templates" / "painel_revisor.html").read_text(encoding="utf-8")
    assert "/revisao/ws/whispers" in painel_revisor_html
    assert "/revisao/api/laudo/${state.laudoAtivoId}/pacote" in painel_revisor_html
    assert "/revisao/api/laudo/${state.laudoAtivoId}/pacote/exportar-pdf" in painel_revisor_html
    assert "/revisao/api/laudo/${alvo}/marcar-whispers-lidos" in painel_revisor_html
    assert "/revisao/api/laudo/${laudoId}/pendencias/${msgId}" in painel_revisor_html
    assert "/revisao/api/laudo/${state.laudoAtivoId}/responder-anexo" in painel_revisor_html
    assert "js-btn-pacote-json" in painel_revisor_html
    assert "js-btn-pacote-pdf" in painel_revisor_html
    assert 'id="modal-pacote"' in painel_revisor_html
    assert 'id="mesa-operacao-painel"' in painel_revisor_html
    assert 'id="mesa-operacao-conteudo"' in painel_revisor_html
    assert "pendencias_resolvidas_recentes" in painel_revisor_html
    assert 'data-mesa-action="responder-item"' in painel_revisor_html
    assert 'data-mesa-action="alternar-pendencia"' in painel_revisor_html
    assert "js-indicador-whispers" in painel_revisor_html
    assert "js-indicador-pendencias" in painel_revisor_html
    assert "anexo-mensagem-link" in painel_revisor_html
    assert 'id="btn-anexo-resposta"' in painel_revisor_html
    assert 'id="input-anexo-resposta"' in painel_revisor_html
    assert 'id="preview-resposta-anexo"' in painel_revisor_html


def test_openapi_do_inspetor_endurece_request_bodies_criticos() -> None:
    with TestClient(main.app) as cliente:
        schema = cliente.get("/openapi.json").json()

    body_iniciar = schema["components"]["schemas"]["Body_api_iniciar_relatorio_app_api_laudo_iniciar_post"]
    variantes_tipo = body_iniciar["properties"]["tipo_template"]["anyOf"]
    variantes_alias = body_iniciar["properties"]["tipotemplate"]["anyOf"]
    assert {"type": "string", "maxLength": 0} in variantes_tipo
    assert {"type": "string", "maxLength": 0} in variantes_alias

    body_mesa_anexo = schema["components"]["schemas"][
        "Body_enviar_mensagem_mesa_laudo_com_anexo_app_api_laudo__laudo_id__mesa_anexo_post"
    ]
    assert body_mesa_anexo["properties"]["arquivo"]["minLength"] == 1
    assert body_mesa_anexo["properties"]["arquivo"]["format"] == "binary"
    assert "contentMediaType" not in body_mesa_anexo["properties"]["arquivo"]

    op_mesa_anexo = schema["paths"]["/app/api/laudo/{laudo_id}/mesa/anexo"]["post"]
    laudo_param = next(param for param in op_mesa_anexo["parameters"] if param["name"] == "laudo_id")
    assert laudo_param["schema"]["minimum"] == 1


def test_openapi_do_inspetor_endurece_chat_e_perfil() -> None:
    with TestClient(main.app) as cliente:
        schema = cliente.get("/openapi.json").json()

    body_perfil = schema["components"]["schemas"]["DadosAtualizarPerfilUsuario"]
    assert body_perfil["properties"]["nome_completo"]["minLength"] == 3
    assert body_perfil["properties"]["email"]["pattern"] == r"^[^\s@]+@[^\s@]+\.[^\s@]+$"

    body_perfil_foto = schema["components"]["schemas"]["Body_api_upload_foto_perfil_usuario_app_api_perfil_foto_post"]
    assert body_perfil_foto["properties"]["foto"]["minLength"] == 1
    assert body_perfil_foto["properties"]["foto"]["format"] == "binary"
    assert "contentMediaType" not in body_perfil_foto["properties"]["foto"]

    dados_chat = schema["components"]["schemas"]["DadosChat"]
    assert len(dados_chat["anyOf"]) == 3
    assert dados_chat["anyOf"][0]["properties"]["mensagem"]["minLength"] == 1
    assert dados_chat["anyOf"][1]["properties"]["dados_imagem"]["minLength"] == 1
    assert dados_chat["anyOf"][2]["properties"]["texto_documento"]["minLength"] == 1

    op_perfil = schema["paths"]["/app/api/perfil"]["put"]
    assert "requestBody" in op_perfil
    assert "400" in op_perfil["responses"]
    assert "409" in op_perfil["responses"]

    op_perfil_foto = schema["paths"]["/app/api/perfil/foto"]["post"]
    assert "400" in op_perfil_foto["responses"]
    assert "413" in op_perfil_foto["responses"]
    assert "415" in op_perfil_foto["responses"]

    op_chat = schema["paths"]["/app/api/chat"]["post"]
    assert "400" in op_chat["responses"]
    assert "application/json" in op_chat["responses"]["200"]["content"]
    assert "text/event-stream" in op_chat["responses"]["200"]["content"]

    body_upload_doc = schema["components"]["schemas"]["Body_rota_upload_doc_app_api_upload_doc_post"]
    assert body_upload_doc["properties"]["arquivo"]["minLength"] == 1
    assert body_upload_doc["properties"]["arquivo"]["format"] == "binary"
    assert "contentMediaType" not in body_upload_doc["properties"]["arquivo"]

    op_upload_doc = schema["paths"]["/app/api/upload_doc"]["post"]
    assert "400" in op_upload_doc["responses"]
    assert "413" in op_upload_doc["responses"]
    assert "415" in op_upload_doc["responses"]
    assert "422" in op_upload_doc["responses"]
    assert "501" in op_upload_doc["responses"]

    op_pdf = schema["paths"]["/app/api/gerar_pdf"]["post"]
    assert "application/pdf" in op_pdf["responses"]["200"]["content"]
    assert "500" in op_pdf["responses"]

    op_sse = schema["paths"]["/app/api/notificacoes/sse"]["get"]
    assert "text/event-stream" in op_sse["responses"]["200"]["content"]


def test_openapi_do_revisor_endurece_templates_laudo_para_schemathesis(monkeypatch) -> None:
    monkeypatch.setenv("SCHEMATHESIS_TEST_HINTS", "1")
    main.app.openapi_schema = None
    try:
        with TestClient(main.app) as cliente:
            schema = cliente.get("/openapi.json").json()
    finally:
        main.app.openapi_schema = None

    body_asset = schema["components"]["schemas"][
        "Body_upload_asset_template_editor_laudo_revisao_api_templates_laudo_editor__template_id__assets_post"
    ]
    assert body_asset["properties"]["arquivo"]["minLength"] == 1
    assert body_asset["properties"]["arquivo"]["format"] == "binary"
    assert "contentMediaType" not in body_asset["properties"]["arquivo"]

    body_upload = schema["components"]["schemas"]["Body_upload_template_laudo_revisao_api_templates_laudo_upload_post"]
    assert body_upload["properties"]["arquivo_base"]["minLength"] == 1
    assert body_upload["properties"]["arquivo_base"]["format"] == "binary"
    assert body_upload["properties"]["nome"]["minLength"] == 1
    assert body_upload["properties"]["codigo_template"]["minLength"] == 1

    dados_preview = schema["components"]["schemas"]["DadosPreviewTemplateLaudo"]
    assert dados_preview["properties"]["laudo_id"]["enum"] == [1]
    assert dados_preview["properties"]["dados_formulario"]["minProperties"] == 1

    op_editor = schema["paths"]["/revisao/api/templates-laudo/editor"]["post"]
    assert "201" in op_editor["responses"]
    assert "409" in op_editor["responses"]

    op_preview_editor = schema["paths"]["/revisao/api/templates-laudo/editor/{template_id}/preview"]["post"]
    assert "application/pdf" in op_preview_editor["responses"]["200"]["content"]

    op_arquivo_base = schema["paths"]["/revisao/api/templates-laudo/{template_id}/arquivo-base"]["get"]
    assert "application/pdf" in op_arquivo_base["responses"]["200"]["content"]

    op_editor_asset = schema["paths"]["/revisao/api/templates-laudo/editor/{template_id}/assets/{asset_id}"]["get"]
    template_param = next(param for param in op_editor_asset["parameters"] if param["name"] == "template_id")
    asset_param = next(param for param in op_editor_asset["parameters"] if param["name"] == "asset_id")
    assert template_param["schema"]["enum"] == [2]
    assert asset_param["schema"]["enum"] == ["seed-asset-logo"]
    assert "image/png" in op_editor_asset["responses"]["200"]["content"]


def test_openapi_expoe_so_rotas_de_api_e_operacionais() -> None:
    with TestClient(main.app) as cliente:
        schema = cliente.get("/openapi.json").json()

    paths = schema["paths"]
    assert "/app/api/chat" in paths
    assert "/cliente/api/empresa/resumo" in paths
    assert "/revisao/api/templates-laudo" in paths
    assert "/admin/api/metricas-grafico" in paths
    assert "/app/login" not in paths
    assert "/app/" not in paths
    assert "/cliente/painel" not in paths
    assert "/revisao/login" not in paths
    assert "/admin/painel" not in paths


def test_run_schemathesis_carrega_hooks_binarios() -> None:
    raiz = Path(__file__).resolve().parents[1]
    script = (raiz / "scripts" / "run_schemathesis.ps1").read_text(encoding="utf-8")
    hooks = (raiz / "scripts" / "schemathesis_hooks.py").read_text(encoding="utf-8")
    common = (raiz / "scripts" / "test_common.ps1").read_text(encoding="utf-8")

    assert 'SCHEMATHESIS_HOOKS' in script
    assert 'scripts\\schemathesis_hooks.py' in script
    assert 'ValidateSet("publico", "inspetor", "revisor", "cliente", "admin")' in script
    assert 'ValidateSet("inspetor", "revisor", "cliente", "admin")' in common
    assert '@schemathesis.deserializer("application/pdf")' in hooks
    assert '@schemathesis.deserializer("application/octet-stream")' in hooks
    assert '@schemathesis.deserializer("image/png", "image/jpeg", "image/webp")' in hooks


def test_templates_cliente_explicitam_abas_e_formularios_principais() -> None:
    raiz = Path(__file__).resolve().parents[1]
    login_cliente = (raiz / "templates" / "login_cliente.html").read_text(encoding="utf-8")
    portal_cliente = (raiz / "templates" / "cliente_portal.html").read_text(encoding="utf-8")
    portal_js = (raiz / "static" / "js" / "cliente" / "portal.js").read_text(encoding="utf-8")
    portal_css = (raiz / "static" / "css" / "cliente" / "portal.css").read_text(encoding="utf-8")

    assert 'action="/cliente/login"' in login_cliente
    assert "Portal Admin-Cliente" in login_cliente
    assert '/static/css/shared/auth_shell.css?v={{ v_app }}' in login_cliente
    assert "/revisao/login" in login_cliente

    assert 'id="hero-prioridades"' in portal_cliente
    assert 'id="tab-admin"' in portal_cliente
    assert 'id="tab-chat"' in portal_cliente
    assert 'id="tab-mesa"' in portal_cliente
    assert 'id="admin-resumo-geral"' in portal_cliente
    assert 'id="admin-auditoria-lista"' in portal_cliente
    assert 'id="admin-onboarding-resumo"' in portal_cliente
    assert 'id="admin-onboarding-lista"' in portal_cliente
    assert 'id="admin-saude-resumo"' in portal_cliente
    assert 'id="admin-saude-historico"' in portal_cliente
    assert 'id="empresa-alerta-capacidade"' in portal_cliente
    assert 'id="plano-impacto-preview"' in portal_cliente
    assert 'id="admin-planos-historico"' in portal_cliente
    assert 'id="form-plano"' in portal_cliente
    assert 'id="btn-plano-salvar"' in portal_cliente
    assert 'id="form-usuario"' in portal_cliente
    assert 'id="usuario-capacidade-nota"' in portal_cliente
    assert 'id="btn-usuario-criar"' in portal_cliente
    assert 'id="form-chat-laudo"' in portal_cliente
    assert 'id="chat-capacidade-nota"' in portal_cliente
    assert 'id="btn-chat-laudo-criar"' in portal_cliente
    assert 'id="form-chat-msg"' in portal_cliente
    assert 'id="btn-chat-upload-doc"' in portal_cliente
    assert 'id="chat-upload-doc"' in portal_cliente
    assert 'id="chat-upload-status"' in portal_cliente
    assert 'id="form-mesa-msg"' in portal_cliente
    assert 'id="usuarios-busca"' in portal_cliente
    assert 'id="chat-busca-laudos"' in portal_cliente
    assert 'id="mesa-busca-laudos"' in portal_cliente
    assert 'id="chat-resumo-geral"' in portal_cliente
    assert 'id="chat-triagem"' in portal_cliente
    assert 'id="chat-movimentos"' in portal_cliente
    assert 'id="chat-alertas-operacionais"' in portal_cliente
    assert 'id="mesa-resumo-geral"' in portal_cliente
    assert 'id="mesa-triagem"' in portal_cliente
    assert 'id="mesa-movimentos"' in portal_cliente
    assert 'id="mesa-alertas-operacionais"' in portal_cliente
    assert 'id="chat-contexto"' in portal_cliente
    assert 'id="mesa-contexto"' in portal_cliente
    assert '/static/css/cliente/portal.css?v={{ v_app }}' in portal_cliente
    assert '/static/js/cliente/portal.js?v={{ v_app }}' in portal_cliente
    assert "plano_sugerido" in portal_js
    assert "usuario-capacidade-nota" in portal_js
    assert "admin-planos-historico" in portal_js
    assert "chat-alertas-operacionais" in portal_js
    assert "admin-saude-resumo" in portal_js
    assert "saude_operacional" in portal_js
    assert "/cliente/api/empresa/plano/interesse" in portal_js
    assert "preparar-upgrade" in portal_js
    assert "renderCentralPrioridades" in portal_js
    assert "abrir-prioridade" in portal_js
    assert "renderOnboardingEquipe" in portal_js
    assert "renderChatTriagem" in portal_js
    assert "renderChatMovimentos" in portal_js
    assert "renderChatDocumentoPendente" in portal_js
    assert "/cliente/api/chat/upload_doc" in portal_js
    assert "renderMesaTriagem" in portal_js
    assert "renderMesaMovimentos" in portal_js
    assert "filtrar-usuarios-status" in portal_js
    assert "filtrar-chat-status" in portal_js
    assert "filtrar-mesa-status" in portal_js
    assert "laudoChatParado" in portal_js
    assert ".composer-toolbar" in portal_css
    assert "laudoMesaParado" in portal_js
    assert "Ver parados" in portal_js
    assert "Parado ha" in portal_js
    assert "usuariosSituacao" in portal_js
    assert "chatSituacao" in portal_js
    assert "mesaSituacao" in portal_js
    assert "aplicarFiltrosUsuarios" in portal_js
    assert "focarUsuarioNaTabela" in portal_js
    assert 'data-act="reset-user"' in portal_js
    assert 'data-act="toggle-user"' in portal_js
    assert 'data-user="${item.userId' in portal_js
    assert "user-row-highlight" in portal_css


def test_nomenclatura_admin_ceo_e_admin_cliente_fica_clara_nos_portais() -> None:
    raiz = Path(__file__).resolve().parents[1]
    login_admin = (raiz / "templates" / "login.html").read_text(encoding="utf-8")
    login_cliente = (raiz / "templates" / "login_cliente.html").read_text(encoding="utf-8")
    login_app = (raiz / "templates" / "login_app.html").read_text(encoding="utf-8")
    dashboard_admin = (raiz / "templates" / "dashboard.html").read_text(encoding="utf-8")
    clientes_admin = (raiz / "templates" / "clientes.html").read_text(encoding="utf-8")
    detalhe_cliente = (raiz / "templates" / "cliente_detalhe.html").read_text(encoding="utf-8")
    novo_cliente = (raiz / "templates" / "novo_cliente.html").read_text(encoding="utf-8")
    routes_cliente = (raiz / "app" / "domains" / "cliente" / "routes.py").read_text(encoding="utf-8")
    routes_admin = (raiz / "app" / "domains" / "admin" / "routes.py").read_text(encoding="utf-8")
    security = (raiz / "app" / "shared" / "security.py").read_text(encoding="utf-8")

    assert "Portal Admin-CEO" in login_admin
    assert "Admin-CEO da Tariel Control" in login_admin
    assert "Portal Admin-Cliente" in login_cliente
    assert "Admin-CEO" in login_cliente
    assert "Portal do Inspetor" in login_app
    assert "Painel Admin-CEO" in dashboard_admin
    assert "Empresas assinantes" in clientes_admin
    assert "Admins-Cliente (" in detalhe_cliente
    assert "inspetores_e_revisores" in detalhe_cliente
    assert "Provisionar empresa assinante" in novo_cliente
    assert '"Admin-CEO"' in routes_cliente
    assert "Área restrita ao Admin-CEO" in routes_admin
    assert "Acesso restrito ao portal admin-cliente." in security
    assert "Acesso restrito ao portal Admin-CEO." in security


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
