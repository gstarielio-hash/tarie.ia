from __future__ import annotations

import json
import os
import re
import time
import uuid
from typing import Any
from urllib.parse import urljoin

import pytest
from playwright.sync_api import Browser, Page, expect

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_E2E", "0") != "1",
    reason="Defina RUN_E2E=1 para executar os testes Playwright.",
)


def _fazer_login(
    page: Page,
    *,
    base_url: str,
    portal: str,
    email: str,
    senha: str,
    rota_sucesso_regex: str,
) -> None:
    page.goto(f"{base_url}/{portal}/login", wait_until="domcontentloaded")
    page.locator('input[name="email"]').fill(email)
    page.locator('input[name="senha"]').fill(senha)
    page.locator('button[type="submit"]').first.click()
    expect(page).to_have_url(re.compile(rota_sucesso_regex))


def _api_fetch(
    page: Page,
    *,
    path: str,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
    form_body: dict[str, str] | None = None,
) -> dict[str, Any]:
    csrf_meta = page.locator('meta[name="csrf-token"]').first
    csrf_token = csrf_meta.get_attribute("content") if csrf_meta.count() else ""
    if not csrf_token:
        token_input = page.locator('input[name="csrf_token"]').first
        csrf_token = token_input.input_value() if token_input.count() else ""

    headers: dict[str, str] = {}
    if csrf_token:
        headers["X-CSRF-Token"] = csrf_token

    kwargs: dict[str, Any] = {
        "method": method.upper(),
        "headers": headers,
    }
    if json_body is not None:
        headers["Content-Type"] = "application/json"
        kwargs["data"] = json.dumps(json_body, ensure_ascii=False)
    elif form_body is not None:
        kwargs["form"] = form_body

    resposta = page.request.fetch(urljoin(page.url, path), **kwargs)
    raw = resposta.text()
    try:
        parsed = resposta.json()
    except Exception:
        parsed = None

    content_type = resposta.headers.get("content-type", "")
    return {
        "status": resposta.status,
        "ok": resposta.ok,
        "url": resposta.url,
        "body": parsed,
        "raw": raw,
        "contentType": content_type,
    }


def _iniciar_inspecao_via_modal(page: Page, *, tipo_template: str = "padrao") -> None:
    page.locator("#btn-abrir-modal-novo").click()
    expect(page.locator("#modal-nova-inspecao")).to_be_visible()
    page.locator("#select-template-inspecao").select_option(tipo_template)
    page.locator("#btn-confirmar-inspecao").click()
    expect(page.locator("#barra-status-inspecao")).to_be_visible(timeout=10000)
    expect(page.locator("#tela-boas-vindas")).to_be_hidden()


def _iniciar_inspecao_via_api(page: Page, *, tipo_template: str = "padrao") -> int:
    resposta = _api_fetch(
        page,
        path="/app/api/laudo/iniciar",
        method="POST",
        form_body={"tipo_template": tipo_template},
    )
    assert resposta["status"] == 200
    assert isinstance(resposta["body"], dict)
    return int(resposta["body"]["laudo_id"])


def _obter_laudo_ativo(page: Page) -> int:
    prazo = time.time() + 8.0

    while time.time() < prazo:
        laudo_id = int(
            page.evaluate("() => Number(window.TarielAPI?.obterLaudoAtualId?.() || 0)")
        )
        if laudo_id > 0:
            return laudo_id

        # Fallback defensivo para evitar flake de sincronização inicial
        # (estado vindo do backend antes do bootstrap concluir no front).
        try:
            status = _api_fetch(page, path="/app/api/laudo/status", method="GET")
            if status.get("status") == 200 and isinstance(status.get("body"), dict):
                laudo_status = int(status["body"].get("laudo_id") or 0)
                if laudo_status > 0:
                    page.evaluate(
                        """(laudoId) => {
                            if (window.TarielAPI?.carregarLaudo) {
                                window.TarielAPI.carregarLaudo(laudoId, { forcar: true, silencioso: true });
                            }
                        }""",
                        laudo_status,
                    )
                    return laudo_status
        except Exception:
            pass

        page.wait_for_timeout(220)

    assert False, "Laudo ativo não foi disponibilizado no front dentro do tempo esperado."


def _aceitar_proximo_dialogo(page: Page) -> None:
    page.once("dialog", lambda dialog: dialog.accept())


def _mockar_resposta_chat_json(page: Page, *, texto_resposta: str) -> None:
    def _handler(route) -> None:
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"texto": texto_resposta}, ensure_ascii=False),
        )

    page.route("**/app/api/chat*", _handler)


def _assert_sem_overflow_horizontal(page: Page, *, tolerancia_px: int = 2) -> None:
    metricas = page.evaluate(
        """() => {
            const innerWidth = window.innerWidth;
            const scrollWidth = document.documentElement.scrollWidth;
            const xAntes = window.scrollX;
            window.scrollTo({ left: 10_000, top: 0, behavior: "instant" });
            const xDepois = window.scrollX;
            window.scrollTo({ left: xAntes, top: 0, behavior: "instant" });
            const offenders = Array.from(document.querySelectorAll("body *"))
                .map((el) => {
                    const r = el.getBoundingClientRect();
                    const style = window.getComputedStyle(el);
                    if (style.display === "none" || style.visibility === "hidden") return null;
                    if (r.width <= 0 || r.height <= 0) return null;
                    if (r.right <= innerWidth + 1) return null;
                    return {
                        tag: el.tagName.toLowerCase(),
                        id: el.id || "",
                        cls: (el.className || "").toString().split(" ").slice(0, 3).join("."),
                        right: Math.round(r.right),
                        width: Math.round(r.width)
                    };
                })
                .filter(Boolean)
                .slice(0, 8);
            return { innerWidth, scrollWidth, xDepois, offenders };
        }"""
    )
    sem_overflow_real = int(metricas["xDepois"]) <= int(tolerancia_px)
    sem_estouro_layout = int(metricas["scrollWidth"]) <= int(metricas["innerWidth"]) + int(tolerancia_px)
    assert sem_overflow_real or sem_estouro_layout, str(metricas)


def _assert_controles_flutuantes_sem_sobreposicao(page: Page) -> None:
    ids = ["btn-ir-fim-chat", "btn-toggle-ui", "btn-mesa-widget-toggle"]
    sobreposicoes = page.evaluate(
        """(ids) => {
            const visiveis = ids
                .map((id) => document.getElementById(id))
                .filter((el) => {
                    if (!el) return false;
                    const style = window.getComputedStyle(el);
                    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && r.height > 0;
                })
                .map((el) => ({ id: el.id, r: el.getBoundingClientRect() }));

            const overlap = (a, b) => {
                const x = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left));
                const y = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
                return (x * y) > 0;
            };

            const conflitos = [];
            for (let i = 0; i < visiveis.length; i++) {
                for (let j = i + 1; j < visiveis.length; j++) {
                    if (overlap(visiveis[i], visiveis[j])) {
                        conflitos.push([visiveis[i].id, visiveis[j].id]);
                    }
                }
            }
            return conflitos;
        }""",
        ids,
    )
    assert sobreposicoes == []


def test_e2e_inspetor_login_e_home_carrega(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="app",
        email=credenciais_seed["inspetor"]["email"],
        senha=credenciais_seed["inspetor"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
    )

    expect(page.get_by_role("button", name=re.compile(r"Iniciar nova inspeção", re.IGNORECASE))).to_be_visible()
    expect(page.get_by_text("Assistente Técnico WF")).to_be_visible()


def test_e2e_modal_nova_inspecao_ativa_barra_de_sessao(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="app",
        email=credenciais_seed["inspetor"]["email"],
        senha=credenciais_seed["inspetor"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
    )

    _iniciar_inspecao_via_modal(page, tipo_template="padrao")
    expect(page.locator("#nome-template-ativo")).to_contain_text(re.compile(r"Inspeção Geral|Chat Livre", re.IGNORECASE))


def test_e2e_home_com_laudo_ativo_retorna_para_tela_inicial_sem_deslogar(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="app",
        email=credenciais_seed["inspetor"]["email"],
        senha=credenciais_seed["inspetor"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
    )

    _iniciar_inspecao_via_modal(page, tipo_template="padrao")

    status_antes = _api_fetch(
        page,
        path="/app/api/laudo/status",
        method="GET",
    )
    assert status_antes["status"] == 200
    assert status_antes["body"]["estado"] == "sem_relatorio"
    assert status_antes["body"]["laudo_id"] is None

    page.locator(".btn-home-cabecalho").click()
    expect(page).to_have_url(
        re.compile(rf"{re.escape(live_server_url)}/app/?(\?home=1)?$")
    )
    expect(page.locator("#tela-boas-vindas")).to_be_visible()
    expect(page.locator("#btn-abrir-modal-novo")).to_be_visible()

    status_depois = _api_fetch(
        page,
        path="/app/api/laudo/status",
        method="GET",
    )
    assert status_depois["status"] == 200

    page.goto(f"{live_server_url}/app/", wait_until="domcontentloaded")
    expect(page).to_have_url(
        re.compile(rf"{re.escape(live_server_url)}/app/?(\?laudo=\d+)?$")
    )
    assert "/app/login" not in page.url


def test_e2e_acao_rapida_inicia_inspecao_e_preenche_composer(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="app",
        email=credenciais_seed["inspetor"]["email"],
        senha=credenciais_seed["inspetor"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
    )

    botao = page.locator(".btn-acao-rapida.acao-nr12").first
    expect(botao).to_be_visible()
    botao.click()

    expect(page.locator("#barra-status-inspecao")).to_be_visible(timeout=10000)
    expect(page.locator("#nome-template-ativo")).to_contain_text(re.compile(r"NR-12", re.IGNORECASE))

    texto_composer = page.locator("#campo-mensagem").input_value()
    assert len(texto_composer.strip()) >= 20
    expect(page.locator("#btn-enviar")).to_be_enabled()


def test_e2e_finalizar_sem_evidencias_aciona_gate_qualidade(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="app",
        email=credenciais_seed["inspetor"]["email"],
        senha=credenciais_seed["inspetor"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
    )

    _iniciar_inspecao_via_modal(page, tipo_template="padrao")
    _aceitar_proximo_dialogo(page)
    page.locator("#btn-finalizar-inspecao").click()

    expect(page.locator("#modal-gate-qualidade")).to_be_visible(timeout=10000)
    expect(page.locator("#lista-gate-faltantes .item-gate-qualidade").first).to_be_visible()


def test_e2e_botao_enviar_habilita_com_texto_no_composer(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="app",
        email=credenciais_seed["inspetor"]["email"],
        senha=credenciais_seed["inspetor"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
    )

    campo = page.locator("#campo-mensagem")
    btn_enviar = page.locator("#btn-enviar")

    expect(btn_enviar).to_be_disabled()
    campo.fill("   ")
    expect(btn_enviar).to_be_disabled()

    campo.fill("Observação de teste em campo.")
    expect(btn_enviar).to_be_enabled()

    campo.fill("")
    expect(btn_enviar).to_be_disabled()


def test_e2e_envio_chat_principal_via_ui_com_mock_da_ia(
    browser: Browser,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    contexto = browser.new_context(service_workers="block")
    try:
        page = contexto.new_page()
        _fazer_login(
            page,
            base_url=live_server_url,
            portal="app",
            email=credenciais_seed["inspetor"]["email"],
            senha=credenciais_seed["inspetor"]["senha"],
            rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
        )

        _iniciar_inspecao_via_modal(page, tipo_template="padrao")
        _mockar_resposta_chat_json(
            page,
            texto_resposta="Resposta simulada da IA para teste E2E.",
        )

        texto = f"Registro de inspeção E2E composer {uuid.uuid4().hex[:10]}"
        page.locator("#campo-mensagem").fill(texto)
        page.locator("#btn-enviar").click()

        expect(
            page.locator(
                ".linha-mensagem.mensagem-inspetor .texto-msg",
                has_text=texto,
            ).first
        ).to_be_visible(timeout=10000)
        expect(page.locator(".linha-mensagem.mensagem-ia").first).to_be_visible(timeout=10000)
        expect(
            page.locator(
                ".linha-mensagem.mensagem-ia .texto-msg",
                has_text="Resposta simulada da IA para teste E2E.",
            ).first
        ).to_be_visible(timeout=10000)
        expect(page.locator("#btn-enviar")).to_be_disabled()
    finally:
        contexto.close()


def test_e2e_isolamento_portal_inspetor_nao_acessa_revisao(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="app",
        email=credenciais_seed["inspetor"]["email"],
        senha=credenciais_seed["inspetor"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
    )

    page.goto(f"{live_server_url}/revisao/painel", wait_until="domcontentloaded")
    conteudo = page.content()
    assert "Mesa de Avaliação" not in conteudo
    assert (
        "/revisao/login" in page.url
        or "/app/login" in page.url
        or "Acesso restrito" in conteudo
        or "Sessão expirada" in conteudo
    )


def test_e2e_isolamento_portais_revisor_e_admin(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="revisao",
        email=credenciais_seed["revisor"]["email"],
        senha=credenciais_seed["revisor"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/revisao/painel/?$",
    )

    page.goto(f"{live_server_url}/app/", wait_until="domcontentloaded")
    assert "/revisao/painel" in page.url or "/app/login" in page.url

    page.goto(f"{live_server_url}/admin/painel", wait_until="domcontentloaded")
    assert "/admin/login" in page.url or "/revisao/painel" in page.url


def test_e2e_widget_mesa_so_abre_com_inspecao_ativa(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="app",
        email=credenciais_seed["inspetor"]["email"],
        senha=credenciais_seed["inspetor"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
    )

    painel_mesa = page.locator("#painel-mesa-widget")
    btn_toggle_mesa = page.locator("#btn-mesa-widget-toggle")

    expect(painel_mesa).to_be_hidden()
    btn_toggle_mesa.click()
    expect(painel_mesa).to_be_hidden()
    expect(btn_toggle_mesa).to_have_attribute("aria-expanded", "false")

    _iniciar_inspecao_via_modal(page, tipo_template="padrao")
    btn_toggle_mesa.click()
    expect(painel_mesa).to_be_visible()
    expect(btn_toggle_mesa).to_have_attribute("aria-expanded", "true")
    expect(page.locator("#mesa-widget-input")).to_be_visible()


def test_e2e_widget_mesa_envia_mensagem_via_ui_e_persiste(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="app",
        email=credenciais_seed["inspetor"]["email"],
        senha=credenciais_seed["inspetor"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
    )

    _iniciar_inspecao_via_modal(page, tipo_template="padrao")
    laudo_id = _obter_laudo_ativo(page)

    page.locator("#btn-mesa-widget-toggle").click()
    expect(page.locator("#painel-mesa-widget")).to_be_visible()

    texto = f"Mensagem widget mesa E2E {uuid.uuid4().hex[:8]}"
    page.locator("#mesa-widget-input").fill(texto)
    page.locator("#mesa-widget-enviar").click()

    expect(
        page.locator("#mesa-widget-lista .mesa-widget-item .texto", has_text=texto).first
    ).to_be_visible(timeout=10000)

    historico_mesa = _api_fetch(
        page,
        path=f"/app/api/laudo/{laudo_id}/mesa/mensagens",
        method="GET",
    )
    assert historico_mesa["status"] == 200
    itens = historico_mesa["body"]["itens"]
    assert any(item["tipo"] == "humano_insp" and texto in item["texto"] for item in itens)


def test_e2e_historico_pin_unpin_e_excluir_laudo(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="app",
        email=credenciais_seed["inspetor"]["email"],
        senha=credenciais_seed["inspetor"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
    )

    laudo_a = _iniciar_inspecao_via_api(page, tipo_template="padrao")
    laudo_b = _iniciar_inspecao_via_api(page, tipo_template="nr12maquinas")
    page.reload(wait_until="domcontentloaded")

    try:
        laudo_ativo = _obter_laudo_ativo(page)
    except AssertionError:
        # Fallback para ambientes mais lentos: força carregamento do último laudo
        # criado sem depender da sincronização inicial do frontend.
        laudo_ativo = laudo_b
        page.goto(f"{live_server_url}/app/?laudo={laudo_ativo}", wait_until="domcontentloaded")
        page.wait_for_timeout(300)

    laudo_alvo = laudo_b if laudo_ativo == laudo_a else laudo_a

    item_alvo = page.locator(f'.item-historico[data-laudo-id="{laudo_alvo}"]').first
    expect(item_alvo).to_be_visible(timeout=10000)

    botao_pin = item_alvo.locator('[data-acao-laudo="pin"]').first
    estado_inicial = botao_pin.get_attribute("aria-pressed")
    botao_pin.click()
    expect(botao_pin).not_to_have_attribute("aria-pressed", estado_inicial or "false")

    botao_pin.click()
    expect(botao_pin).to_have_attribute("aria-pressed", estado_inicial or "false")

    total_antes = page.locator(".item-historico[data-laudo-id]").count()
    _aceitar_proximo_dialogo(page)
    item_alvo.locator('[data-acao-laudo="delete"]').first.click()
    expect(page.locator(f'.item-historico[data-laudo-id="{laudo_alvo}"]')).to_have_count(0)
    assert page.locator(".item-historico[data-laudo-id]").count() == max(total_antes - 1, 0)


@pytest.mark.parametrize(
    ("largura", "altura"),
    [
        (1366, 768),
        (390, 844),
    ],
)
def test_e2e_responsivo_chat_sem_overflow_e_sem_sobreposicao(
    browser: Browser,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
    largura: int,
    altura: int,
) -> None:
    contexto = browser.new_context(viewport={"width": largura, "height": altura})
    try:
        page = contexto.new_page()
        _fazer_login(
            page,
            base_url=live_server_url,
            portal="app",
            email=credenciais_seed["inspetor"]["email"],
            senha=credenciais_seed["inspetor"]["senha"],
            rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
        )

        _iniciar_inspecao_via_modal(page, tipo_template="padrao")
        _assert_sem_overflow_horizontal(page)
        _assert_controles_flutuantes_sem_sobreposicao(page)

        page.locator("#btn-mesa-widget-toggle").click()
        expect(page.locator("#painel-mesa-widget")).to_be_visible()

        metricas_painel = page.evaluate(
            """() => {
                const painel = document.getElementById("painel-mesa-widget");
                const r = painel ? painel.getBoundingClientRect() : { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
                return {
                    viewportW: window.innerWidth,
                    viewportH: window.innerHeight,
                    left: r.left,
                    right: r.right,
                    top: r.top,
                    bottom: r.bottom,
                    width: r.width,
                    height: r.height
                };
            }"""
        )
        assert float(metricas_painel["width"]) > 180
        assert float(metricas_painel["height"]) > 180
        assert float(metricas_painel["left"]) >= -2
        assert float(metricas_painel["right"]) <= float(metricas_painel["viewportW"]) + 2
        assert float(metricas_painel["top"]) >= -2
        assert float(metricas_painel["bottom"]) <= float(metricas_painel["viewportH"]) + 2

        _assert_sem_overflow_horizontal(page)
    finally:
        contexto.close()


@pytest.mark.parametrize(
    ("largura", "altura"),
    [
        (1366, 768),
        (390, 844),
    ],
)
def test_e2e_responsivo_admin_sem_overflow_horizontal(
    browser: Browser,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
    largura: int,
    altura: int,
) -> None:
    contexto = browser.new_context(viewport={"width": largura, "height": altura})
    try:
        page = contexto.new_page()
        _fazer_login(
            page,
            base_url=live_server_url,
            portal="admin",
            email=credenciais_seed["admin"]["email"],
            senha=credenciais_seed["admin"]["senha"],
            rota_sucesso_regex=rf"{re.escape(live_server_url)}/admin/painel/?$",
        )

        expect(page.locator(".btn-novo-cliente")).to_be_visible()
        page.locator(".btn-novo-cliente").scroll_into_view_if_needed()
        _assert_sem_overflow_horizontal(page)
    finally:
        contexto.close()


def test_e2e_admin_navegacao_basica_sem_redirecionar_para_login(
    page: Page,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    _fazer_login(
        page,
        base_url=live_server_url,
        portal="admin",
        email=credenciais_seed["admin"]["email"],
        senha=credenciais_seed["admin"]["senha"],
        rota_sucesso_regex=rf"{re.escape(live_server_url)}/admin/painel/?$",
    )

    page.goto(f"{live_server_url}/admin/clientes", wait_until="domcontentloaded")
    expect(page).to_have_url(re.compile(rf"{re.escape(live_server_url)}/admin/clientes/?"))

    page.reload(wait_until="domcontentloaded")
    expect(page).to_have_url(re.compile(rf"{re.escape(live_server_url)}/admin/clientes/?"))
    assert "/admin/login" not in page.url

    page.goto(f"{live_server_url}/admin/painel", wait_until="domcontentloaded")
    expect(page).to_have_url(re.compile(rf"{re.escape(live_server_url)}/admin/painel/?$"))


def test_e2e_fluxo_bilateral_inspetor_e_revisor_no_canal_mesa(
    browser: Browser,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    contexto_inspetor = browser.new_context()
    contexto_revisor = browser.new_context()

    try:
        page_inspetor = contexto_inspetor.new_page()
        _fazer_login(
            page_inspetor,
            base_url=live_server_url,
            portal="app",
            email=credenciais_seed["inspetor"]["email"],
            senha=credenciais_seed["inspetor"]["senha"],
            rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
        )

        iniciar = _api_fetch(
            page_inspetor,
            path="/app/api/laudo/iniciar",
            method="POST",
            form_body={"tipo_template": "padrao"},
        )
        assert iniciar["status"] == 200
        assert isinstance(iniciar["body"], dict)
        laudo_id = int(iniciar["body"]["laudo_id"])

        enviar_mesa = _api_fetch(
            page_inspetor,
            path=f"/app/api/laudo/{laudo_id}/mesa/mensagem",
            method="POST",
            json_body={"texto": "Mesa, validar item da NR-12 no equipamento A."},
        )
        assert enviar_mesa["status"] == 201
        referencia_id = int(enviar_mesa["body"]["mensagem"]["id"])

        page_revisor = contexto_revisor.new_page()
        _fazer_login(
            page_revisor,
            base_url=live_server_url,
            portal="revisao",
            email=credenciais_seed["revisor"]["email"],
            senha=credenciais_seed["revisor"]["senha"],
            rota_sucesso_regex=rf"{re.escape(live_server_url)}/revisao/painel/?$",
        )

        resposta_revisor = _api_fetch(
            page_revisor,
            path=f"/revisao/api/laudo/{laudo_id}/responder",
            method="POST",
            json_body={
                "texto": "Mesa: ponto validado, incluir foto complementar do item.",
                "referencia_mensagem_id": referencia_id,
            },
        )
        assert resposta_revisor["status"] == 200
        assert resposta_revisor["body"]["success"] is True

        mesa_inspetor = _api_fetch(
            page_inspetor,
            path=f"/app/api/laudo/{laudo_id}/mesa/mensagens",
            method="GET",
        )
        assert mesa_inspetor["status"] == 200
        itens_mesa = mesa_inspetor["body"]["itens"]
        assert any(
            item["tipo"] == "humano_eng" and item.get("referencia_mensagem_id") == referencia_id
            for item in itens_mesa
        )

        chat_ia = _api_fetch(
            page_inspetor,
            path=f"/app/api/laudo/{laudo_id}/mensagens",
            method="GET",
        )
        assert chat_ia["status"] == 200
        tipos_chat = {item["tipo"] for item in chat_ia["body"]["itens"]}
        assert "humano_eng" not in tipos_chat
        assert "humano_insp" not in tipos_chat
    finally:
        contexto_inspetor.close()
        contexto_revisor.close()


def test_e2e_revisor_ui_responde_e_inspetor_recebe(
    browser: Browser,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    contexto_inspetor = browser.new_context()
    contexto_revisor = browser.new_context()

    try:
        page_inspetor = contexto_inspetor.new_page()
        _fazer_login(
            page_inspetor,
            base_url=live_server_url,
            portal="app",
            email=credenciais_seed["inspetor"]["email"],
            senha=credenciais_seed["inspetor"]["senha"],
            rota_sucesso_regex=rf"{re.escape(live_server_url)}/app/?$",
        )

        laudo_id = _iniciar_inspecao_via_api(page_inspetor, tipo_template="padrao")
        texto_inspecao = f"Solicitação para mesa em teste UI {uuid.uuid4().hex[:8]}"
        envio_inspetor = _api_fetch(
            page_inspetor,
            path=f"/app/api/laudo/{laudo_id}/mesa/mensagem",
            method="POST",
            json_body={"texto": texto_inspecao},
        )
        assert envio_inspetor["status"] == 201

        page_revisor = contexto_revisor.new_page()
        _fazer_login(
            page_revisor,
            base_url=live_server_url,
            portal="revisao",
            email=credenciais_seed["revisor"]["email"],
            senha=credenciais_seed["revisor"]["senha"],
            rota_sucesso_regex=rf"{re.escape(live_server_url)}/revisao/painel/?$",
        )

        item_laudo = page_revisor.locator(f'.js-item-laudo[data-id="{laudo_id}"]').first
        expect(item_laudo).to_be_visible(timeout=10000)
        item_laudo.click()

        expect(page_revisor.locator("#view-content")).to_be_visible(timeout=10000)
        expect(page_revisor.locator("#view-timeline")).to_contain_text(re.compile(r"teste UI", re.IGNORECASE))

        texto_resposta = f"Retorno da mesa via UI {uuid.uuid4().hex[:8]}"
        page_revisor.locator("#input-resposta").fill(texto_resposta)
        page_revisor.locator("#btn-enviar-msg").click()

        expect(
            page_revisor.locator("#view-timeline .bolha.engenharia", has_text=texto_resposta).first
        ).to_be_visible(timeout=10000)

        historico_mesa = _api_fetch(
            page_inspetor,
            path=f"/app/api/laudo/{laudo_id}/mesa/mensagens",
            method="GET",
        )
        assert historico_mesa["status"] == 200
        assert any(
            item["tipo"] == "humano_eng" and texto_resposta in item["texto"]
            for item in historico_mesa["body"]["itens"]
        )
    finally:
        contexto_inspetor.close()
        contexto_revisor.close()
