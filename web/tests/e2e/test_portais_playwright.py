from __future__ import annotations

import base64
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

PNG_1X1_TRANSPARENTE_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0X8AAAAASUVORK5CYII="
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
    laudo_id = int(resposta["body"]["laudo_id"])
    return laudo_id


def _obter_laudo_ativo(page: Page, *, laudo_esperado: int | None = None) -> int:
    prazo = time.time() + 12.0
    recarregamento_forcado = False

    while time.time() < prazo:
        laudo_id = int(
            page.evaluate("() => Number(window.TarielAPI?.obterLaudoAtualId?.() || 0)")
        )
        if laudo_id > 0 and (laudo_esperado is None or laudo_id == laudo_esperado):
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
                    page.wait_for_timeout(220)
                    laudo_front = int(
                        page.evaluate("() => Number(window.TarielAPI?.obterLaudoAtualId?.() || 0)")
                    )
                    if laudo_front > 0 and (laudo_esperado is None or laudo_front == laudo_esperado):
                        return laudo_front

                    if (
                        not recarregamento_forcado
                        and laudo_esperado
                        and laudo_status == laudo_esperado
                    ):
                        page.goto(
                            urljoin(page.url, f"/app/?laudo={laudo_esperado}"),
                            wait_until="domcontentloaded",
                        )
                        recarregamento_forcado = True
        except Exception:
            pass

        page.wait_for_timeout(220)

    assert False, "Laudo ativo não foi disponibilizado no front dentro do tempo esperado."


def _carregar_laudo_no_inspetor(page: Page, laudo_id: int) -> int:
    page.goto(
        urljoin(page.url, f"/app/?laudo={laudo_id}"),
        wait_until="domcontentloaded",
    )

    try:
        laudo_frente = _obter_laudo_ativo(page, laudo_esperado=laudo_id)
    except AssertionError:
        front_tem_loader = bool(
            page.evaluate("() => typeof window.TarielAPI?.carregarLaudo === 'function'")
        )
        if front_tem_loader:
            page.evaluate(
                """async (idLaudo) => {
                    await window.TarielAPI.carregarLaudo(idLaudo, { forcar: true, silencioso: true });
                }""",
                laudo_id,
            )
        laudo_frente = _obter_laudo_ativo(page, laudo_esperado=laudo_id)

    try:
        page.wait_for_function(
            """(idLaudo) => {
                const ativo = Number(
                    window.TarielAPI?.obterLaudoAtualId?.() ||
                    document.body?.dataset?.laudoAtualId ||
                    0
                );
                const estado = String(
                    document.body?.dataset?.estadoRelatorio ||
                    window.TarielAPI?.obterEstadoRelatorioNormalizado?.() ||
                    window.TarielAPI?.obterEstadoRelatorio?.() ||
                    ""
                ).trim().toLowerCase();
                return ativo === Number(idLaudo) && (!estado || estado === "relatorio_ativo");
            }""",
            arg=laudo_id,
            timeout=5000,
        )
    except Exception:
        page.wait_for_timeout(250)
    return laudo_frente


def _abrir_laudo_no_revisor(page: Page, laudo_id: int) -> None:
    item_laudo = page.locator(f'.js-item-laudo[data-id="{laudo_id}"]').first
    expect(item_laudo).to_be_visible(timeout=10000)
    item_laudo.click()

    expect(page.locator("#view-content")).to_be_visible(timeout=10000)
    expect(page.locator("#view-hash")).to_contain_text(
        re.compile(r"Inspe[cç][aã]o #", re.IGNORECASE),
        timeout=10000,
    )
    expect(page.locator("#input-resposta")).to_be_enabled(timeout=10000)
    page.wait_for_function(
        """() => {
            const timeline = document.getElementById("view-timeline");
            if (!timeline) return false;
            const texto = String(timeline.textContent || "").trim();
            return texto !== "" && !/carregando/i.test(texto);
        }""",
        timeout=10000,
    )


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


def _extrair_senha_temporaria(texto: str) -> str:
    match = re.search(r"Senha tempor[áa]ria para .*?:\s*(.+?)\.\s*Compartilhe", texto, flags=re.IGNORECASE | re.DOTALL)
    assert match, f"Senha temporária não encontrada no texto: {texto!r}"
    return match.group(1).strip()


def _login_cliente_primeiro_acesso(
    page: Page,
    *,
    base_url: str,
    email: str,
    senha_temporaria: str,
    nova_senha: str,
) -> None:
    page.goto(f"{base_url}/cliente/login", wait_until="domcontentloaded")
    page.locator('input[name="email"]').fill(email)
    page.locator('input[name="senha"]').fill(senha_temporaria)
    page.locator('button[type="submit"]').first.click()
    expect(page).to_have_url(re.compile(rf"{re.escape(base_url)}/cliente/trocar-senha/?$"))

    page.locator('input[name="senha_atual"]').fill(senha_temporaria)
    page.locator('input[name="nova_senha"]').fill(nova_senha)
    page.locator('input[name="confirmar_senha"]').fill(nova_senha)
    page.locator('button[type="submit"]').first.click()
    expect(page).to_have_url(re.compile(rf"{re.escape(base_url)}/cliente/painel/?$"))


def _provisionar_cliente_via_admin(
    page: Page,
    *,
    base_url: str,
    nome: str,
    email: str,
    cnpj: str,
    segmento: str,
    cidade_estado: str,
    nome_responsavel: str,
    observacoes: str,
) -> str:
    page.goto(f"{base_url}/admin/novo-cliente", wait_until="domcontentloaded")
    page.locator('input[name="nome"]').fill(nome)
    page.locator('input[name="cnpj"]').fill(cnpj)
    page.locator('select[name="plano"]').select_option("Inicial")
    page.locator('input[name="email"]').fill(email)
    page.locator('input[name="segmento"]').fill(segmento)
    page.locator('input[name="cidade_estado"]').fill(cidade_estado)
    page.locator('input[name="nome_responsavel"]').fill(nome_responsavel)
    page.locator('textarea[name="observacoes"]').fill(observacoes)
    page.locator('button[type="submit"]').click()

    expect(page).to_have_url(
        re.compile(rf"{re.escape(base_url)}/admin/clientes/\d+/?(?:\?.*)?$")
    )
    return _extrair_senha_temporaria(page.locator("body").inner_text())


def _assert_controles_flutuantes_sem_sobreposicao(page: Page) -> None:
    ids = ["btn-ir-fim-chat", "btn-toggle-ui", "btn-shell-home", "btn-shell-profile", "btn-mesa-widget-toggle"]
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
    expect(page.get_by_text("Assistente Técnico Tariel.ia")).to_be_visible()


def test_e2e_css_versionado_e_tipografia_base_ativa(
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

    diagnostico = page.evaluate(
        """() => {
            const hrefs = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                .map((el) => el.href);
            const bodyFont = getComputedStyle(document.body).fontFamily;
            const rootFontBase = getComputedStyle(document.documentElement)
                .getPropertyValue('--font-base')
                .trim();

            let possuiResetBodyComFontInherit = false;
            for (const sheet of Array.from(document.styleSheets)) {
                try {
                    for (const rule of Array.from(sheet.cssRules || [])) {
                        if (rule.selectorText === 'body, button, input, textarea, select') {
                            const font = (rule.style?.getPropertyValue('font') || '').trim();
                            const fontFamily = (rule.style?.getPropertyValue('font-family') || '').trim();
                            if (font === 'inherit' || fontFamily === 'inherit') {
                                possuiResetBodyComFontInherit = true;
                            }
                        }
                    }
                } catch (erro) {
                    // Ignora CSS cross-origin (Google Fonts).
                }
            }

            return {
                hrefs,
                possuiResetBodyComFontInherit,
            };
        }"""
    )

    assert any("/static/css/shared/global.css?v=" in href for href in diagnostico["hrefs"])
    assert any("/static/css/chat/chat_base.css?v=" in href for href in diagnostico["hrefs"])
    assert any("/static/css/shared/app_shell.css?v=" in href for href in diagnostico["hrefs"])
    assert diagnostico["possuiResetBodyComFontInherit"] is False


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


def test_e2e_modo_foco_mobile_expoe_home_e_perfil_sem_cortes(
    browser: Browser,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    contexto = browser.new_context(viewport={"width": 390, "height": 844})
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

        expect(page.locator("#btn-toggle-ui")).to_be_visible()
        page.locator("#btn-toggle-ui").click()

        expect(page.locator("#btn-shell-home")).to_be_visible()
        expect(page.locator("#btn-shell-profile")).to_be_visible()

        metricas = page.evaluate(
            """() => {
                const card = document.getElementById("tela-boas-vindas");
                if (!card) {
                    return { existe: false };
                }

                const style = window.getComputedStyle(card);
                return {
                    existe: true,
                    overflowY: style.overflowY,
                    clientHeight: card.clientHeight,
                    scrollHeight: card.scrollHeight
                };
            }"""
        )
        assert bool(metricas["existe"]) is True
        assert (
            metricas["overflowY"] in {"visible", "clip"} or
            int(metricas["scrollHeight"]) <= int(metricas["clientHeight"]) + 2
        ), str(metricas)

        page.locator("#btn-shell-profile").click()
        expect(page.locator("#modal-perfil-chat")).to_be_visible()
        expect(page.locator("#input-perfil-nome")).to_be_focused()
        page.locator("#btn-fechar-modal-perfil").click()

        page.locator("#btn-shell-home").click()
        expect(page.locator("#tela-boas-vindas")).to_be_visible()
    finally:
        contexto.close()


def test_e2e_perfil_restaura_foco_ao_fechar_no_modo_foco(
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

    page.locator("#btn-toggle-ui").click()
    expect(page.locator("#btn-shell-profile")).to_be_visible()

    page.locator("#btn-shell-profile").focus()
    expect(page.locator("#btn-shell-profile")).to_be_focused()

    page.locator("#btn-shell-profile").click()
    expect(page.locator("#modal-perfil-chat")).to_be_visible()
    expect(page.locator("#input-perfil-nome")).to_be_focused()

    page.keyboard.press("Escape")
    expect(page.locator("#modal-perfil-chat")).to_be_hidden()
    expect(page.locator("#btn-shell-profile")).to_be_focused()


def test_e2e_anexo_de_imagem_mantem_preview_unico(
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

    preview_item = page.locator("#preview-anexo .preview-item")
    page.wait_for_function("() => Boolean(window.TarielAPI?.prepararArquivoParaEnvio)")

    def _preparar_preview() -> None:
        page.evaluate(
            """(pngBase64) => {
                const bytes = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
                const arquivo = new File([bytes], "evidencia.png", { type: "image/png" });
                window.TarielAPI.prepararArquivoParaEnvio(arquivo);
            }""",
            PNG_1X1_TRANSPARENTE_B64,
        )

    _preparar_preview()
    page.wait_for_function(
        "() => document.querySelectorAll('#preview-anexo .preview-item').length === 1"
    )

    _preparar_preview()
    page.wait_for_function(
        "() => document.querySelectorAll('#preview-anexo .preview-item').length === 1"
    )

    page.locator("#preview-anexo .btn-remover-preview").click()
    expect(preview_item).to_have_count(0)


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
    expect(page.locator("#lista-gate-roteiro-template .item-gate-roteiro").first).to_be_visible()
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

    expect(page.locator("#texto-status-mesa")).to_contain_text(re.compile(r"aguardando", re.IGNORECASE))
    expect(page.locator("#mesa-widget-resumo-titulo")).to_contain_text(
        re.compile(r"aguardando resposta da mesa", re.IGNORECASE)
    )
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


def test_e2e_admin_provisiona_admin_cliente_e_portal_unificado_funciona(
    browser: Browser,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    contexto_admin = browser.new_context()
    contexto_cliente = browser.new_context()

    try:
        page_admin = contexto_admin.new_page()
        _fazer_login(
            page_admin,
            base_url=live_server_url,
            portal="admin",
            email=credenciais_seed["admin"]["email"],
            senha=credenciais_seed["admin"]["senha"],
            rota_sucesso_regex=rf"{re.escape(live_server_url)}/admin/painel/?$",
        )

        sufixo = uuid.uuid4().hex[:8]
        email_cliente = f"cliente.{sufixo}@empresa.test"
        cnpj = f"{uuid.uuid4().int % 10**14:014d}"

        page_admin.goto(f"{live_server_url}/admin/novo-cliente", wait_until="domcontentloaded")
        page_admin.locator('input[name="nome"]').fill(f"Cliente E2E {sufixo}")
        page_admin.locator('input[name="cnpj"]').fill(cnpj)
        page_admin.locator('select[name="plano"]').select_option("Inicial")
        page_admin.locator('input[name="email"]').fill(email_cliente)
        page_admin.locator('input[name="segmento"]').fill("Industrial")
        page_admin.locator('input[name="cidade_estado"]').fill("Goiânia/GO")
        page_admin.locator('input[name="nome_responsavel"]').fill("Responsável E2E")
        page_admin.locator('textarea[name="observacoes"]').fill("Provisionamento automatizado E2E.")
        page_admin.locator('button[type="submit"]').click()

        expect(page_admin).to_have_url(
            re.compile(rf"{re.escape(live_server_url)}/admin/clientes/\d+/?(?:\?.*)?$")
        )
        senha_temporaria = _extrair_senha_temporaria(page_admin.locator("body").inner_text())

        page_cliente = contexto_cliente.new_page()
        nova_senha_cliente = f"Nova@{sufixo}12345"
        _login_cliente_primeiro_acesso(
            page_cliente,
            base_url=live_server_url,
            email=email_cliente,
            senha_temporaria=senha_temporaria,
            nova_senha=nova_senha_cliente,
        )

        expect(page_cliente.locator("#hero-prioridades")).to_be_visible()
        expect(page_cliente.locator("#tab-admin")).to_be_visible()
        expect(page_cliente.locator("#tab-chat")).to_be_visible()
        expect(page_cliente.locator("#tab-mesa")).to_be_visible()
        expect(page_cliente.locator("#usuarios-busca")).to_be_visible()
        expect(page_cliente.locator("#lista-usuarios")).to_contain_text(email_cliente)
        expect(page_cliente.locator("#lista-usuarios")).not_to_contain_text("admin-cliente@tariel.ia")
        expect(page_cliente.locator("#lista-usuarios")).not_to_contain_text("inspetor@tariel.ia")
        expect(page_cliente.locator("#lista-usuarios")).not_to_contain_text("revisor@tariel.ia")

        resposta_plano = _api_fetch(
            page_cliente,
            path="/cliente/api/empresa/plano",
            method="PATCH",
            json_body={"plano": "Intermediario"},
        )
        assert resposta_plano["status"] == 200
        page_cliente.reload(wait_until="domcontentloaded")
        expect(page_cliente.locator("#empresa-cards")).to_contain_text("Intermediario", timeout=10000)
        auditoria_plano = _api_fetch(page_cliente, path="/cliente/api/auditoria")
        assert auditoria_plano["status"] == 200
        assert any(item["acao"] == "plano_alterado" for item in auditoria_plano["body"]["itens"])

        email_inspetor = f"inspetor.{sufixo}@empresa.test"
        resposta_inspetor = _api_fetch(
            page_cliente,
            path="/cliente/api/usuarios",
            method="POST",
            json_body={
                "nome": "Inspetor Cliente",
                "email": email_inspetor,
                "nivel_acesso": "inspetor",
                "telefone": "62999990000",
                "crea": "",
            },
        )
        assert resposta_inspetor["status"] == 201
        assert resposta_inspetor["body"]["senha_temporaria"]
        page_cliente.reload(wait_until="domcontentloaded")
        expect(page_cliente.locator("#admin-onboarding-resumo")).to_be_visible()
        expect(page_cliente.locator("#lista-usuarios")).to_contain_text(email_inspetor, timeout=10000)
        page_cliente.get_by_role("button", name="Ver primeiros acessos").click()
        expect(page_cliente.locator("#usuarios-resumo")).to_contain_text("Filtro rapido: Primeiros acessos", timeout=10000)
        expect(page_cliente.locator("#lista-usuarios")).to_contain_text(email_inspetor, timeout=10000)
        page_cliente.locator("#admin-onboarding-lista").get_by_role("button", name="Gerar nova senha").first.click()
        expect(page_cliente.locator("#feedback")).to_contain_text("Senha temporaria:", timeout=10000)
        prioridade_primeiro_acesso = page_cliente.locator("#hero-prioridades .priority-item").filter(
            has_text="Primeiro acesso pendente"
        )
        expect(prioridade_primeiro_acesso).to_be_visible(timeout=10000)
        prioridade_primeiro_acesso.get_by_role("button", name="Revisar equipe").click()
        expect(page_cliente.locator("#tab-admin")).to_have_attribute("aria-selected", "true")
        expect(page_cliente.locator("#usuarios-busca")).to_have_value(email_inspetor)
        expect(page_cliente.locator(f'#lista-usuarios [data-user-row="{resposta_inspetor["body"]["usuario"]["id"]}"]')).to_have_class(
            re.compile(r"user-row-highlight"),
            timeout=10000,
        )
        auditoria_usuario = _api_fetch(page_cliente, path="/cliente/api/auditoria")
        assert auditoria_usuario["status"] == 200
        assert any(item["acao"] == "usuario_criado" for item in auditoria_usuario["body"]["itens"])

        email_revisor = f"mesa.{sufixo}@empresa.test"
        resposta_revisor = _api_fetch(
            page_cliente,
            path="/cliente/api/usuarios",
            method="POST",
            json_body={
                "nome": "Mesa Cliente",
                "email": email_revisor,
                "nivel_acesso": "revisor",
                "telefone": "62999991111",
                "crea": "123456/GO",
            },
        )
        assert resposta_revisor["status"] == 201
        assert resposta_revisor["body"]["senha_temporaria"]
        page_cliente.reload(wait_until="domcontentloaded")
        expect(page_cliente.locator("#lista-usuarios")).to_contain_text(email_revisor, timeout=10000)

        resposta_laudo = _api_fetch(
            page_cliente,
            path="/cliente/api/chat/laudos",
            method="POST",
            form_body={"tipo_template": "padrao"},
        )
        assert resposta_laudo["status"] == 200
        laudo_id = int(resposta_laudo["body"]["laudo_id"])

        texto_whisper = f"@mesa Revisar fluxo do admin-cliente {sufixo}"
        resposta_chat = _api_fetch(
            page_cliente,
            path="/cliente/api/chat/mensagem",
            method="POST",
            json_body={
                "laudo_id": laudo_id,
                "mensagem": texto_whisper,
                "historico": [],
                "setor": "geral",
                "modo": "detalhado",
            },
        )
        assert resposta_chat["status"] == 200
        page_cliente.reload(wait_until="domcontentloaded")

        page_cliente.locator("#tab-chat").click()
        expect(page_cliente.locator("#chat-busca-laudos")).to_be_visible()
        expect(page_cliente.locator("#chat-contexto")).to_be_visible()
        expect(page_cliente.locator("#chat-triagem")).to_be_visible()
        expect(page_cliente.locator("#chat-movimentos")).to_be_visible()
        expect(page_cliente.locator("#btn-chat-upload-doc")).to_be_visible()
        page_cliente.get_by_role("button", name="Ver abertos").click()
        expect(page_cliente.locator("#chat-lista-resumo")).to_contain_text("Filtro rapido: Em operação", timeout=10000)
        expect(page_cliente.locator("#lista-chat-laudos")).to_contain_text("Aberto", timeout=10000)

        page_cliente.locator("#tab-mesa").click()
        expect(page_cliente.locator("#mesa-busca-laudos")).to_be_visible()
        expect(page_cliente.locator("#mesa-contexto")).to_be_visible()
        expect(page_cliente.locator("#mesa-triagem")).to_be_visible()
        expect(page_cliente.locator("#mesa-movimentos")).to_be_visible()
        page_cliente.locator("#mesa-triagem").get_by_role("button", name="Ver respostas novas").click()
        expect(page_cliente.locator("#mesa-lista-resumo")).to_contain_text("Filtro rapido: Respostas novas", timeout=10000)
        page_cliente.locator("#mesa-triagem").get_by_role("button", name="Limpar filtro rapido").click()
        page_cliente.wait_for_function(
            "() => !!document.querySelector('#lista-mesa-laudos [data-mesa]')",
            timeout=10000,
        )
        page_cliente.locator(f"#lista-mesa-laudos [data-mesa='{laudo_id}']").click()
        expect(page_cliente.locator("#mesa-mensagens")).to_contain_text(
            re.compile(r"admin-cliente", re.IGNORECASE),
            timeout=10000,
        )

        texto_resposta = f"Retorno mesa cliente {sufixo}"
        page_cliente.locator("#mesa-resposta").fill(texto_resposta)
        page_cliente.locator("#form-mesa-msg button[type='submit']").click()
        expect(page_cliente.locator("#mesa-mensagens")).to_contain_text(texto_resposta, timeout=10000)
    finally:
        contexto_admin.close()
        contexto_cliente.close()


def test_e2e_admin_cliente_isola_empresas_no_portal_unificado(
    browser: Browser,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    contexto_admin = browser.new_context()
    contexto_cliente_a = browser.new_context()
    contexto_cliente_b = browser.new_context()

    try:
        page_admin = contexto_admin.new_page()
        _fazer_login(
            page_admin,
            base_url=live_server_url,
            portal="admin",
            email=credenciais_seed["admin"]["email"],
            senha=credenciais_seed["admin"]["senha"],
            rota_sucesso_regex=rf"{re.escape(live_server_url)}/admin/painel/?$",
        )

        sufixo = uuid.uuid4().hex[:8]
        email_cliente_a = f"cliente.a.{sufixo}@empresa.test"
        email_cliente_b = f"cliente.b.{sufixo}@empresa.test"

        senha_temp_a = _provisionar_cliente_via_admin(
            page_admin,
            base_url=live_server_url,
            nome=f"Cliente A {sufixo}",
            email=email_cliente_a,
            cnpj=f"{uuid.uuid4().int % 10**14:014d}",
            segmento="Industrial A",
            cidade_estado="Goiânia/GO",
            nome_responsavel="Responsável A",
            observacoes="Cliente A criado para validar isolamento multiempresa.",
        )
        senha_temp_b = _provisionar_cliente_via_admin(
            page_admin,
            base_url=live_server_url,
            nome=f"Cliente B {sufixo}",
            email=email_cliente_b,
            cnpj=f"{uuid.uuid4().int % 10**14:014d}",
            segmento="Industrial B",
            cidade_estado="Anápolis/GO",
            nome_responsavel="Responsável B",
            observacoes="Cliente B criado para validar isolamento multiempresa.",
        )

        page_cliente_a = contexto_cliente_a.new_page()
        page_cliente_b = contexto_cliente_b.new_page()
        _login_cliente_primeiro_acesso(
            page_cliente_a,
            base_url=live_server_url,
            email=email_cliente_a,
            senha_temporaria=senha_temp_a,
            nova_senha=f"NovaA@{sufixo}12345",
        )
        _login_cliente_primeiro_acesso(
            page_cliente_b,
            base_url=live_server_url,
            email=email_cliente_b,
            senha_temporaria=senha_temp_b,
            nova_senha=f"NovaB@{sufixo}12345",
        )

        resposta_plano_a = _api_fetch(
            page_cliente_a,
            path="/cliente/api/empresa/plano",
            method="PATCH",
            json_body={"plano": "Intermediario"},
        )
        resposta_plano_b = _api_fetch(
            page_cliente_b,
            path="/cliente/api/empresa/plano",
            method="PATCH",
            json_body={"plano": "Intermediario"},
        )
        assert resposta_plano_a["status"] == 200
        assert resposta_plano_b["status"] == 200

        email_inspetor_a = f"insp.a.{sufixo}@empresa.test"
        email_inspetor_b = f"insp.b.{sufixo}@empresa.test"

        resposta_inspetor_a = _api_fetch(
            page_cliente_a,
            path="/cliente/api/usuarios",
            method="POST",
            json_body={
                "nome": "Inspetor A",
                "email": email_inspetor_a,
                "nivel_acesso": "inspetor",
                "telefone": "62990000001",
                "crea": "",
            },
        )
        assert resposta_inspetor_a["status"] == 201

        resposta_inspetor_b = _api_fetch(
            page_cliente_b,
            path="/cliente/api/usuarios",
            method="POST",
            json_body={
                "nome": "Inspetor B",
                "email": email_inspetor_b,
                "nivel_acesso": "inspetor",
                "telefone": "62990000002",
                "crea": "",
            },
        )
        assert resposta_inspetor_b["status"] == 201

        resposta_laudo_a = _api_fetch(
            page_cliente_a,
            path="/cliente/api/chat/laudos",
            method="POST",
            form_body={"tipo_template": "padrao"},
        )
        resposta_laudo_b = _api_fetch(
            page_cliente_b,
            path="/cliente/api/chat/laudos",
            method="POST",
            form_body={"tipo_template": "padrao"},
        )
        assert resposta_laudo_a["status"] == 200
        assert resposta_laudo_b["status"] == 200
        laudo_id_a = int(resposta_laudo_a["body"]["laudo_id"])
        laudo_id_b = int(resposta_laudo_b["body"]["laudo_id"])

        bootstrap_a = _api_fetch(page_cliente_a, path="/cliente/api/bootstrap")
        bootstrap_b = _api_fetch(page_cliente_b, path="/cliente/api/bootstrap")
        assert bootstrap_a["status"] == 200
        assert bootstrap_b["status"] == 200

        emails_a = {item["email"] for item in bootstrap_a["body"]["usuarios"]}
        emails_b = {item["email"] for item in bootstrap_b["body"]["usuarios"]}
        assert email_cliente_a in emails_a
        assert email_inspetor_a in emails_a
        assert email_cliente_b not in emails_a
        assert email_inspetor_b not in emails_a
        assert email_cliente_b in emails_b
        assert email_inspetor_b in emails_b
        assert email_cliente_a not in emails_b
        assert email_inspetor_a not in emails_b

        ids_laudos_a = {int(item["id"]) for item in bootstrap_a["body"]["chat"]["laudos"]}
        ids_laudos_b = {int(item["id"]) for item in bootstrap_b["body"]["chat"]["laudos"]}
        assert laudo_id_a in ids_laudos_a
        assert laudo_id_b not in ids_laudos_a
        assert laudo_id_b in ids_laudos_b
        assert laudo_id_a not in ids_laudos_b

        acesso_cruzado_chat_a = _api_fetch(
            page_cliente_a,
            path=f"/cliente/api/chat/laudos/{laudo_id_b}/mensagens",
        )
        acesso_cruzado_chat_b = _api_fetch(
            page_cliente_b,
            path=f"/cliente/api/chat/laudos/{laudo_id_a}/mensagens",
        )
        acesso_cruzado_mesa_a = _api_fetch(
            page_cliente_a,
            path=f"/cliente/api/mesa/laudos/{laudo_id_b}/mensagens",
        )
        acesso_cruzado_mesa_b = _api_fetch(
            page_cliente_b,
            path=f"/cliente/api/mesa/laudos/{laudo_id_a}/mensagens",
        )
        assert acesso_cruzado_chat_a["status"] == 404
        assert acesso_cruzado_chat_b["status"] == 404
        assert acesso_cruzado_mesa_a["status"] == 404
        assert acesso_cruzado_mesa_b["status"] == 404

        page_cliente_a.reload(wait_until="domcontentloaded")
        page_cliente_b.reload(wait_until="domcontentloaded")

        expect(page_cliente_a.locator("#lista-usuarios")).to_contain_text(email_cliente_a)
        expect(page_cliente_a.locator("#lista-usuarios")).to_contain_text(email_inspetor_a)
        expect(page_cliente_a.locator("#lista-usuarios")).not_to_contain_text(email_cliente_b)
        expect(page_cliente_a.locator("#lista-usuarios")).not_to_contain_text(email_inspetor_b)

        expect(page_cliente_b.locator("#lista-usuarios")).to_contain_text(email_cliente_b)
        expect(page_cliente_b.locator("#lista-usuarios")).to_contain_text(email_inspetor_b)
        expect(page_cliente_b.locator("#lista-usuarios")).not_to_contain_text(email_cliente_a)
        expect(page_cliente_b.locator("#lista-usuarios")).not_to_contain_text(email_inspetor_a)

        page_cliente_a.locator("#tab-chat").click()
        page_cliente_b.locator("#tab-chat").click()
        expect(page_cliente_a.locator(f'#lista-chat-laudos [data-chat="{laudo_id_a}"]')).to_be_visible(timeout=10000)
        expect(page_cliente_a.locator(f'#lista-chat-laudos [data-chat="{laudo_id_b}"]')).to_have_count(0)
        expect(page_cliente_b.locator(f'#lista-chat-laudos [data-chat="{laudo_id_b}"]')).to_be_visible(timeout=10000)
        expect(page_cliente_b.locator(f'#lista-chat-laudos [data-chat="{laudo_id_a}"]')).to_have_count(0)
    finally:
        contexto_admin.close()
        contexto_cliente_a.close()
        contexto_cliente_b.close()


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

        _abrir_laudo_no_revisor(page_revisor, laudo_id)
        expect(page_revisor.locator("#view-timeline")).to_contain_text(re.compile(r"teste UI", re.IGNORECASE))
        expect(page_revisor.locator("#mesa-operacao-painel .mesa-operacao-tag")).to_contain_text(
            re.compile(r"canal em triagem", re.IGNORECASE)
        )

        texto_resposta = f"Retorno da mesa via UI {uuid.uuid4().hex[:8]}"
        page_revisor.locator("#input-resposta").fill(texto_resposta)
        page_revisor.locator("#btn-enviar-msg").click()

        expect(
            page_revisor.locator("#view-timeline .bolha.engenharia", has_text=texto_resposta).first
        ).to_be_visible(timeout=10000)
        expect(page_revisor.locator("#mesa-operacao-painel .mesa-operacao-tag")).to_contain_text(
            re.compile(r"1 pend[êe]ncia aberta", re.IGNORECASE)
        )

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


def test_e2e_inspetor_anexa_arquivo_no_widget_mesa_e_revisor_visualiza(
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
        _carregar_laudo_no_inspetor(page_inspetor, laudo_id)
        page_inspetor.locator("#btn-mesa-widget-toggle").click()
        expect(page_inspetor.locator("#painel-mesa-widget")).to_be_visible(timeout=10000)

        page_inspetor.locator("#mesa-widget-input-anexo").set_input_files(
            {
                "name": "mesa-evidencia.png",
                "mimeType": "image/png",
                "buffer": base64.b64decode(PNG_1X1_TRANSPARENTE_B64),
            }
        )
        expect(page_inspetor.locator("#mesa-widget-preview-anexo")).to_contain_text("mesa-evidencia.png")
        page_inspetor.locator("#mesa-widget-enviar").click()

        expect(
            page_inspetor.locator("#mesa-widget-lista .anexo-mesa-link", has_text="mesa-evidencia.png").first
        ).to_be_visible(timeout=10000)

        page_revisor = contexto_revisor.new_page()
        _fazer_login(
            page_revisor,
            base_url=live_server_url,
            portal="revisao",
            email=credenciais_seed["revisor"]["email"],
            senha=credenciais_seed["revisor"]["senha"],
            rota_sucesso_regex=rf"{re.escape(live_server_url)}/revisao/painel/?$",
        )

        _abrir_laudo_no_revisor(page_revisor, laudo_id)
        expect(
            page_revisor.locator("#view-timeline .anexo-mensagem-link", has_text="mesa-evidencia.png").first
        ).to_be_visible(timeout=10000)
    finally:
        contexto_inspetor.close()
        contexto_revisor.close()


def test_e2e_revisor_anexa_arquivo_e_inspetor_visualiza_no_widget_mesa(
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
        envio_inspetor = _api_fetch(
            page_inspetor,
            path=f"/app/api/laudo/{laudo_id}/mesa/mensagem",
            method="POST",
            json_body={"texto": f"Abrindo canal de anexo UI {uuid.uuid4().hex[:8]}"},
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

        _abrir_laudo_no_revisor(page_revisor, laudo_id)

        page_revisor.locator("#input-anexo-resposta").set_input_files(
            {
                "name": "retorno-mesa.png",
                "mimeType": "image/png",
                "buffer": base64.b64decode(PNG_1X1_TRANSPARENTE_B64),
            }
        )
        expect(page_revisor.locator("#preview-resposta-anexo")).to_contain_text("retorno-mesa.png", timeout=10000)
        page_revisor.locator("#input-resposta").fill("Segue anexo complementar da mesa.")
        page_revisor.locator("#btn-enviar-msg").click()

        expect(
            page_revisor.locator("#view-timeline .anexo-mensagem-link", has_text="retorno-mesa.png").first
        ).to_be_visible(timeout=10000)

        _carregar_laudo_no_inspetor(page_inspetor, laudo_id)
        page_inspetor.locator("#btn-mesa-widget-toggle").click()
        expect(page_inspetor.locator("#painel-mesa-widget")).to_be_visible(timeout=10000)
        expect(page_inspetor.locator("#mesa-widget-resumo-titulo")).to_contain_text(
            re.compile(r"pend[êe]ncia aberta|mesa respondeu", re.IGNORECASE)
        )
        expect(
            page_inspetor.locator(
                "#mesa-widget-lista .mesa-widget-pill-operacao",
                has_text=re.compile(r"pend[êe]ncia aberta", re.IGNORECASE),
            ).first
        ).to_be_visible(timeout=10000)
        expect(
            page_inspetor.locator("#mesa-widget-lista .anexo-mesa-link", has_text="retorno-mesa.png").first
        ).to_be_visible(timeout=10000)
    finally:
        contexto_inspetor.close()
        contexto_revisor.close()


def test_e2e_revisor_exibe_painel_operacional_da_mesa(
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
        texto_inicial = f"Pendencia operacional mesa {uuid.uuid4().hex[:8]}"
        envio_inspetor = _api_fetch(
            page_inspetor,
            path=f"/app/api/laudo/{laudo_id}/mesa/mensagem",
            method="POST",
            json_body={"texto": texto_inicial},
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

        _abrir_laudo_no_revisor(page_revisor, laudo_id)

        painel_operacao = page_revisor.locator("#mesa-operacao-painel")
        expect(painel_operacao).to_be_visible(timeout=10000)
        expect(painel_operacao).to_contain_text(re.compile(r"opera[cç][aã]o da mesa", re.IGNORECASE))
        expect(painel_operacao).to_contain_text(re.compile(r"pend[êe]ncias abertas", re.IGNORECASE))
        expect(painel_operacao.locator(".mesa-operacao-tag")).to_contain_text(
            re.compile(r"canal em triagem", re.IGNORECASE)
        )

        texto_resposta = f"Abrir pendencia via painel {uuid.uuid4().hex[:8]}"
        page_revisor.locator("#input-resposta").fill(texto_resposta)
        page_revisor.locator("#btn-enviar-msg").click()

        item_pendencia = painel_operacao.locator(".mesa-operacao-item.aberta", has_text=texto_resposta).first
        expect(item_pendencia).to_be_visible(timeout=10000)
        expect(painel_operacao.locator(".mesa-operacao-tag")).to_contain_text(
            re.compile(r"1 pend[êe]ncia aberta", re.IGNORECASE)
        )
        expect(item_pendencia.locator('[data-mesa-action="alternar-pendencia"]')).to_contain_text(
            re.compile(r"marcar resolvida", re.IGNORECASE)
        )

        item_pendencia.locator('[data-mesa-action="responder-item"]').click()
        expect(page_revisor.locator("#ref-ativa-resposta")).to_be_visible(timeout=10000)
        expect(page_revisor.locator("#ref-ativa-texto")).to_contain_text(re.compile(r"Abrir pendencia via painel", re.IGNORECASE))

        item_pendencia.locator('[data-mesa-action="alternar-pendencia"]').click()
        item_resolvido = painel_operacao.locator(".mesa-operacao-item.resolvida", has_text=texto_resposta).first
        expect(item_resolvido).to_be_visible(timeout=10000)
        expect(item_resolvido).to_contain_text(re.compile(r"resolvida por", re.IGNORECASE))
        expect(item_resolvido.locator('[data-mesa-action="alternar-pendencia"]')).to_contain_text(
            re.compile(r"reabrir", re.IGNORECASE)
        )

        item_resolvido.locator('[data-mesa-action="alternar-pendencia"]').click()
        item_reaberto = painel_operacao.locator(".mesa-operacao-item.aberta", has_text=texto_resposta).first
        expect(item_reaberto).to_be_visible(timeout=10000)
    finally:
        contexto_inspetor.close()
        contexto_revisor.close()


def test_e2e_revisor_exporta_pacote_tecnico_da_mesa(
    browser: Browser,
    live_server_url: str,
    credenciais_seed: dict[str, dict[str, str]],
) -> None:
    contexto_inspetor = browser.new_context(accept_downloads=True)
    contexto_revisor = browser.new_context(accept_downloads=True)

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
        texto_inicial = f"Pacote tecnico mesa {uuid.uuid4().hex[:8]}"
        envio_inspetor = _api_fetch(
            page_inspetor,
            path=f"/app/api/laudo/{laudo_id}/mesa/mensagem",
            method="POST",
            json_body={"texto": texto_inicial},
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

        _abrir_laudo_no_revisor(page_revisor, laudo_id)

        expect(page_revisor.locator(".js-btn-pacote-resumo")).to_be_visible(timeout=10000)
        expect(page_revisor.locator(".js-btn-pacote-json")).to_be_visible(timeout=10000)
        expect(page_revisor.locator(".js-btn-pacote-pdf")).to_be_visible(timeout=10000)

        page_revisor.locator(".js-btn-pacote-resumo").click()
        expect(page_revisor.locator("#modal-pacote")).to_be_visible(timeout=10000)
        expect(page_revisor.locator("#modal-pacote-conteudo")).to_contain_text(
            re.compile(r"Mensagens|Pend[êe]ncias Abertas|Whispers Recentes", re.IGNORECASE)
        )
        page_revisor.locator("#btn-fechar-pacote").click()
        expect(page_revisor.locator("#modal-pacote")).to_be_hidden(timeout=10000)

        with page_revisor.expect_download(timeout=10000) as download_info:
            page_revisor.locator(".js-btn-pacote-json").click()
        download = download_info.value
        assert re.match(r"pacote_mesa_.+\.json$", download.suggested_filename), download.suggested_filename

        caminho_download = download.path()
        assert caminho_download, "Playwright não disponibilizou o arquivo JSON baixado."
        with open(caminho_download, encoding="utf-8") as arquivo_json:
            pacote = json.load(arquivo_json)

        assert int(pacote["laudo_id"]) == laudo_id
        assert isinstance(pacote.get("resumo_mensagens"), dict)
        assert isinstance(pacote.get("pendencias_abertas"), list)
        assert isinstance(pacote.get("whispers_recentes"), list)
        assert int(pacote["resumo_mensagens"].get("total") or 0) >= 1

        resposta_pdf = page_revisor.request.fetch(
            urljoin(page_revisor.url, f"/revisao/api/laudo/{laudo_id}/pacote/exportar-pdf"),
            method="GET",
        )
        assert resposta_pdf.status == 200
        assert "application/pdf" in resposta_pdf.headers.get("content-type", "").lower()
        assert resposta_pdf.body().startswith(b"%PDF")
    finally:
        contexto_inspetor.close()
        contexto_revisor.close()
