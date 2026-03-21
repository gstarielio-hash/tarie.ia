from __future__ import annotations

from tests.regras_rotas_criticas_support import (
    _login_revisor,
    _pdf_base_bytes_teste,
)


def test_revisor_restaura_base_recomendada_automatica_no_grupo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_ativo = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Base operacao auto v1",
            "codigo_template": "grupo_base_automatica",
            "versao": "1",
            "ativo": "true",
        },
        files={"arquivo_base": ("grupo_base_automatica_v1.pdf", _pdf_base_bytes_teste(), "application/pdf")},
    )
    assert resposta_ativo.status_code == 201
    id_ativo = int(resposta_ativo.json()["id"])

    resposta_word = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Base fixa temporaria v2",
            "codigo_template": "grupo_base_automatica",
            "versao": 2,
            "origem_modo": "a4",
        },
    )
    assert resposta_word.status_code == 201
    id_word = int(resposta_word.json()["id"])

    resposta_promover = client.post(
        f"/revisao/api/templates-laudo/{id_word}/base-recomendada",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_promover.status_code == 200

    resposta_restaurar = client.delete(
        f"/revisao/api/templates-laudo/{id_word}/base-recomendada",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_restaurar.status_code == 200
    corpo_restaurar = resposta_restaurar.json()
    assert corpo_restaurar["status"] == "automatico"
    assert corpo_restaurar["base_recomendada_origem"] == "automatica"
    assert corpo_restaurar["grupo_base_recomendada_id"] == id_ativo

    resposta_lista = client.get("/revisao/api/templates-laudo")
    assert resposta_lista.status_code == 200
    itens = resposta_lista.json().get("itens", [])

    grupo = [item for item in itens if item["codigo_template"] == "grupo_base_automatica"]
    assert len(grupo) == 2
    ativo = next(item for item in grupo if int(item["id"]) == id_ativo)
    word = next(item for item in grupo if int(item["id"]) == id_word)
    assert ativo["is_base_recomendada"] is True
    assert ativo["base_recomendada_origem"] == "automatica"
    assert ativo["base_recomendada_motivo"] == "Versão ativa em operação"
    assert word["is_base_recomendada"] is False
    assert word["base_recomendada_fixa"] is False
    assert word["grupo_base_recomendada_id"] == id_ativo
    assert word["grupo_base_recomendada_origem"] == "automatica"

    resposta_auditoria = client.get("/revisao/api/templates-laudo/auditoria")
    assert resposta_auditoria.status_code == 200
    itens_auditoria = resposta_auditoria.json().get("itens", [])
    restauracao = next((item for item in itens_auditoria if item["acao"] == "template_base_recomendada_automatica_restaurada"), None)
    assert restauracao is not None
    assert restauracao["payload"]["base_anterior"]["template_id"] == id_word
    assert restauracao["payload"]["base_recomendada_atual"]["template_id"] == id_ativo


def test_revisor_diff_templates_compara_versoes_do_mesmo_codigo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_v1 = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template diff v1",
            "codigo_template": "diff_word",
            "versao": 1,
            "origem_modo": "a4",
        },
    )
    assert resposta_v1.status_code == 201
    id_v1 = int(resposta_v1.json()["id"])

    resposta_v2 = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template diff v2",
            "codigo_template": "diff_word",
            "versao": 2,
            "origem_modo": "a4",
        },
    )
    assert resposta_v2.status_code == 201
    id_v2 = int(resposta_v2.json()["id"])

    for template_id, titulo, texto in (
        (
            id_v1,
            "Linha de vida",
            "Ponto A validado pelo inspetor.",
        ),
        (
            id_v2,
            "Linha de vida revisada",
            "Ponto B validado pela mesa avaliadora.",
        ),
    ):
        resposta_salvar = client.put(
            f"/revisao/api/templates-laudo/editor/{template_id}",
            headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
            json={
                "documento_editor_json": {
                    "version": 1,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "heading",
                                "attrs": {"level": 1},
                                "content": [{"type": "text", "text": titulo}],
                            },
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": texto}],
                            },
                        ],
                    },
                },
            },
        )
        assert resposta_salvar.status_code == 200

    resposta_diff = client.get(
        f"/revisao/api/templates-laudo/diff?base_id={id_v1}&comparado_id={id_v2}",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta_diff.status_code == 200
    corpo = resposta_diff.json()
    assert corpo["ok"] is True
    assert corpo["base"]["codigo_template"] == "diff_word"
    assert corpo["comparado"]["codigo_template"] == "diff_word"
    assert corpo["resumo"]["campos_alterados"] >= 1
    assert corpo["resumo"]["linhas_adicionadas"] >= 1
    assert corpo["resumo_blocos"]["alterados"] >= 1
    assert any(item["status"] == "alterado" for item in corpo["diff_blocos"])
    assert any("Ponto B validado pela mesa avaliadora." in item["texto"] for item in corpo["diff_linhas"])
    assert any(item["campo"] == "Versão" and item["mudou"] is True for item in corpo["comparacao_campos"])


def test_revisor_diff_templates_expoe_comparacao_estrutural_por_bloco(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    ids: list[int] = []
    for versao in (1, 2):
        resposta = client.post(
            "/revisao/api/templates-laudo/editor",
            headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
            json={
                "nome": f"Template estrutural v{versao}",
                "codigo_template": "diff_estrutural_word",
                "versao": versao,
                "origem_modo": "a4",
            },
        )
        assert resposta.status_code == 201
        ids.append(int(resposta.json()["id"]))

    id_v1, id_v2 = ids

    resposta_salvar_v1 = client.put(
        f"/revisao/api/templates-laudo/editor/{id_v1}",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "documento_editor_json": {
                "version": 1,
                "doc": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "heading",
                            "attrs": {"level": 1},
                            "content": [{"type": "text", "text": "Relatório técnico"}],
                        },
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": "Cliente: "},
                                {"type": "placeholder", "attrs": {"mode": "token", "key": "cliente_nome", "raw": "token:cliente_nome"}},
                            ],
                        },
                        {
                            "type": "bulletList",
                            "content": [
                                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Inspeção visual"}]}]},
                                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Checklist inicial"}]}]},
                            ],
                        },
                        {
                            "type": "table",
                            "content": [
                                {
                                    "type": "tableRow",
                                    "content": [
                                        {"type": "tableHeader", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Item"}]}]},
                                        {"type": "tableHeader", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Status"}]}]},
                                    ],
                                },
                                {
                                    "type": "tableRow",
                                    "content": [
                                        {"type": "tableCell", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "SPDA"}]}]},
                                        {"type": "tableCell", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Pendente"}]}]},
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        },
    )
    assert resposta_salvar_v1.status_code == 200

    resposta_salvar_v2 = client.put(
        f"/revisao/api/templates-laudo/editor/{id_v2}",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "documento_editor_json": {
                "version": 1,
                "doc": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "heading",
                            "attrs": {"level": 1},
                            "content": [{"type": "text", "text": "Relatório técnico revisado"}],
                        },
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": "Cliente: "},
                                {
                                    "type": "placeholder",
                                    "attrs": {
                                        "mode": "json_path",
                                        "key": "informacoes_gerais.local_inspecao",
                                        "raw": "json_path:informacoes_gerais.local_inspecao",
                                    },
                                },
                            ],
                        },
                        {
                            "type": "orderedList",
                            "content": [
                                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Inspeção visual revisada"}]}]},
                                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Checklist técnico"}]}]},
                                {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Aprovação da mesa"}]}]},
                            ],
                        },
                        {
                            "type": "table",
                            "content": [
                                {
                                    "type": "tableRow",
                                    "content": [
                                        {"type": "tableHeader", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Item"}]}]},
                                        {"type": "tableHeader", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Status"}]}]},
                                        {"type": "tableHeader", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Prioridade"}]}]},
                                    ],
                                },
                                {
                                    "type": "tableRow",
                                    "content": [
                                        {"type": "tableCell", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "SPDA"}]}]},
                                        {"type": "tableCell", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Aprovado"}]}]},
                                        {"type": "tableCell", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Alta"}]}]},
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        },
    )
    assert resposta_salvar_v2.status_code == 200

    resposta_diff = client.get(
        f"/revisao/api/templates-laudo/diff?base_id={id_v1}&comparado_id={id_v2}",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta_diff.status_code == 200
    corpo = resposta_diff.json()
    assert corpo["ok"] is True
    assert corpo["resumo_blocos"]["alterados"] >= 4
    assert any(
        item["status"] == "alterado"
        and item["base"]
        and item["base"]["tipo"] == "heading"
        for item in corpo["diff_blocos"]
    )
    assert any(
        item["status"] == "alterado"
        and item["base"]
        and item["base"]["tipo"] in {"bulletList", "orderedList"}
        and "Tipo de bloco alterado" in item["mudancas"]
        for item in corpo["diff_blocos"]
    )
    assert any(
        item["status"] == "alterado"
        and item["base"]
        and item["base"]["tipo"] == "paragraph"
        and "Placeholders alterados" in item["mudancas"]
        for item in corpo["diff_blocos"]
    )
    assert any(
        item["status"] == "alterado"
        and item["base"]
        and item["base"]["tipo"] == "table"
        and "Estrutura alterada" in item["mudancas"]
        for item in corpo["diff_blocos"]
    )
