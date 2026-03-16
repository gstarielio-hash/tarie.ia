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
    os.getenv("RUN_E2E_LOCAL", "0") != "1",
    reason="Defina RUN_E2E_LOCAL=1 para executar o stress E2E no servidor local.",
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

    return {
        "status": resposta.status,
        "ok": resposta.ok,
        "url": resposta.url,
        "body": parsed,
        "raw": raw,
        "contentType": resposta.headers.get("content-type", ""),
    }


def _api_fetch_retry(
    page: Page,
    *,
    path: str,
    method: str = "GET",
    json_body: dict[str, Any] | None = None,
    form_body: dict[str, str] | None = None,
    tentativas: int = 7,
) -> dict[str, Any]:
    resposta: dict[str, Any] = {}
    espera = 0.35
    for tentativa in range(1, tentativas + 1):
        try:
            resposta = _api_fetch(
                page,
                path=path,
                method=method,
                json_body=json_body,
                form_body=form_body,
            )
        except Exception as erro:
            resposta = {
                "status": 0,
                "ok": False,
                "erro": str(erro),
                "body": None,
                "raw": "",
            }

        status = int(resposta.get("status", 0))
        if status not in {429, 503, 504}:
            resposta["_tentativas"] = tentativa
            return resposta
        time.sleep(espera)
        espera = min(espera * 1.7, 2.5)

    resposta["_tentativas"] = tentativas
    return resposta


def test_e2e_local_jornada_intensa_completa(
    browser: Browser,
    live_server_url: str,
) -> None:
    base_url = os.getenv("E2E_BASE_URL", "").strip().rstrip("/") or live_server_url.rstrip("/")
    rodadas = _env_int("STRESS_LAUDOS_ROUNDS", 16, 8, 80)

    inspetor_email = os.getenv("STRESS_INSPETOR_EMAIL", "stress.inspetor@tariel.local").strip()
    inspetor_senha = os.getenv("STRESS_INSPETOR_SENHA", "Stress@123456").strip()
    revisor_email = os.getenv("STRESS_REVISOR_EMAIL", "stress.revisor@tariel.local").strip()
    revisor_senha = os.getenv("STRESS_REVISOR_SENHA", "Stress@123456").strip()
    admin_email = os.getenv("STRESS_ADMIN_EMAIL", "stress.admin@tariel.local").strip()
    admin_senha = os.getenv("STRESS_ADMIN_SENHA", "Stress@123456").strip()

    templates = ("padrao", "nr12maquinas", "nr13", "rti")
    comandos_chat = ("/resumo", "/pendencias abertas", "/gerar_previa")

    contexto_inspetor = browser.new_context(viewport={"width": 1440, "height": 900})
    contexto_revisor = browser.new_context(viewport={"width": 1440, "height": 900})
    contexto_admin = browser.new_context(viewport={"width": 1440, "height": 900})

    metricas = {
        "base_url": base_url,
        "rodadas_planejadas": rodadas,
        "laudos_criados": 0,
        "mensagens_mesa_enviadas": 0,
        "respostas_revisor_ok": 0,
        "laudos_excluidos": 0,
        "laudos_bloqueados_exclusao": 0,
        "laudos_ja_ausentes": 0,
        "home_checks": 0,
        "retries_api_total": 0,
    }

    referencias_mesa_revisao: list[int] = []
    laudo_revisao_id: int | None = None

    try:
        page_inspetor = contexto_inspetor.new_page()
        _fazer_login(
            page_inspetor,
            base_url=base_url,
            portal="app",
            email=inspetor_email,
            senha=inspetor_senha,
            rota_sucesso_regex=rf"{re.escape(base_url)}/app/?$",
        )

        btn_home = page_inspetor.locator(".btn-home-cabecalho").first
        btn_mesa_widget = page_inspetor.locator("#btn-mesa-widget-toggle")
        painel_mesa = page_inspetor.locator("#painel-mesa-widget")

        expect(btn_home).to_be_visible()
        expect(btn_mesa_widget).to_be_visible()
        expect(painel_mesa).to_be_hidden()
        btn_mesa_widget.click()
        expect(painel_mesa).to_be_hidden()

        for indice in range(rodadas):
            tipo_template = templates[indice % len(templates)]
            comando = comandos_chat[indice % len(comandos_chat)]

            iniciar = _api_fetch_retry(
                page_inspetor,
                path="/app/api/laudo/iniciar",
                method="POST",
                form_body={"tipo_template": tipo_template},
            )
            metricas["retries_api_total"] += int(iniciar.get("_tentativas", 1)) - 1
            assert iniciar["status"] == 200, iniciar
            assert isinstance(iniciar["body"], dict)
            laudo_id = int(iniciar["body"]["laudo_id"])
            metricas["laudos_criados"] += 1

            comando_resp = _api_fetch_retry(
                page_inspetor,
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
            metricas["retries_api_total"] += int(comando_resp.get("_tentativas", 1)) - 1
            assert comando_resp["status"] == 200, comando_resp

            mesa_resp = _api_fetch_retry(
                page_inspetor,
                path=f"/app/api/laudo/{laudo_id}/mesa/mensagem",
                method="POST",
                json_body={"texto": f"[stress-{indice}] validar ponto da inspeção"},
            )
            metricas["retries_api_total"] += int(mesa_resp.get("_tentativas", 1)) - 1
            assert mesa_resp["status"] == 201, mesa_resp
            assert isinstance(mesa_resp["body"], dict)
            metricas["mensagens_mesa_enviadas"] += 1

            if indice % 4 == 0:
                mesa_cmd = _api_fetch_retry(
                    page_inspetor,
                    path="/app/api/chat",
                    method="POST",
                    json_body={
                        "mensagem": f"/enviar_mesa follow-up stress {indice}",
                        "dados_imagem": "",
                        "setor": "geral",
                        "historico": [],
                        "modo": "detalhado",
                        "texto_documento": "",
                        "nome_documento": "",
                        "laudo_id": laudo_id,
                    },
                )
                metricas["retries_api_total"] += int(mesa_cmd.get("_tentativas", 1)) - 1
                assert mesa_cmd["status"] == 200, mesa_cmd
                metricas["mensagens_mesa_enviadas"] += 1

            pin_resp = _api_fetch_retry(
                page_inspetor,
                path=f"/app/api/laudo/{laudo_id}/pin",
                method="PATCH",
                json_body={"pinado": bool(indice % 2)},
            )
            metricas["retries_api_total"] += int(pin_resp.get("_tentativas", 1)) - 1
            assert pin_resp["status"] == 200, pin_resp

            if indice % 3 == 0:
                btn_home.click()
                page_inspetor.wait_for_timeout(280)
                if "/app/login" in page_inspetor.url:
                    _fazer_login(
                        page_inspetor,
                        base_url=base_url,
                        portal="app",
                        email=inspetor_email,
                        senha=inspetor_senha,
                        rota_sucesso_regex=rf"{re.escape(base_url)}/app/?$",
                    )
                else:
                    expect(page_inspetor).to_have_url(
                        re.compile(rf"{re.escape(base_url)}/app/(?:\?laudo=\d+)?$")
                    )
                metricas["home_checks"] += 1

            excluir = _api_fetch_retry(
                page_inspetor,
                path=f"/app/api/laudo/{laudo_id}",
                method="DELETE",
            )
            metricas["retries_api_total"] += int(excluir.get("_tentativas", 1)) - 1
            if excluir["status"] == 200:
                metricas["laudos_excluidos"] += 1
            elif excluir["status"] == 404:
                metricas["laudos_ja_ausentes"] += 1
            elif excluir["status"] == 400:
                metricas["laudos_bloqueados_exclusao"] += 1
            else:
                assert False, excluir

        iniciar_revisao = _api_fetch_retry(
            page_inspetor,
            path="/app/api/laudo/iniciar",
            method="POST",
            form_body={"tipo_template": "padrao"},
        )
        metricas["retries_api_total"] += int(iniciar_revisao.get("_tentativas", 1)) - 1
        assert iniciar_revisao["status"] == 200, iniciar_revisao
        laudo_revisao_id = int(iniciar_revisao["body"]["laudo_id"])
        metricas["laudos_criados"] += 1
        page_inspetor.evaluate(
            """async (laudoId) => {
                try {
                    await window.TarielAPI?.sincronizarEstadoRelatorio?.();
                    await window.TarielAPI?.carregarLaudo?.(
                        laudoId,
                        { forcar: true, silencioso: true }
                    );
                } catch (_) {
                    // fallback silencioso para manter o stress rodando
                }
            }""",
            laudo_revisao_id,
        )
        page_inspetor.wait_for_timeout(320)

        for indice_mesa in range(6):
            mesa_revisao = _api_fetch_retry(
                page_inspetor,
                path=f"/app/api/laudo/{laudo_revisao_id}/mesa/mensagem",
                method="POST",
                json_body={"texto": f"[mesa-revisao-{indice_mesa}] validar evidencias"},
            )
            metricas["retries_api_total"] += int(mesa_revisao.get("_tentativas", 1)) - 1
            assert mesa_revisao["status"] == 201, mesa_revisao
            referencias_mesa_revisao.append(int(mesa_revisao["body"]["mensagem"]["id"]))
            metricas["mensagens_mesa_enviadas"] += 1

        btn_mesa_widget.click()
        expect(painel_mesa).to_be_visible()
        texto_widget = f"Mensagem widget stress {uuid.uuid4().hex[:8]}"
        page_inspetor.locator("#mesa-widget-input").fill(texto_widget)
        page_inspetor.locator("#mesa-widget-enviar").click()
        expect(
            page_inspetor.locator(
                "#mesa-widget-lista .mesa-widget-item .texto",
                has_text=texto_widget,
            ).first
        ).to_be_visible(timeout=10_000)
        metricas["mensagens_mesa_enviadas"] += 1

        page_revisor = contexto_revisor.new_page()
        _fazer_login(
            page_revisor,
            base_url=base_url,
            portal="revisao",
            email=revisor_email,
            senha=revisor_senha,
            rota_sucesso_regex=rf"{re.escape(base_url)}/revisao/painel/?$",
        )

        for msg_id in referencias_mesa_revisao:
            resposta = _api_fetch_retry(
                page_revisor,
                path=f"/revisao/api/laudo/{laudo_revisao_id}/responder",
                method="POST",
                json_body={
                    "texto": f"Revisao de mesa OK para laudo {laudo_revisao_id}.",
                    "referencia_mensagem_id": msg_id,
                },
            )
            metricas["retries_api_total"] += int(resposta.get("_tentativas", 1)) - 1
            if resposta["status"] == 200 and isinstance(resposta["body"], dict) and resposta["body"].get("success"):
                metricas["respostas_revisor_ok"] += 1

        assert metricas["respostas_revisor_ok"] >= 4, metricas

        historico_mesa = _api_fetch_retry(
            page_inspetor,
            path=f"/app/api/laudo/{laudo_revisao_id}/mesa/mensagens",
            method="GET",
        )
        metricas["retries_api_total"] += int(historico_mesa.get("_tentativas", 1)) - 1
        assert historico_mesa["status"] == 200, historico_mesa
        assert any(
            item.get("tipo") == "humano_eng"
            for item in historico_mesa["body"]["itens"]
        )

        historico_chat = _api_fetch_retry(
            page_inspetor,
            path=f"/app/api/laudo/{laudo_revisao_id}/mensagens",
            method="GET",
        )
        metricas["retries_api_total"] += int(historico_chat.get("_tentativas", 1)) - 1
        assert historico_chat["status"] == 200, historico_chat
        assert all(
            item.get("tipo") not in {"humano_insp", "humano_eng"}
            for item in historico_chat["body"]["itens"]
        )

        excluir_final = _api_fetch_retry(
            page_inspetor,
            path=f"/app/api/laudo/{laudo_revisao_id}",
            method="DELETE",
        )
        metricas["retries_api_total"] += int(excluir_final.get("_tentativas", 1)) - 1
        assert excluir_final["status"] == 200, excluir_final
        metricas["laudos_excluidos"] += 1

        page_admin = contexto_admin.new_page()
        _fazer_login(
            page_admin,
            base_url=base_url,
            portal="admin",
            email=admin_email,
            senha=admin_senha,
            rota_sucesso_regex=rf"{re.escape(base_url)}/admin/painel/?$",
        )

        for rota, regex in (
            ("/admin/painel", rf"{re.escape(base_url)}/admin/painel/?$"),
            ("/admin/clientes", rf"{re.escape(base_url)}/admin/clientes/?$"),
            ("/admin/painel", rf"{re.escape(base_url)}/admin/painel/?$"),
        ):
            page_admin.goto(f"{base_url}{rota}", wait_until="domcontentloaded")
            expect(page_admin).to_have_url(re.compile(regex))
            page_admin.reload(wait_until="domcontentloaded")
            expect(page_admin).to_have_url(re.compile(regex))
            assert "/admin/login" not in page_admin.url

        exclusoes_efetivas = metricas["laudos_excluidos"] + metricas["laudos_ja_ausentes"]
        assert metricas["laudos_criados"] == rodadas + 1, metricas
        assert metricas["mensagens_mesa_enviadas"] >= rodadas, metricas
        assert exclusoes_efetivas >= rodadas + 1, metricas
        assert metricas["home_checks"] >= max(2, rodadas // 6), metricas
        print(f"STRESS_METRICAS={json.dumps(metricas, ensure_ascii=False)}")
    finally:
        contexto_inspetor.close()
        contexto_revisor.close()
        contexto_admin.close()

