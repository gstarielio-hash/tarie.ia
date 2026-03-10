from __future__ import annotations

import json
import os
import re
import time
from typing import Any

import pytest
from playwright.sync_api import Browser, Page, expect


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_E2E_LOCAL", "0") != "1",
    reason="Defina RUN_E2E_LOCAL=1 para executar o stress paralelo local.",
)


def _env_int(nome: str, padrao: int, minimo: int, maximo: int) -> int:
    bruto = os.getenv(nome, str(padrao)).strip()
    try:
        valor = int(bruto)
    except ValueError:
        return padrao
    return max(minimo, min(maximo, valor))


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
    return page.evaluate(
        """async ({ path, method, jsonBody, formBody }) => {
            const metaToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
            const inputToken = document.querySelector('input[name="csrf_token"]')?.value || "";
            const bootToken = window?.__BOOTSTRAP__?.csrfToken || window?.__APP_BOOTSTRAP__?.csrfToken || "";
            const csrfToken = metaToken || inputToken || bootToken;

            const headers = {};
            if (csrfToken) {
                headers["X-CSRF-Token"] = csrfToken;
            }

            const init = { method, headers, credentials: "same-origin" };

            if (jsonBody !== null) {
                headers["Content-Type"] = "application/json";
                init.body = JSON.stringify(jsonBody);
            } else if (formBody !== null) {
                init.body = new URLSearchParams(formBody);
            }

            const response = await fetch(path, init);
            const raw = await response.text();
            let parsed = null;
            try {
                parsed = JSON.parse(raw);
            } catch (_err) {
                parsed = null;
            }

            return {
                status: response.status,
                ok: response.ok,
                url: response.url,
                body: parsed,
                raw,
                contentType: response.headers.get("content-type") || "",
            };
        }""",
        {
            "path": path,
            "method": method,
            "jsonBody": json_body,
            "formBody": form_body,
        },
    )


def _api_fetch_retry(
    page: Page,
    *,
    path: str,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
    form_body: dict[str, str] | None = None,
    tentativas: int = 5,
) -> dict[str, Any]:
    resposta: dict[str, Any] = {}
    espera = 0.30
    for tentativa in range(1, tentativas + 1):
        resposta = _api_fetch(
            page,
            path=path,
            method=method,
            json_body=json_body,
            form_body=form_body,
        )
        status = int(resposta.get("status", 0))
        if status not in {429, 503, 504}:
            resposta["_tentativas"] = tentativa
            return resposta
        time.sleep(espera)
        espera = min(espera * 1.8, 2.2)

    resposta["_tentativas"] = tentativas
    return resposta


def _rodar_ciclo_inspetor(
    page: Page,
    *,
    base_url: str,
    rodada: int,
    prefixo: str,
    templates: tuple[str, ...],
    comandos: tuple[str, ...],
    metricas: dict[str, int],
    referencias: list[tuple[int, int]],
    home_requests: list[str],
) -> None:
    tipo_template = templates[rodada % len(templates)]
    comando = comandos[rodada % len(comandos)]

    iniciar = _api_fetch_retry(
        page,
        path="/app/api/laudo/iniciar",
        method="POST",
        form_body={"tipo_template": tipo_template},
    )
    metricas["retries_api_total"] += int(iniciar.get("_tentativas", 1)) - 1
    assert iniciar["status"] == 200, iniciar
    laudo_id = int(iniciar["body"]["laudo_id"])
    metricas["laudos_criados"] += 1

    resposta_comando = _api_fetch_retry(
        page,
        path="/app/api/chat",
        method="POST",
        json_body={
            "mensagem": comando,
            "dados_imagem": "",
            "setor": "geral",
            "historico": [],
            "modo": "detalhado",
            "texto_documento": "",
            "nome_documento": "",
            "laudo_id": laudo_id,
        },
    )
    metricas["retries_api_total"] += int(resposta_comando.get("_tentativas", 1)) - 1
    assert resposta_comando["status"] == 200, resposta_comando

    mesa_msg = _api_fetch_retry(
        page,
        path=f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        method="POST",
        json_body={"texto": f"[{prefixo}-r{rodada}] validar item de campo"},
    )
    metricas["retries_api_total"] += int(mesa_msg.get("_tentativas", 1)) - 1
    assert mesa_msg["status"] == 201, mesa_msg
    msg_id = int(mesa_msg["body"]["mensagem"]["id"])
    referencias.append((laudo_id, msg_id))
    metricas["mensagens_mesa_enviadas"] += 1

    pin_resp = _api_fetch_retry(
        page,
        path=f"/app/api/laudo/{laudo_id}/pin",
        method="PATCH",
        json_body={"pinado": bool(rodada % 2)},
    )
    metricas["retries_api_total"] += int(pin_resp.get("_tentativas", 1)) - 1
    assert pin_resp["status"] == 200, pin_resp

    btn_home = page.locator(".btn-home-cabecalho").first
    expect(btn_home).to_be_visible()
    btn_home.click()
    expect(page).to_have_url(
        re.compile(rf"{re.escape(base_url)}/app/(?:\?laudo=\d+)?$")
    )
    assert "/app/login" not in page.url
    metricas["home_checks"] += 1

    page.reload(wait_until="domcontentloaded")
    expect(page).to_have_url(
        re.compile(rf"{re.escape(base_url)}/app/(?:\?laudo=\d+)?$")
    )
    assert "/app/login" not in page.url
    metricas["reload_checks"] += 1

    deletar = _api_fetch_retry(
        page,
        path=f"/app/api/laudo/{laudo_id}",
        method="DELETE",
    )
    metricas["retries_api_total"] += int(deletar.get("_tentativas", 1)) - 1
    assert deletar["status"] == 200, deletar
    metricas["laudos_excluidos"] += 1

    # Verifica que o Home não acionou logout por engano na rodada.
    assert not any("/app/logout" in req for req in home_requests)


def test_e2e_local_parallel_jornada_multipla(
    browser: Browser,
    live_server_url: str,
) -> None:
    base_url = os.getenv("E2E_BASE_URL", "").strip().rstrip("/") or live_server_url.rstrip("/")
    rodadas = _env_int("STRESS_PARALLEL_ROUNDS", 14, 8, 40)

    inspetor_a_email = os.getenv("STRESS_INSPETOR_EMAIL", "stress.inspetor@wf.local").strip()
    inspetor_b_email = os.getenv("STRESS_INSPETOR2_EMAIL", "stress.inspetor2@wf.local").strip()
    inspetor_senha = os.getenv("STRESS_INSPETOR_SENHA", "Stress@123456").strip()
    revisor_email = os.getenv("STRESS_REVISOR_EMAIL", "stress.revisor@wf.local").strip()
    revisor_senha = os.getenv("STRESS_REVISOR_SENHA", "Stress@123456").strip()
    admin_email = os.getenv("STRESS_ADMIN_EMAIL", "stress.admin@wf.local").strip()
    admin_senha = os.getenv("STRESS_ADMIN_SENHA", "Stress@123456").strip()

    templates = ("padrao", "nr12maquinas", "nr13", "rti")
    comandos = ("/resumo", "/pendencias abertas", "/gerar_previa")

    ctx_a = browser.new_context(viewport={"width": 1366, "height": 900})
    ctx_b = browser.new_context(viewport={"width": 1366, "height": 900})
    ctx_revisor = browser.new_context(viewport={"width": 1440, "height": 900})
    ctx_admin = browser.new_context(viewport={"width": 1440, "height": 900})

    metricas = {
        "rodadas_planejadas": rodadas,
        "laudos_criados": 0,
        "mensagens_mesa_enviadas": 0,
        "respostas_revisor_ok": 0,
        "laudos_excluidos": 0,
        "home_checks": 0,
        "reload_checks": 0,
        "admin_checks": 0,
        "retries_api_total": 0,
    }

    refs_a: list[tuple[int, int]] = []
    refs_b: list[tuple[int, int]] = []

    try:
        page_a = ctx_a.new_page()
        page_b = ctx_b.new_page()
        page_revisor = ctx_revisor.new_page()
        page_admin = ctx_admin.new_page()

        reqs_a: list[str] = []
        reqs_b: list[str] = []

        page_a.on("request", lambda req: reqs_a.append(f"{req.method} {req.url}"))
        page_b.on("request", lambda req: reqs_b.append(f"{req.method} {req.url}"))

        _fazer_login(
            page_a,
            base_url=base_url,
            portal="app",
            email=inspetor_a_email,
            senha=inspetor_senha,
            rota_sucesso_regex=rf"{re.escape(base_url)}/app/?$",
        )
        _fazer_login(
            page_b,
            base_url=base_url,
            portal="app",
            email=inspetor_b_email,
            senha=inspetor_senha,
            rota_sucesso_regex=rf"{re.escape(base_url)}/app/?$",
        )
        _fazer_login(
            page_revisor,
            base_url=base_url,
            portal="revisao",
            email=revisor_email,
            senha=revisor_senha,
            rota_sucesso_regex=rf"{re.escape(base_url)}/revisao/painel/?$",
        )
        _fazer_login(
            page_admin,
            base_url=base_url,
            portal="admin",
            email=admin_email,
            senha=admin_senha,
            rota_sucesso_regex=rf"{re.escape(base_url)}/admin/painel/?$",
        )

        for rodada in range(rodadas):
            _rodar_ciclo_inspetor(
                page_a,
                base_url=base_url,
                rodada=rodada,
                prefixo="insp-a",
                templates=templates,
                comandos=comandos,
                metricas=metricas,
                referencias=refs_a,
                home_requests=reqs_a,
            )
            _rodar_ciclo_inspetor(
                page_b,
                base_url=base_url,
                rodada=rodada,
                prefixo="insp-b",
                templates=templates,
                comandos=comandos,
                metricas=metricas,
                referencias=refs_b,
                home_requests=reqs_b,
            )

            # Navegação admin em paralelo ao uso do chat.
            rota_admin = "/admin/clientes" if rodada % 2 == 0 else "/admin/painel"
            page_admin.goto(f"{base_url}{rota_admin}", wait_until="domcontentloaded")
            assert "/admin/login" not in page_admin.url
            metricas["admin_checks"] += 1

        # Laudo dedicado para validar troca bilateral inspetor<->revisor via mesa.
        iniciar_final = _api_fetch_retry(
            page_a,
            path="/app/api/laudo/iniciar",
            method="POST",
            form_body={"tipo_template": "padrao"},
        )
        metricas["retries_api_total"] += int(iniciar_final.get("_tentativas", 1)) - 1
        assert iniciar_final["status"] == 200, iniciar_final
        laudo_final = int(iniciar_final["body"]["laudo_id"])
        metricas["laudos_criados"] += 1

        refs_final: list[int] = []
        for idx in range(8):
            envio_mesa = _api_fetch_retry(
                page_a,
                path=f"/app/api/laudo/{laudo_final}/mesa/mensagem",
                method="POST",
                json_body={"texto": f"[final-{idx}] revisar pendencia critica"},
            )
            metricas["retries_api_total"] += int(envio_mesa.get("_tentativas", 1)) - 1
            assert envio_mesa["status"] == 201, envio_mesa
            refs_final.append(int(envio_mesa["body"]["mensagem"]["id"]))
            metricas["mensagens_mesa_enviadas"] += 1

        for ref_id in refs_final:
            resposta = _api_fetch_retry(
                page_revisor,
                path=f"/revisao/api/laudo/{laudo_final}/responder",
                method="POST",
                json_body={
                    "texto": f"Mesa validou referencia {ref_id}.",
                    "referencia_mensagem_id": ref_id,
                },
            )
            metricas["retries_api_total"] += int(resposta.get("_tentativas", 1)) - 1
            assert resposta["status"] == 200, resposta
            metricas["respostas_revisor_ok"] += 1

        hist_mesa = _api_fetch_retry(
            page_a,
            path=f"/app/api/laudo/{laudo_final}/mesa/mensagens",
            method="GET",
        )
        metricas["retries_api_total"] += int(hist_mesa.get("_tentativas", 1)) - 1
        assert hist_mesa["status"] == 200, hist_mesa
        assert any(item.get("tipo") == "humano_eng" for item in hist_mesa["body"]["itens"])

        hist_chat = _api_fetch_retry(
            page_a,
            path=f"/app/api/laudo/{laudo_final}/mensagens",
            method="GET",
        )
        metricas["retries_api_total"] += int(hist_chat.get("_tentativas", 1)) - 1
        assert hist_chat["status"] == 200, hist_chat
        assert all(
            item.get("tipo") not in {"humano_insp", "humano_eng"}
            for item in hist_chat["body"]["itens"]
        )

        deletar_final = _api_fetch_retry(
            page_a,
            path=f"/app/api/laudo/{laudo_final}",
            method="DELETE",
        )
        metricas["retries_api_total"] += int(deletar_final.get("_tentativas", 1)) - 1
        assert deletar_final["status"] == 200, deletar_final
        metricas["laudos_excluidos"] += 1

        assert metricas["laudos_criados"] == (rodadas * 2) + 1, metricas
        assert metricas["laudos_excluidos"] == (rodadas * 2) + 1, metricas
        assert metricas["home_checks"] >= rodadas * 2, metricas
        assert metricas["reload_checks"] >= rodadas * 2, metricas
        assert metricas["respostas_revisor_ok"] == 8, metricas
        assert metricas["admin_checks"] == rodadas, metricas
        assert not any("/app/logout" in req for req in reqs_a), metricas
        assert not any("/app/logout" in req for req in reqs_b), metricas
        print(f"PARALLEL_STRESS_METRICAS={json.dumps(metricas, ensure_ascii=False)}")
    finally:
        ctx_a.close()
        ctx_b.close()
        ctx_revisor.close()
        ctx_admin.close()
