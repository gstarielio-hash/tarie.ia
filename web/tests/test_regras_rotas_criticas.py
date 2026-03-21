from __future__ import annotations

import io
import json
import os
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

import app.shared.security as seguranca
import main
import app.domains.admin.routes as rotas_admin
import app.domains.chat.routes as rotas_inspetor
from app.shared.database import (
    AprendizadoVisualIa,
    AnexoMesa,
    Laudo,
    LaudoRevisao,
    MensagemLaudo,
    NivelAcesso,
    RegistroAuditoriaEmpresa,
    SessaoAtiva,
    StatusRevisao,
    TemplateLaudo,
    TipoMensagem,
    Usuario,
)
from app.shared.security import verificar_senha
from tests.regras_rotas_criticas_support import (
    SENHA_PADRAO,
    SENHA_HASH_PADRAO,
    _criar_laudo,
    _criar_template_ativo,
    _csrf_pagina,
    _extrair_csrf,
    _imagem_png_bytes_teste,
    _imagem_png_data_uri_teste,
    _login_admin,
    _login_app_inspetor,
    _login_revisor,
    _pdf_base_bytes_teste,
    _salvar_pdf_temporario_teste,
)
def test_404_em_rotas_api_app_retorna_json_sem_redirect(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.get("/app/api/rota-que-nao-existe", follow_redirects=False)

    assert resposta.status_code == 404
    assert "application/json" in (resposta.headers.get("content-type", "").lower())
    assert resposta.json()["detail"] == "Recurso não encontrado."


def test_404_em_rotas_api_revisao_retorna_json_sem_redirect(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    _login_revisor(client, "revisor@empresa-a.test")

    resposta = client.get("/revisao/api/rota-que-nao-existe", follow_redirects=False)

    assert resposta.status_code == 404
    assert "application/json" in (resposta.headers.get("content-type", "").lower())
    assert resposta.json()["detail"] == "Recurso não encontrado."


def test_revisor_login_funciona_e_painel_abre(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_revisor(client, "revisor@empresa-a.test")
    painel = client.get("/revisao/painel")

    assert painel.status_code == 200


def test_revisor_tela_templates_laudo_abre(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    _login_revisor(client, "revisor@empresa-a.test")

    resposta = client.get("/revisao/templates-laudo")

    assert resposta.status_code == 200
    assert "Biblioteca de Templates" in resposta.text
    assert "Biblioteca Profissional de Templates" in resposta.text
    assert "Criar seu modelo" in resposta.text
    assert "Templates da Empresa" in resposta.text
    assert 'name="csrf-token"' in resposta.text


def test_revisor_tela_editor_word_templates_abre(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    _login_revisor(client, "revisor@empresa-a.test")

    resposta = client.get("/revisao/templates-laudo/editor")

    assert resposta.status_code == 200
    assert "Editor Word" in resposta.text
    assert "Editor Word da Mesa" in resposta.text
    assert "Criar no Word (A4)" in resposta.text


def test_revisor_upload_template_laudo_e_lista(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    mapeamento = {
        "pages": [
            {
                "page": 1,
                "fields": [
                    {
                        "key": "informacoes_gerais.responsavel_pela_inspecao",
                        "x": 12,
                        "y": 95,
                        "w": 90,
                        "h": 4.5,
                        "font_size": 8,
                    }
                ],
            }
        ]
    }

    resposta_upload = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Checklist CBMGO Padrão",
            "codigo_template": "cbmgo_cmar",
            "versao": "1",
            "mapeamento_campos_json": json.dumps(mapeamento),
        },
        files={
            "arquivo_base": ("cbmgo_base.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )

    assert resposta_upload.status_code == 201
    corpo_upload = resposta_upload.json()
    template_id = int(corpo_upload["id"])
    assert corpo_upload["codigo_template"] == "cbmgo_cmar"
    assert corpo_upload["versao"] == 1

    resposta_lista = client.get("/revisao/api/templates-laudo")
    assert resposta_lista.status_code == 200
    corpo_lista = resposta_lista.json()
    assert any(int(item["id"]) == template_id for item in corpo_lista["itens"])

    with SessionLocal() as banco:
        template = banco.get(TemplateLaudo, template_id)
        assert template is not None
        assert template.nome == "Checklist CBMGO Padrão"
        assert template.codigo_template == "cbmgo_cmar"
        assert template.arquivo_pdf_base.lower().endswith(".pdf")


def test_revisor_arquivo_base_template_laudo_retorna_pdf(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_upload = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Template para baixar base",
            "codigo_template": "cbmgo_cmar",
            "versao": "4",
        },
        files={
            "arquivo_base": ("cbmgo_base.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )
    assert resposta_upload.status_code == 201
    template_id = int(resposta_upload.json()["id"])

    resposta_pdf_base = client.get(f"/revisao/api/templates-laudo/{template_id}/arquivo-base")

    assert resposta_pdf_base.status_code == 200
    assert "application/pdf" in (resposta_pdf_base.headers.get("content-type", "").lower())
    assert resposta_pdf_base.content.startswith(b"%PDF")


def test_revisor_preview_template_laudo_retorna_pdf(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_upload = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Checklist CBMGO Preview",
            "codigo_template": "cbmgo_cmar",
            "versao": "2",
        },
        files={
            "arquivo_base": ("cbmgo_base.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )
    assert resposta_upload.status_code == 201
    template_id = int(resposta_upload.json()["id"])

    payload_preview = {
        "dados_formulario": {
            "informacoes_gerais": {
                "responsavel_pela_inspecao": "Gabriel Santos",
                "data_inspecao": "09/03/2026",
                "local_inspecao": "Planta Norte",
            },
            "trrf_observacoes": "TRRF preliminar alinhado ao memorial.",
            "resumo_executivo": "Prévia de teste para validação da mesa.",
        }
    }

    resposta_preview = client.post(
        f"/revisao/api/templates-laudo/{template_id}/preview",
        headers={"X-CSRF-Token": csrf},
        json=payload_preview,
    )

    assert resposta_preview.status_code == 200
    assert "application/pdf" in (resposta_preview.headers.get("content-type", "").lower())
    assert resposta_preview.content.startswith(b"%PDF")

    with SessionLocal() as banco:
        template = banco.get(TemplateLaudo, template_id)
        assert template is not None
        assert template.mapeamento_campos_json is not None


def test_revisor_publicar_template_desativa_ativo_anterior(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_v1 = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Template CBMGO v1",
            "codigo_template": "cbmgo_cmar",
            "versao": "10",
            "ativo": "true",
        },
        files={
            "arquivo_base": ("cbmgo_v1.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )
    assert resposta_v1.status_code == 201
    id_v1 = int(resposta_v1.json()["id"])

    resposta_v2 = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Template CBMGO v2",
            "codigo_template": "cbmgo_cmar",
            "versao": "11",
        },
        files={
            "arquivo_base": ("cbmgo_v2.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )
    assert resposta_v2.status_code == 201
    id_v2 = int(resposta_v2.json()["id"])

    resposta_publicar = client.post(
        f"/revisao/api/templates-laudo/{id_v2}/publicar",
        headers={"X-CSRF-Token": csrf},
        data={"csrf_token": csrf},
    )
    assert resposta_publicar.status_code == 200
    assert resposta_publicar.json().get("status") == "publicado"

    with SessionLocal() as banco:
        template_v1 = banco.get(TemplateLaudo, id_v1)
        template_v2 = banco.get(TemplateLaudo, id_v2)
        assert template_v1 is not None
        assert template_v2 is not None
        assert template_v1.ativo is False
        assert template_v2.ativo is True


def test_revisor_lote_status_templates_atualiza_ciclo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_v1 = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Template lote v1",
            "codigo_template": "lote_status",
            "versao": "1",
            "ativo": "true",
        },
        files={"arquivo_base": ("lote_v1.pdf", _pdf_base_bytes_teste(), "application/pdf")},
    )
    assert resposta_v1.status_code == 201
    id_v1 = int(resposta_v1.json()["id"])

    resposta_v2 = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Template lote v2",
            "codigo_template": "lote_status",
            "versao": "2",
        },
        files={"arquivo_base": ("lote_v2.pdf", _pdf_base_bytes_teste(), "application/pdf")},
    )
    assert resposta_v2.status_code == 201
    id_v2 = int(resposta_v2.json()["id"])

    resposta_lote = client.post(
        "/revisao/api/templates-laudo/lote/status",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={"template_ids": [id_v1, id_v2], "status_template": "em_teste"},
    )

    assert resposta_lote.status_code == 200
    corpo = resposta_lote.json()
    assert corpo["total"] == 2
    assert corpo["status_template"] == "em_teste"

    with SessionLocal() as banco:
        template_v1 = banco.get(TemplateLaudo, id_v1)
        template_v2 = banco.get(TemplateLaudo, id_v2)
        assert template_v1 is not None
        assert template_v2 is not None
        assert template_v1.status_template == "em_teste"
        assert template_v2.status_template == "em_teste"
        assert template_v1.ativo is False
        assert template_v2.ativo is False


def test_revisor_lote_excluir_templates_remove_selecao(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    ids_templates: list[int] = []
    for versao in (1, 2):
        resposta = client.post(
            "/revisao/api/templates-laudo/upload",
            headers={"X-CSRF-Token": csrf},
            data={
                "nome": f"Template excluir lote v{versao}",
                "codigo_template": "lote_excluir",
                "versao": str(versao),
            },
            files={"arquivo_base": (f"lote_delete_{versao}.pdf", _pdf_base_bytes_teste(), "application/pdf")},
        )
        assert resposta.status_code == 201
        ids_templates.append(int(resposta.json()["id"]))

    resposta_lote = client.post(
        "/revisao/api/templates-laudo/lote/excluir",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={"template_ids": ids_templates},
    )

    assert resposta_lote.status_code == 200
    corpo = resposta_lote.json()
    assert corpo["total"] == 2
    assert corpo["status"] == "excluido"

    with SessionLocal() as banco:
        assert all(banco.get(TemplateLaudo, item_id) is None for item_id in ids_templates)


def test_revisor_criar_template_editor_rico_e_detalhar(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_criar = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={
            "X-CSRF-Token": csrf,
            "Content-Type": "application/json",
        },
        json={
            "nome": "Template Word Tariel.ia",
            "codigo_template": "rti_word",
            "versao": 1,
            "origem_modo": "a4",
        },
    )

    assert resposta_criar.status_code == 201
    corpo_criar = resposta_criar.json()
    template_id = int(corpo_criar["id"])
    assert corpo_criar["modo_editor"] == "editor_rico"
    assert corpo_criar["is_editor_rico"] is True

    resposta_editor = client.get(f"/revisao/api/templates-laudo/editor/{template_id}")
    assert resposta_editor.status_code == 200
    corpo_editor = resposta_editor.json()
    assert int(corpo_editor["id"]) == template_id
    assert corpo_editor["modo_editor"] == "editor_rico"
    assert isinstance(corpo_editor.get("documento_editor_json"), dict)
    assert isinstance(corpo_editor.get("estilo_json"), dict)

    resposta_lista = client.get("/revisao/api/templates-laudo")
    assert resposta_lista.status_code == 200
    itens = resposta_lista.json().get("itens", [])
    encontrado = next((it for it in itens if int(it["id"]) == template_id), None)
    assert encontrado is not None
    assert encontrado["is_editor_rico"] is True


def test_revisor_lista_templates_expoe_grupo_e_base_recomendada(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_ativo = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Grupo ativo v1",
            "codigo_template": "grupo_versionado",
            "versao": "1",
            "ativo": "true",
        },
        files={"arquivo_base": ("grupo_ativo_v1.pdf", _pdf_base_bytes_teste(), "application/pdf")},
    )
    assert resposta_ativo.status_code == 201
    id_ativo = int(resposta_ativo.json()["id"])

    resposta_word = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Grupo ativo v2 word",
            "codigo_template": "grupo_versionado",
            "versao": 2,
            "origem_modo": "a4",
        },
    )
    assert resposta_word.status_code == 201
    id_word = int(resposta_word.json()["id"])

    resposta_teste = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Grupo ativo v3 teste",
            "codigo_template": "grupo_versionado",
            "versao": "3",
            "status_template": "em_teste",
        },
        files={"arquivo_base": ("grupo_teste_v3.pdf", _pdf_base_bytes_teste(), "application/pdf")},
    )
    assert resposta_teste.status_code == 201
    id_teste = int(resposta_teste.json()["id"])

    resposta_sem_ativo_teste = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Grupo sem ativo v1 teste",
            "codigo_template": "grupo_sem_ativo",
            "versao": "1",
            "status_template": "em_teste",
        },
        files={"arquivo_base": ("grupo_sem_ativo_v1.pdf", _pdf_base_bytes_teste(), "application/pdf")},
    )
    assert resposta_sem_ativo_teste.status_code == 201
    id_sem_ativo_teste = int(resposta_sem_ativo_teste.json()["id"])

    resposta_sem_ativo_rascunho = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Grupo sem ativo v2 rascunho",
            "codigo_template": "grupo_sem_ativo",
            "versao": "2",
            "status_template": "rascunho",
        },
        files={"arquivo_base": ("grupo_sem_ativo_v2.pdf", _pdf_base_bytes_teste(), "application/pdf")},
    )
    assert resposta_sem_ativo_rascunho.status_code == 201
    id_sem_ativo_rascunho = int(resposta_sem_ativo_rascunho.json()["id"])

    resposta_lista = client.get("/revisao/api/templates-laudo")
    assert resposta_lista.status_code == 200
    itens = resposta_lista.json().get("itens", [])

    grupo_principal = [item for item in itens if item["codigo_template"] == "grupo_versionado"]
    assert len(grupo_principal) == 3
    ativo = next(item for item in grupo_principal if int(item["id"]) == id_ativo)
    word = next(item for item in grupo_principal if int(item["id"]) == id_word)
    teste = next(item for item in grupo_principal if int(item["id"]) == id_teste)
    assert ativo["is_base_recomendada"] is True
    assert ativo["base_recomendada_motivo"] == "Versão ativa em operação"
    assert ativo["grupo_total_versoes"] == 3
    assert ativo["grupo_total_word"] == 1
    assert ativo["grupo_total_pdf"] == 2
    assert ativo["grupo_versao_mais_recente"] == 3
    assert ativo["grupo_template_ativo_id"] == id_ativo
    assert ativo["grupo_base_recomendada_id"] == id_ativo
    assert ativo["grupo_versoes_disponiveis"] == [3, 2, 1]
    assert word["grupo_base_recomendada_id"] == id_ativo
    assert teste["grupo_base_recomendada_id"] == id_ativo

    grupo_sem_ativo = [item for item in itens if item["codigo_template"] == "grupo_sem_ativo"]
    assert len(grupo_sem_ativo) == 2
    sem_ativo_teste = next(item for item in grupo_sem_ativo if int(item["id"]) == id_sem_ativo_teste)
    sem_ativo_rascunho = next(item for item in grupo_sem_ativo if int(item["id"]) == id_sem_ativo_rascunho)
    assert sem_ativo_teste["is_base_recomendada"] is True
    assert sem_ativo_teste["base_recomendada_motivo"] == "Versão em teste mais madura"
    assert sem_ativo_teste["grupo_base_recomendada_id"] == id_sem_ativo_teste
    assert sem_ativo_rascunho["grupo_base_recomendada_id"] == id_sem_ativo_teste


def test_revisor_promove_base_recomendada_manual_no_grupo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_ativo = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Base operacao v1",
            "codigo_template": "grupo_promocao_base",
            "versao": "1",
            "ativo": "true",
        },
        files={"arquivo_base": ("grupo_promocao_base_v1.pdf", _pdf_base_bytes_teste(), "application/pdf")},
    )
    assert resposta_ativo.status_code == 201
    id_ativo = int(resposta_ativo.json()["id"])

    resposta_word = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Base editorial v2",
            "codigo_template": "grupo_promocao_base",
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
    corpo_promover = resposta_promover.json()
    assert corpo_promover["status"] == "promovido"
    assert corpo_promover["base_recomendada_fixa"] is True
    assert corpo_promover["base_recomendada_origem"] == "manual"

    resposta_lista = client.get("/revisao/api/templates-laudo")
    assert resposta_lista.status_code == 200
    itens = resposta_lista.json().get("itens", [])

    grupo = [item for item in itens if item["codigo_template"] == "grupo_promocao_base"]
    assert len(grupo) == 2
    ativo = next(item for item in grupo if int(item["id"]) == id_ativo)
    word = next(item for item in grupo if int(item["id"]) == id_word)
    assert ativo["ativo"] is True
    assert ativo["grupo_base_recomendada_id"] == id_word
    assert ativo["grupo_base_recomendada_origem"] == "manual"
    assert ativo["is_base_recomendada"] is False
    assert word["is_base_recomendada"] is True
    assert word["base_recomendada_fixa"] is True
    assert word["base_recomendada_origem"] == "manual"
    assert word["base_recomendada_motivo"] == "Base promovida manualmente pela mesa"
    assert word["grupo_base_recomendada_id"] == id_word

    resposta_auditoria = client.get("/revisao/api/templates-laudo/auditoria")
    assert resposta_auditoria.status_code == 200
    itens_auditoria = resposta_auditoria.json().get("itens", [])
    promotoria = next((item for item in itens_auditoria if item["acao"] == "template_base_recomendada_promovida"), None)
    assert promotoria is not None
    assert promotoria["payload"]["template_recomendado"]["template_id"] == id_word
    assert promotoria["payload"]["base_anterior"]["template_id"] == id_ativo
def test_revisor_biblioteca_templates_registra_auditoria_operacional(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    template_ids: list[int] = []
    for versao in (1, 2, 3, 4):
        resposta = client.post(
            "/revisao/api/templates-laudo/editor",
            headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
            json={
                "nome": f"Template auditoria v{versao}",
                "codigo_template": "auditoria_templates",
                "versao": versao,
                "origem_modo": "a4",
            },
        )
        assert resposta.status_code == 201
        template_ids.append(int(resposta.json()["id"]))

    id_publicar, id_lote_a, id_lote_b, id_excluir = template_ids

    resposta_publicar = client.post(
        f"/revisao/api/templates-laudo/editor/{id_publicar}/publicar",
        headers={"X-CSRF-Token": csrf},
        data={"csrf_token": csrf},
    )
    assert resposta_publicar.status_code == 200

    resposta_lote = client.post(
        "/revisao/api/templates-laudo/lote/status",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "template_ids": [id_lote_a, id_lote_b],
            "status_template": "em_teste",
        },
    )
    assert resposta_lote.status_code == 200

    resposta_clonar = client.post(
        f"/revisao/api/templates-laudo/{id_lote_a}/clonar",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_clonar.status_code == 201
    clone_id = int(resposta_clonar.json()["id"])

    resposta_excluir_lote = client.post(
        "/revisao/api/templates-laudo/lote/excluir",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={"template_ids": [id_excluir]},
    )
    assert resposta_excluir_lote.status_code == 200

    resposta_auditoria = client.get("/revisao/api/templates-laudo/auditoria")
    assert resposta_auditoria.status_code == 200
    itens = resposta_auditoria.json()["itens"]
    acoes = {item["acao"] for item in itens}
    assert {
        "template_criado_word",
        "template_publicado",
        "template_status_lote_alterado",
        "template_clonado",
        "template_excluido_lote",
    }.issubset(acoes)
    assert all(item["portal"] == "revisao_templates" for item in itens)
    assert any(item["ator_usuario_id"] == ids["revisor_a"] for item in itens)

    registro_publicado = next(item for item in itens if item["acao"] == "template_publicado")
    assert int(registro_publicado["payload"]["template_id"]) == id_publicar
    assert registro_publicado["payload"]["status_template"] == "ativo"

    registro_lote = next(item for item in itens if item["acao"] == "template_status_lote_alterado")
    assert registro_lote["payload"]["status_destino"] == "em_teste"
    assert registro_lote["payload"]["total"] == 2
    assert {int(valor) for valor in registro_lote["payload"]["template_ids"]} == {id_lote_a, id_lote_b}

    registro_clone = next(item for item in itens if item["acao"] == "template_clonado")
    assert int(registro_clone["payload"]["template_origem"]["template_id"]) == id_lote_a
    assert int(registro_clone["payload"]["template_clone"]["template_id"]) == clone_id

    registro_exclusao = next(item for item in itens if item["acao"] == "template_excluido_lote")
    assert registro_exclusao["payload"]["total"] == 1
    assert registro_exclusao["payload"]["templates"][0]["template_id"] == id_excluir

    with SessionLocal() as banco:
        registros = list(
            banco.scalars(
                select(RegistroAuditoriaEmpresa)
                .where(RegistroAuditoriaEmpresa.empresa_id == ids["empresa_a"])
                .order_by(RegistroAuditoriaEmpresa.id.desc())
            ).all()
        )
        assert registros
        assert any(item.portal == "revisao_templates" for item in registros)
        assert {item.acao for item in registros if item.portal == "revisao_templates"} >= {
            "template_publicado",
            "template_status_lote_alterado",
            "template_clonado",
            "template_excluido_lote",
        }


def test_revisor_salvar_e_preview_template_editor_rico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_criar = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template Word Preview",
            "codigo_template": "word_preview",
            "versao": 2,
            "origem_modo": "a4",
        },
    )
    assert resposta_criar.status_code == 201
    template_id = int(resposta_criar.json()["id"])

    resposta_salvar = client.put(
        f"/revisao/api/templates-laudo/editor/{template_id}",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template Word Preview Atualizado",
            "documento_editor_json": {
                "version": 1,
                "doc": {
                    "type": "doc",
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": "Empresa: {{json_path:informacoes_gerais.local_inspecao}}"},
                            ],
                        },
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": "Cliente: {{token:cliente_nome}}"},
                            ],
                        },
                    ],
                },
            },
            "estilo_json": {
                "cabecalho_texto": "Tariel.ia {{token:cliente_nome}}",
                "rodape_texto": "Revisão Técnica",
                "marca_dagua": {"texto": "CONFIDENCIAL", "opacity": 0.08},
                "pagina": {"margens_mm": {"top": 18, "right": 14, "bottom": 18, "left": 14}},
            },
        },
    )
    assert resposta_salvar.status_code == 200
    assert resposta_salvar.json()["nome"] == "Template Word Preview Atualizado"

    resposta_preview = client.post(
        f"/revisao/api/templates-laudo/editor/{template_id}/preview",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "dados_formulario": {
                "informacoes_gerais": {"local_inspecao": "Planta Sul"},
                "tokens": {"cliente_nome": "Cliente XPTO"},
            }
        },
    )
    assert resposta_preview.status_code == 200
    assert "application/pdf" in (resposta_preview.headers.get("content-type", "").lower())
    assert resposta_preview.content.startswith(b"%PDF")
    assert len(resposta_preview.content) > 300


def test_revisor_preview_template_editor_rico_fallback_playwright(ambiente_critico, monkeypatch) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_criar = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template Word Fallback Preview",
            "codigo_template": "word_preview_fallback",
            "versao": 3,
            "origem_modo": "a4",
        },
    )
    assert resposta_criar.status_code == 201
    template_id = int(resposta_criar.json()["id"])

    async def _playwright_falha(**_kwargs):
        raise RuntimeError("Falha forçada do Playwright")

    monkeypatch.setattr(
        "nucleo.template_editor_word.gerar_pdf_html_playwright",
        _playwright_falha,
    )

    resposta_preview = client.post(
        f"/revisao/api/templates-laudo/editor/{template_id}/preview",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={"dados_formulario": {"tokens": {"cliente_nome": "Fallback"}}},
    )

    assert resposta_preview.status_code == 200
    assert "application/pdf" in (resposta_preview.headers.get("content-type", "").lower())
    assert resposta_preview.content.startswith(b"%PDF")


def test_revisor_upload_asset_template_editor_rico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_criar = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template Word Asset",
            "codigo_template": "word_asset",
            "versao": 1,
            "origem_modo": "a4",
        },
    )
    assert resposta_criar.status_code == 201
    template_id = int(resposta_criar.json()["id"])

    resposta_asset = client.post(
        f"/revisao/api/templates-laudo/editor/{template_id}/assets",
        headers={"X-CSRF-Token": csrf},
        data={"csrf_token": csrf},
        files={"arquivo": ("logo.png", _imagem_png_bytes_teste(), "image/png")},
    )
    assert resposta_asset.status_code == 201
    asset = resposta_asset.json()["asset"]
    assert asset["id"]
    assert asset["src"].startswith("asset://")

    resposta_baixar_asset = client.get(f"/revisao/api/templates-laudo/editor/{template_id}/assets/{asset['id']}")
    assert resposta_baixar_asset.status_code == 200
    assert "image/png" in (resposta_baixar_asset.headers.get("content-type", "").lower())


def test_revisor_criar_template_editor_rejeita_ativo_inteiro_por_contrato(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Template Word Estrito",
            "codigo_template": "word_estrito",
            "versao": 1,
            "origem_modo": "a4",
            "ativo": 0,
        },
    )

    assert resposta.status_code == 422


def test_revisor_upload_template_rejeita_bool_form_invalido(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta = client.post(
        "/revisao/api/templates-laudo/upload",
        headers={"X-CSRF-Token": csrf},
        data={
            "nome": "Template Bool Invalido",
            "codigo_template": "bool_invalido",
            "versao": "1",
            "ativo": "0",
        },
        files={
            "arquivo_base": ("bool_invalido.pdf", _pdf_base_bytes_teste(), "application/pdf"),
        },
    )

    assert resposta.status_code == 422


def test_revisor_publicar_template_editor_rico_desativa_ativo_anterior(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    resposta_v1 = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Word RTI v1",
            "codigo_template": "word_rti",
            "versao": 1,
            "origem_modo": "a4",
            "ativo": True,
        },
    )
    assert resposta_v1.status_code == 201
    id_v1 = int(resposta_v1.json()["id"])

    resposta_v2 = client.post(
        "/revisao/api/templates-laudo/editor",
        headers={"X-CSRF-Token": csrf, "Content-Type": "application/json"},
        json={
            "nome": "Word RTI v2",
            "codigo_template": "word_rti",
            "versao": 2,
            "origem_modo": "a4",
        },
    )
    assert resposta_v2.status_code == 201
    id_v2 = int(resposta_v2.json()["id"])

    resposta_publicar = client.post(
        f"/revisao/api/templates-laudo/editor/{id_v2}/publicar",
        headers={"X-CSRF-Token": csrf},
        data={"csrf_token": csrf},
    )
    assert resposta_publicar.status_code == 200
    assert resposta_publicar.json().get("status") == "publicado"

    with SessionLocal() as banco:
        template_v1 = banco.get(TemplateLaudo, id_v1)
        template_v2 = banco.get(TemplateLaudo, id_v2)
        assert template_v1 is not None
        assert template_v2 is not None
        assert template_v1.ativo is False
        assert template_v2.ativo is True
        assert str(template_v2.modo_editor) == "editor_rico"
        assert str(template_v2.arquivo_pdf_base).lower().endswith(".pdf")
        assert os.path.isfile(str(template_v2.arquivo_pdf_base))


def test_revisor_editor_rico_respeita_isolamento_multiempresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        template_b = TemplateLaudo(
            empresa_id=ids["empresa_b"],
            criado_por_id=ids["inspetor_b"],
            nome="Template B",
            codigo_template="word_b",
            versao=1,
            ativo=True,
            modo_editor="editor_rico",
            arquivo_pdf_base=_salvar_pdf_temporario_teste("word_b"),
            mapeamento_campos_json={},
            documento_editor_json={"version": 1, "doc": {"type": "doc", "content": []}},
            assets_json=[],
            estilo_json={},
        )
        banco.add(template_b)
        banco.commit()
        banco.refresh(template_b)
        template_id_b = int(template_b.id)

    resposta = client.get(f"/revisao/api/templates-laudo/editor/{template_id_b}", headers={"X-CSRF-Token": csrf})
    assert resposta.status_code == 404


def test_api_gerar_pdf_usa_template_ativo_da_empresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.tipo_template = "cbmgo"
        laudo.dados_formulario = {
            "informacoes_gerais": {
                "responsavel_pela_inspecao": "Gabriel Santos",
                "data_inspecao": "09/03/2026",
            }
        }
        banco.commit()

        _criar_template_ativo(
            banco,
            empresa_id=ids["empresa_a"],
            criado_por_id=ids["revisor_a"],
            codigo_template="cbmgo_cmar",
            versao=1,
            mapeamento={},
        )

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Diagnóstico teste para exportação por template ativo.",
            "inspetor": "Inspetor A",
            "empresa": "Empresa A",
            "setor": "geral",
            "data": "09/03/2026",
            "laudo_id": laudo_id,
            "tipo_template": "cbmgo",
        },
    )

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")
    assert "cbmgo_cmar_v1" in str(resposta.headers.get("content-disposition", "")).lower()


def test_api_gerar_pdf_usa_template_editor_rico_ativo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.tipo_template = "cbmgo"
        laudo.dados_formulario = {
            "informacoes_gerais": {"local_inspecao": "Planta Leste"},
            "tokens": {"cliente_nome": "Cliente Tariel"},
        }

        banco.add(
            TemplateLaudo(
                empresa_id=ids["empresa_a"],
                criado_por_id=ids["revisor_a"],
                nome="Template Word Ativo",
                codigo_template="cbmgo_cmar",
                versao=5,
                ativo=True,
                modo_editor="editor_rico",
                arquivo_pdf_base=_salvar_pdf_temporario_teste("word_ativo"),
                mapeamento_campos_json={},
                documento_editor_json={
                    "version": 1,
                    "doc": {
                        "type": "doc",
                        "content": [
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Cliente {{token:cliente_nome}}"}],
                            },
                            {
                                "type": "paragraph",
                                "content": [{"type": "text", "text": "Local {{json_path:informacoes_gerais.local_inspecao}}"}],
                            },
                        ],
                    },
                },
                assets_json=[],
                estilo_json={"cabecalho_texto": "Tariel.ia", "rodape_texto": "Mesa"},
            )
        )
        banco.commit()

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Diagnóstico editor rico.",
            "inspetor": "Inspetor A",
            "empresa": "Empresa A",
            "setor": "geral",
            "data": "09/03/2026",
            "laudo_id": laudo_id,
            "tipo_template": "cbmgo",
        },
    )

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")
    assert "cbmgo_cmar_v5" in str(resposta.headers.get("content-disposition", "")).lower()


def test_api_gerar_pdf_fallback_legacy_quando_render_rico_falha(ambiente_critico, monkeypatch) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.tipo_template = "cbmgo"
        laudo.dados_formulario = {"tokens": {"cliente_nome": "Fallback Geral"}}

        banco.add(
            TemplateLaudo(
                empresa_id=ids["empresa_a"],
                criado_por_id=ids["revisor_a"],
                nome="Template Word Com Falha",
                codigo_template="cbmgo_cmar",
                versao=6,
                ativo=True,
                modo_editor="editor_rico",
                arquivo_pdf_base=_salvar_pdf_temporario_teste("word_falha"),
                mapeamento_campos_json={},
                documento_editor_json={
                    "version": 1,
                    "doc": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Teste"}]}]},
                },
                assets_json=[],
                estilo_json={},
            )
        )
        banco.commit()

    async def _falha_render(**_kwargs):
        raise RuntimeError("Falha forçada no render rico")

    monkeypatch.setattr("app.domains.chat.chat.gerar_pdf_editor_rico_bytes", _falha_render)

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Diagnóstico fallback por falha no render rico.",
            "inspetor": "Inspetor A",
            "empresa": "Empresa A",
            "setor": "geral",
            "data": "09/03/2026",
            "laudo_id": laudo_id,
            "tipo_template": "cbmgo",
        },
    )

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")
    assert "laudo_art_wf.pdf" in str(resposta.headers.get("content-disposition", "")).lower()


def test_api_gerar_pdf_fallback_legacy_quando_nao_ha_template_ativo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Diagnóstico sem template ativo.",
            "inspetor": "Inspetor A",
            "empresa": "Empresa A",
            "setor": "geral",
            "data": "09/03/2026",
        },
    )

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")
    assert "laudo_art_wf.pdf" in str(resposta.headers.get("content-disposition", "")).lower()


def test_api_gerar_pdf_fallback_legacy_quando_template_ativo_invalido(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.tipo_template = "cbmgo"
        laudo.dados_formulario = {
            "informacoes_gerais": {
                "responsavel_pela_inspecao": "Inspetor A",
            }
        }

        caminho_invalido = os.path.join(tempfile.gettempdir(), f"nao_existe_{uuid.uuid4().hex}.pdf")
        banco.add(
            TemplateLaudo(
                empresa_id=ids["empresa_a"],
                criado_por_id=ids["revisor_a"],
                nome="Template invalido",
                codigo_template="cbmgo_cmar",
                versao=1,
                ativo=True,
                arquivo_pdf_base=caminho_invalido,
                mapeamento_campos_json={},
            )
        )
        banco.commit()

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Diagnostico com template invalido deve usar fallback.",
            "inspetor": "Inspetor A",
            "empresa": "Empresa A",
            "setor": "geral",
            "data": "09/03/2026",
            "laudo_id": laudo_id,
            "tipo_template": "cbmgo",
        },
    )

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")
    assert "laudo_art_wf.pdf" in str(resposta.headers.get("content-disposition", "")).lower()


def test_api_gerar_pdf_ignora_template_ativo_de_outra_empresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.tipo_template = "cbmgo"
        laudo.dados_formulario = {
            "informacoes_gerais": {
                "responsavel_pela_inspecao": "Inspetor A",
            }
        }

        _criar_template_ativo(
            banco,
            empresa_id=ids["empresa_b"],
            criado_por_id=ids["revisor_a"],
            codigo_template="cbmgo_cmar",
            versao=1,
            mapeamento={},
        )
        banco.commit()

    resposta = client.post(
        "/app/api/gerar_pdf",
        headers={"X-CSRF-Token": csrf},
        json={
            "diagnostico": "Template de outra empresa nao pode ser aplicado.",
            "inspetor": "Inspetor A",
            "empresa": "Empresa A",
            "setor": "geral",
            "data": "09/03/2026",
            "laudo_id": laudo_id,
            "tipo_template": "cbmgo",
        },
    )

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")
    assert "laudo_art_wf.pdf" in str(resposta.headers.get("content-disposition", "")).lower()


def test_home_app_nao_desloga_inspetor(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_app_inspetor(client, "inspetor@empresa-a.test")

    home = client.get("/app/", follow_redirects=False)
    assert home.status_code == 200

    status_relatorio = client.get("/app/api/laudo/status", follow_redirects=False)
    assert status_relatorio.status_code == 200


def test_status_relatorio_retorna_405_em_delete_sem_cair_na_rota_dinamica(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.delete("/app/api/laudo/status", follow_redirects=False)

    assert resposta.status_code == 405
    assert resposta.json()["detail"] == "Method Not Allowed"
    assert resposta.headers.get("allow") == "GET"


def test_rotas_estaticas_laudo_retorna_405_em_delete_sem_cair_na_rota_dinamica(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_app_inspetor(client, "inspetor@empresa-a.test")

    for rota in (
        "/app/api/laudo/iniciar",
        "/app/api/laudo/cancelar",
        "/app/api/laudo/desativar",
    ):
        resposta = client.delete(rota, follow_redirects=False)
        assert resposta.status_code == 405
        assert resposta.json()["detail"] == "Method Not Allowed"
        assert resposta.headers.get("allow") == "POST"


def test_rotas_estaticas_pendencias_retorna_405_em_patch_sem_cair_na_rota_dinamica(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_app_inspetor(client, "inspetor@empresa-a.test")

    for rota, allow in (
        ("/app/api/laudo/1/pendencias/marcar-lidas", "POST"),
        ("/app/api/laudo/1/pendencias/exportar-pdf", "GET"),
    ):
        resposta = client.patch(rota, follow_redirects=False)
        assert resposta.status_code == 405
        assert resposta.json()["detail"] == "Method Not Allowed"
        assert resposta.headers.get("allow") == allow


def test_home_desativa_contexto_sem_excluir_laudo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]

    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    iniciar = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "padrao"},
        headers={"X-CSRF-Token": csrf},
    )
    assert iniciar.status_code == 200
    corpo_inicio = iniciar.json()
    laudo_id = int(corpo_inicio["laudo_id"])

    desativar = client.post(
        "/app/api/laudo/desativar",
        headers={"X-CSRF-Token": csrf},
    )
    assert desativar.status_code == 200
    corpo_desativar = desativar.json()
    assert corpo_desativar["success"] is True
    assert int(corpo_desativar["laudo_id"]) == laudo_id
    assert corpo_desativar["laudo_preservado"] is True

    status_relatorio = client.get("/app/api/laudo/status")
    assert status_relatorio.status_code == 200
    corpo_status = status_relatorio.json()
    assert corpo_status["estado"] == "sem_relatorio"
    assert corpo_status["laudo_id"] is None

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.RASCUNHO.value


def test_iniciar_relatorio_sem_tipo_assume_padrao_por_resiliencia(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/laudo/iniciar",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["success"] is True
    assert corpo["tipo_template"] == "padrao"
    assert corpo["message"].startswith("✅ Inspeção Inspeção Geral")


def test_iniciar_relatorio_com_campo_vazio_assume_padrao_por_resiliencia(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/laudo/iniciar",
        data={"tipotemplate": ""},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["success"] is True
    assert corpo["tipo_template"] == "padrao"


def test_relatorio_so_fica_ativo_apos_primeira_interacao_no_chat(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    iniciar = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "padrao"},
        headers={"X-CSRF-Token": csrf},
    )
    assert iniciar.status_code == 200
    corpo_inicio = iniciar.json()
    laudo_id = int(corpo_inicio["laudo_id"])
    assert corpo_inicio["estado"] == "sem_relatorio"

    status_antes = client.get("/app/api/laudo/status")
    assert status_antes.status_code == 200
    assert status_antes.json()["estado"] == "sem_relatorio"
    assert status_antes.json()["laudo_id"] is None

    class ClienteIAStub:
        def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
            yield "Resposta técnica inicial para ativar o laudo.\n"

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta_chat = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Primeira interação real com a IA.",
                "historico": [],
                "laudo_id": laudo_id,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta_chat.status_code == 200
    assert "text/event-stream" in (resposta_chat.headers.get("content-type", "").lower())

    status_depois = client.get("/app/api/laudo/status")
    assert status_depois.status_code == 200
    assert status_depois.json()["estado"] == "relatorio_ativo"
    assert int(status_depois.json()["laudo_id"]) == laudo_id


def test_home_nao_exibe_rascunho_sem_interacao_na_sidebar(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    iniciar = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "padrao"},
        headers={"X-CSRF-Token": csrf},
    )
    assert iniciar.status_code == 200
    laudo_id = int(iniciar.json()["laudo_id"])

    home = client.get("/app/", follow_redirects=False)

    assert home.status_code == 200
    assert f'data-laudo-id="{laudo_id}"' not in home.text
    assert "Nenhum laudo ainda" in home.text


def test_multiplos_laudos_abertos_aceitam_mensagens_em_paralelo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    iniciar_a = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "padrao"},
        headers={"X-CSRF-Token": csrf},
    )
    iniciar_b = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "avcb"},
        headers={"X-CSRF-Token": csrf},
    )
    assert iniciar_a.status_code == 200
    assert iniciar_b.status_code == 200
    laudo_a = int(iniciar_a.json()["laudo_id"])
    laudo_b = int(iniciar_b.json()["laudo_id"])

    class ClienteIAStub:
        def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
            yield "Resposta técnica em paralelo.\n"

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta_a_1 = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Primeira conversa do laudo A.",
                "historico": [],
                "laudo_id": laudo_a,
            },
        )
        resposta_b_1 = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Primeira conversa do laudo B.",
                "historico": [],
                "laudo_id": laudo_b,
            },
        )
        resposta_a_2 = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Segunda conversa do laudo A.",
                "historico": [],
                "laudo_id": laudo_a,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta_a_1.status_code == 200
    assert resposta_b_1.status_code == 200
    assert resposta_a_2.status_code == 200
    assert "Use apenas o relatório ativo" not in resposta_a_2.text

    with SessionLocal() as banco:
        laudo_a_db = banco.get(Laudo, laudo_a)
        laudo_b_db = banco.get(Laudo, laudo_b)
        assert laudo_a_db is not None
        assert laudo_b_db is not None
        assert laudo_a_db.status_revisao == StatusRevisao.RASCUNHO.value
        assert laudo_b_db.status_revisao == StatusRevisao.RASCUNHO.value
        assert (banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo_a).count()) >= 4
        assert (banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo_b).count()) >= 2


def test_inspetor_atualiza_perfil_chat_com_sucesso(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.put(
        "/app/api/perfil",
        headers={"X-CSRF-Token": csrf},
        json={
            "nome_completo": "Inspetor A Atualizado",
            "email": "inspetor@empresa-a.test",
            "telefone": "(16) 99999-0001",
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["ok"] is True
    assert corpo["perfil"]["nome_completo"] == "Inspetor A Atualizado"
    assert corpo["perfil"]["telefone"] == "(16) 99999-0001"

    with SessionLocal() as banco:
        usuario = banco.get(Usuario, ids["inspetor_a"])
        assert usuario is not None
        assert usuario.nome_completo == "Inspetor A Atualizado"
        assert usuario.telefone == "(16) 99999-0001"


def test_inspetor_upload_foto_perfil_rejeita_mime_invalido(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/perfil/foto",
        headers={"X-CSRF-Token": csrf},
        files={"foto": ("perfil.txt", b"arquivo-invalido", "text/plain")},
    )

    assert resposta.status_code == 415
    assert "Formato inválido" in resposta.text


def test_revisor_painel_exibe_laudos_em_andamento_rascunho(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        hash_curto = laudo.codigo_hash[-6:]

    painel = client.get("/revisao/painel")

    assert painel.status_code == 200
    assert "Em Andamento em Campo (1)" in painel.text
    assert f"#{hash_curto}" in painel.text


def test_revisor_painel_precarrega_whisper_em_laudo_rascunho(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["inspetor_a"],
                tipo=TipoMensagem.HUMANO_INSP.value,
                conteudo="Validar item de risco no campo",
                lida=False,
            )
        )
        banco.commit()

    painel = client.get("/revisao/painel")

    assert painel.status_code == 200
    assert "Whispers (Chamados)" in painel.text
    assert "Validar item de risco no campo" in painel.text


def test_revisor_painel_abre_com_laudo_aguardando_sem_atualizado_em(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Laudo aguardando avaliação sem atualização manual."
        laudo.atualizado_em = None
        banco.commit()

    painel = client.get("/revisao/painel")

    assert painel.status_code == 200
    assert "Aguardando Avaliação" in painel.text
    assert "Laudo aguardando avaliação sem atualização manual." in painel.text


def test_revisor_painel_filtro_por_inspetor_restringe_laudos(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        inspetor_extra = Usuario(
            empresa_id=ids["empresa_a"],
            nome_completo="Inspetor Extra",
            email="inspetor-extra@empresa-a.test",
            senha_hash=SENHA_HASH_PADRAO,
            nivel_acesso=NivelAcesso.INSPETOR.value,
        )
        banco.add(inspetor_extra)
        banco.commit()
        banco.refresh(inspetor_extra)

        laudo_a_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_extra_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=inspetor_extra.id,
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        laudo_a = banco.get(Laudo, laudo_a_id)
        laudo_extra = banco.get(Laudo, laudo_extra_id)
        assert laudo_a is not None
        assert laudo_extra is not None
        hash_a = laudo_a.codigo_hash[-6:]
        hash_extra = laudo_extra.codigo_hash[-6:]

    painel_filtrado = client.get(f"/revisao/painel?inspetor={ids['inspetor_a']}")

    assert painel_filtrado.status_code == 200
    assert f"#{hash_a}" in painel_filtrado.text
    assert f"#{hash_extra}" not in painel_filtrado.text


def test_revisor_painel_filtro_busca_por_hash_e_texto(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_eletrico_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_caldeira_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        laudo_eletrico = banco.get(Laudo, laudo_eletrico_id)
        laudo_caldeira = banco.get(Laudo, laudo_caldeira_id)
        assert laudo_eletrico is not None
        assert laudo_caldeira is not None

        laudo_eletrico.primeira_mensagem = "Painel eletrico com nao conformidade de isolamento"
        laudo_caldeira.primeira_mensagem = "Caldeira com ponto de corrosao na linha principal"
        banco.commit()

        hash_eletrico = laudo_eletrico.codigo_hash[-6:]
        hash_caldeira = laudo_caldeira.codigo_hash[-6:]

    painel_hash = client.get(f"/revisao/painel?q={hash_eletrico}")
    assert painel_hash.status_code == 200
    assert f"#{hash_eletrico}" in painel_hash.text
    assert f"#{hash_caldeira}" not in painel_hash.text

    painel_texto = client.get("/revisao/painel?q=corrosao")
    assert painel_texto.status_code == 200
    assert "Caldeira com ponto de corrosao" in painel_texto.text
    assert "Painel eletrico com nao conformidade" not in painel_texto.text


def test_revisor_painel_filtro_aprendizados_pendentes(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_com_aprendizado_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_sem_aprendizado_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

        laudo_com_aprendizado = banco.get(Laudo, laudo_com_aprendizado_id)
        laudo_sem_aprendizado = banco.get(Laudo, laudo_sem_aprendizado_id)
        assert laudo_com_aprendizado is not None
        assert laudo_sem_aprendizado is not None

        banco.add(
            AprendizadoVisualIa(
                empresa_id=ids["empresa_a"],
                laudo_id=laudo_com_aprendizado_id,
                criado_por_id=ids["inspetor_a"],
                setor_industrial="geral",
                resumo="Linha de vida em revisão",
                correcao_inspetor="A IA marcou o ponto errado e a mesa ainda precisa validar.",
                status="rascunho_inspetor",
                veredito_inspetor="duvida",
            )
        )
        banco.commit()

        hash_com_aprendizado = laudo_com_aprendizado.codigo_hash[-6:]
        hash_sem_aprendizado = laudo_sem_aprendizado.codigo_hash[-6:]

    painel_filtrado = client.get("/revisao/painel?aprendizados=pendentes")

    assert painel_filtrado.status_code == 200
    assert f"#{hash_com_aprendizado}" in painel_filtrado.text
    assert f"#{hash_sem_aprendizado}" not in painel_filtrado.text
    assert 'id="filtro-aprendizados"' in painel_filtrado.text
    assert "Com aprendizados pendentes" in painel_filtrado.text
    assert "1 aprend." in painel_filtrado.text


def test_revisor_painel_em_andamento_prioriza_por_sla(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_ok_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_atencao_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_critico_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        laudo_ok = banco.get(Laudo, laudo_ok_id)
        laudo_atencao = banco.get(Laudo, laudo_atencao_id)
        laudo_critico = banco.get(Laudo, laudo_critico_id)
        assert laudo_ok is not None
        assert laudo_atencao is not None
        assert laudo_critico is not None

        laudo_ok.criado_em = datetime.now(timezone.utc) - timedelta(hours=3)
        laudo_atencao.criado_em = datetime.now(timezone.utc) - timedelta(hours=28)
        laudo_critico.criado_em = datetime.now(timezone.utc) - timedelta(hours=55)
        laudo_ok.primeira_mensagem = "TOKEN_SLA_OK"
        laudo_atencao.primeira_mensagem = "TOKEN_SLA_ATENCAO"
        laudo_critico.primeira_mensagem = "TOKEN_SLA_CRITICO"
        banco.commit()

    painel = client.get("/revisao/painel")

    assert painel.status_code == 200
    idx_critico = painel.text.find("TOKEN_SLA_CRITICO")
    idx_atencao = painel.text.find("TOKEN_SLA_ATENCAO")
    idx_ok = painel.text.find("TOKEN_SLA_OK")
    assert idx_critico != -1
    assert idx_atencao != -1
    assert idx_ok != -1
    assert idx_critico < idx_atencao < idx_ok


def test_revisor_painel_em_andamento_exibe_chip_sla_critico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.criado_em = datetime.now(timezone.utc) - timedelta(hours=50, minutes=3)
        banco.commit()

    painel = client.get("/revisao/painel")

    assert painel.status_code == 200
    assert "sla-critico" in painel.text
    assert "Em campo h" in painel.text


def test_inspetor_com_senha_temporaria_e_obrigado_a_trocar_no_primeiro_login(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    nova_senha = "InspetorNova@123"

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "inspetor@empresa-a.test"))
        assert usuario is not None
        usuario.senha_temporaria_ativa = True
        banco.commit()

    tela_login = client.get("/app/login")
    csrf_login = _extrair_csrf(tela_login.text)
    resposta_login = client.post(
        "/app/login",
        data={
            "email": "inspetor@empresa-a.test",
            "senha": SENHA_PADRAO,
            "csrf_token": csrf_login,
        },
        follow_redirects=False,
    )
    assert resposta_login.status_code == 303
    assert resposta_login.headers["location"] == "/app/trocar-senha"

    tela_troca = client.get("/app/trocar-senha")
    assert tela_troca.status_code == 200
    csrf_troca = _extrair_csrf(tela_troca.text)

    resposta_troca = client.post(
        "/app/trocar-senha",
        data={
            "senha_atual": SENHA_PADRAO,
            "nova_senha": nova_senha,
            "confirmar_senha": nova_senha,
            "csrf_token": csrf_troca,
        },
        follow_redirects=False,
    )
    assert resposta_troca.status_code == 303
    assert resposta_troca.headers["location"] == "/app/"

    acesso = client.get("/app/", follow_redirects=False)
    assert acesso.status_code == 200

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "inspetor@empresa-a.test"))
        assert usuario is not None
        assert usuario.senha_temporaria_ativa is False
        assert verificar_senha(nova_senha, usuario.senha_hash)


def test_revisor_com_senha_temporaria_e_obrigado_a_trocar_no_primeiro_login(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    nova_senha = "RevisorNova@123"

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "revisor@empresa-a.test"))
        assert usuario is not None
        usuario.senha_temporaria_ativa = True
        banco.commit()

    tela_login = client.get("/revisao/login")
    csrf_login = _extrair_csrf(tela_login.text)
    resposta_login = client.post(
        "/revisao/login",
        data={
            "email": "revisor@empresa-a.test",
            "senha": SENHA_PADRAO,
            "csrf_token": csrf_login,
        },
        follow_redirects=False,
    )
    assert resposta_login.status_code == 303
    assert resposta_login.headers["location"] == "/revisao/trocar-senha"

    tela_troca = client.get("/revisao/trocar-senha")
    assert tela_troca.status_code == 200
    csrf_troca = _extrair_csrf(tela_troca.text)

    resposta_troca = client.post(
        "/revisao/trocar-senha",
        data={
            "senha_atual": SENHA_PADRAO,
            "nova_senha": nova_senha,
            "confirmar_senha": nova_senha,
            "csrf_token": csrf_troca,
        },
        follow_redirects=False,
    )
    assert resposta_troca.status_code == 303
    assert resposta_troca.headers["location"] == "/revisao/painel"

    painel = client.get("/revisao/painel", follow_redirects=False)
    assert painel.status_code == 200

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "revisor@empresa-a.test"))
        assert usuario is not None
        assert usuario.senha_temporaria_ativa is False
        assert verificar_senha(nova_senha, usuario.senha_hash)


def test_admin_com_senha_temporaria_e_obrigado_a_trocar_no_primeiro_login(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    nova_senha = "AdminNova@123"

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "admin@empresa-a.test"))
        assert usuario is not None
        usuario.senha_temporaria_ativa = True
        banco.commit()

    tela_login = client.get("/admin/login")
    csrf_login = _extrair_csrf(tela_login.text)
    resposta_login = client.post(
        "/admin/login",
        data={
            "email": "admin@empresa-a.test",
            "senha": SENHA_PADRAO,
            "csrf_token": csrf_login,
        },
        follow_redirects=False,
    )
    assert resposta_login.status_code == 303
    assert resposta_login.headers["location"] == "/admin/trocar-senha"

    tela_troca = client.get("/admin/trocar-senha")
    assert tela_troca.status_code == 200
    csrf_troca = _extrair_csrf(tela_troca.text)

    resposta_troca = client.post(
        "/admin/trocar-senha",
        data={
            "senha_atual": SENHA_PADRAO,
            "nova_senha": nova_senha,
            "confirmar_senha": nova_senha,
            "csrf_token": csrf_troca,
        },
        follow_redirects=False,
    )
    assert resposta_troca.status_code == 303
    assert resposta_troca.headers["location"] == "/admin/painel"

    painel = client.get("/admin/painel", follow_redirects=False)
    assert painel.status_code == 200

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "admin@empresa-a.test"))
        assert usuario is not None
        assert usuario.senha_temporaria_ativa is False
        assert verificar_senha(nova_senha, usuario.senha_hash)


def test_admin_metricas_grafico_retorna_json(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_admin(client, "admin@empresa-a.test")
    resposta = client.get("/admin/api/metricas-grafico")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert isinstance(corpo.get("labels"), list)
    assert isinstance(corpo.get("valores"), list)
    assert len(corpo["labels"]) == len(corpo["valores"])


def test_iniciar_relatorio_rejeita_tipo_template_desconhecido(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "template_inexistente"},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Tipo de relatório inválido."

    with SessionLocal() as banco:
        assert banco.query(Laudo).count() == 0


def test_inspetor_nao_pode_finalizar_laudo_nao_rascunho(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/finalizar",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Laudo já foi enviado ou finalizado."


def test_inspetor_gate_qualidade_endpoint_reprova_sem_evidencias(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.get(
        f"/app/api/laudo/{laudo_id}/gate-qualidade",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["codigo"] == "GATE_QUALIDADE_REPROVADO"
    assert corpo["aprovado"] is False
    assert corpo["tipo_template"] == "padrao"
    assert isinstance(corpo["faltantes"], list)
    assert len(corpo["faltantes"]) >= 1
    assert corpo["roteiro_template"]["titulo"] == "Roteiro obrigatório do template"
    assert isinstance(corpo["roteiro_template"]["itens"], list)
    assert len(corpo["roteiro_template"]["itens"]) >= 5


def test_inspetor_gate_qualidade_cbmgo_expoe_roteiro_com_formulario(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
            tipo_template="cbmgo",
        )

    resposta = client.get(
        f"/app/api/laudo/{laudo_id}/gate-qualidade",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["tipo_template"] == "cbmgo"
    faltantes_ids = {item["id"] for item in corpo["faltantes"]}
    assert "formulario_estruturado" in faltantes_ids

    roteiro_ids = {item["id"] for item in corpo["roteiro_template"]["itens"]}
    assert "roteiro_formulario_estruturado" in roteiro_ids
    assert "cbmgo_formulario_estruturado" in roteiro_ids


def test_inspetor_finalizacao_bloqueada_por_gate_qualidade(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/finalizar",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 422
    corpo = resposta.json()
    detalhe = corpo.get("detail", {})
    assert detalhe["codigo"] == "GATE_QUALIDADE_REPROVADO"
    assert detalhe["aprovado"] is False
    assert isinstance(detalhe["itens"], list)
    assert isinstance(detalhe["faltantes"], list)
    assert len(detalhe["faltantes"]) >= 1

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.RASCUNHO.value


def test_inspetor_finalizacao_aprovada_com_evidencias_minimas(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Inspeção inicial em painel elétrico da área de prensas."

        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="Verifiquei risco de aquecimento em conexões do quadro principal.",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="[imagem]",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    tipo=TipoMensagem.IA.value,
                    conteudo="Parecer preliminar: existe não conformidade e recomenda-se isolamento imediato.",
                ),
            ]
        )
        banco.commit()

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/finalizar",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["success"] is True

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.AGUARDANDO.value


def test_api_chat_comando_finalizar_retorna_payload_gate_quando_reprovado(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "COMANDO_SISTEMA FINALIZARLAUDOAGORA TIPO padrao",
            "historico": [],
        },
    )

    assert resposta.status_code == 422
    corpo = resposta.json()
    detalhe = corpo.get("detail", {})
    assert detalhe["codigo"] == "GATE_QUALIDADE_REPROVADO"
    assert detalhe["aprovado"] is False
    assert isinstance(detalhe["faltantes"], list)
    assert len(detalhe["faltantes"]) >= 1

    with SessionLocal() as banco:
        laudo = (
            banco.query(Laudo)
            .filter(
                Laudo.empresa_id == ids["empresa_a"],
                Laudo.usuario_id == ids["inspetor_a"],
            )
            .order_by(Laudo.id.desc())
            .first()
        )
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.RASCUNHO.value


def test_api_chat_comando_rapido_pendencias_retorna_json(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["revisor_a"],
                tipo=TipoMensagem.HUMANO_ENG.value,
                conteudo="Favor anexar foto adicional do painel.",
                lida=False,
            )
        )
        banco.commit()

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/pendencias abertas",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["tipo"] == "comando_rapido"
    assert corpo["comando"] == "/pendencias"
    assert "Pendências da Mesa" in corpo["texto"]

    with SessionLocal() as banco:
        comando_salvo = (
            banco.query(MensagemLaudo)
            .filter(
                MensagemLaudo.laudo_id == laudo_id,
                MensagemLaudo.tipo == TipoMensagem.USER.value,
                MensagemLaudo.conteudo.like("[COMANDO_RAPIDO]%"),
            )
            .count()
        )
        assert comando_salvo >= 1


def test_api_chat_comando_rapido_resumo_retorna_json(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Inspeção em quadro elétrico principal."
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["inspetor_a"],
                tipo=TipoMensagem.USER.value,
                conteudo="Foi identificado aquecimento em borne de alimentação.",
            )
        )
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                tipo=TipoMensagem.IA.value,
                conteudo="Parecer preliminar emitido.",
            )
        )
        banco.commit()

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/resumo",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["tipo"] == "comando_rapido"
    assert corpo["comando"] == "/resumo"
    assert "Resumo da Sessão" in corpo["texto"]


def test_api_chat_comando_rapido_gerar_previa_retorna_json(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Inspeção inicial em área de caldeiras."
        laudo.parecer_ia = "Rascunho técnico com riscos e recomendações."
        banco.commit()

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/gerar_previa",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["tipo"] == "comando_rapido"
    assert corpo["comando"] == "/gerar_previa"
    assert "Prévia Operacional do Laudo" in corpo["texto"]


def test_api_chat_comando_rapido_enviar_mesa_gera_whisper(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/enviar_mesa Validar extintores e sinalização da área.",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    assert "text/event-stream" in (resposta.headers.get("content-type", "").lower())
    assert "humano_insp" in resposta.text

    with SessionLocal() as banco:
        ultima = banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo_id).order_by(MensagemLaudo.id.desc()).first()
        assert ultima is not None
        assert ultima.tipo == TipoMensagem.HUMANO_INSP.value
        assert "Validar extintores" in ultima.conteudo


def test_api_chat_comando_rapido_enviar_mesa_sem_texto_retorna_400(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/enviar_mesa",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 400
    assert "Use /enviar_mesa" in resposta.json()["detail"]


def test_api_chat_comando_rapido_enviar_mesa_sem_inspecao_ativa_retorna_400(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/enviar_mesa Validar extintores do almoxarifado.",
            "historico": [],
        },
    )

    assert resposta.status_code == 400
    assert "só é permitida após iniciar uma nova inspeção" in resposta.json()["detail"]


def test_api_chat_avisa_mesa_em_linguagem_natural_dispara_whisper(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "Avise a mesa avaliadora que terminei a inspeção da NR10.",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    assert "text/event-stream" in (resposta.headers.get("content-type", "").lower())
    assert "terminei a inspeção da NR10" in resposta.text

    with SessionLocal() as banco:
        ultima = banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo_id).order_by(MensagemLaudo.id.desc()).first()
        assert ultima is not None
        assert ultima.tipo == TipoMensagem.HUMANO_INSP.value
        assert "terminei a inspeção da NR10" in ultima.conteudo


def test_api_chat_avisa_mesa_sem_texto_util_retorna_400(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "Avise a mesa avaliadora",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Mensagem para a mesa está vazia."


def test_canais_ia_e_mesa_ficam_isolados_no_historico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="Mensagem normal do chat IA",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    tipo=TipoMensagem.IA.value,
                    conteudo="Resposta da IA para o inspetor",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.HUMANO_INSP.value,
                    conteudo="Pergunta do inspetor para a mesa",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Retorno da mesa avaliadora",
                ),
            ]
        )
        banco.commit()

    resposta_chat = client.get(f"/app/api/laudo/{laudo_id}/mensagens")
    assert resposta_chat.status_code == 200
    itens_chat = resposta_chat.json()["itens"]
    tipos_chat = {item["tipo"] for item in itens_chat}
    assert TipoMensagem.USER.value in tipos_chat
    assert TipoMensagem.IA.value in tipos_chat
    assert TipoMensagem.HUMANO_INSP.value not in tipos_chat
    assert TipoMensagem.HUMANO_ENG.value not in tipos_chat

    resposta_mesa = client.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")
    assert resposta_mesa.status_code == 200
    itens_mesa = resposta_mesa.json()["itens"]
    tipos_mesa = {item["tipo"] for item in itens_mesa}
    assert TipoMensagem.HUMANO_INSP.value in tipos_mesa
    assert TipoMensagem.HUMANO_ENG.value in tipos_mesa
    assert TipoMensagem.USER.value not in tipos_mesa
    assert TipoMensagem.IA.value not in tipos_mesa


def test_inspetor_envia_mensagem_mesa_com_referencia_valida(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        msg_mesa = MensagemLaudo(
            laudo_id=laudo_id,
            remetente_id=ids["revisor_a"],
            tipo=TipoMensagem.HUMANO_ENG.value,
            conteudo="Corrigir o item de proteção coletiva.",
        )
        banco.add(msg_mesa)
        banco.commit()
        banco.refresh(msg_mesa)
        referencia_id = msg_mesa.id

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf},
        json={
            "texto": "Ajuste realizado em campo, favor revalidar.",
            "referencia_mensagem_id": referencia_id,
        },
    )

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["laudo_id"] == laudo_id
    assert corpo["mensagem"]["tipo"] == TipoMensagem.HUMANO_INSP.value
    assert corpo["mensagem"]["referencia_mensagem_id"] == referencia_id
    assert "Ajuste realizado em campo" in corpo["mensagem"]["texto"]

    with SessionLocal() as banco:
        ultima = banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo_id).order_by(MensagemLaudo.id.desc()).first()
        assert ultima is not None
        assert ultima.tipo == TipoMensagem.HUMANO_INSP.value
        assert ultima.conteudo.startswith(f"[REF_MSG_ID:{referencia_id}]")


def test_inspetor_envia_anexo_para_mesa_e_download_fica_protegido(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/mesa/anexo",
        headers={"X-CSRF-Token": csrf},
        data={"texto": "Foto da proteção lateral anexada."},
        files={"arquivo": ("protecao.png", _imagem_png_bytes_teste(), "image/png")},
    )

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["mensagem"]["tipo"] == TipoMensagem.HUMANO_INSP.value
    assert "Foto da proteção lateral" in corpo["mensagem"]["texto"]
    assert len(corpo["mensagem"]["anexos"]) == 1
    anexo = corpo["mensagem"]["anexos"][0]
    assert anexo["nome"] == "protecao.png"
    assert anexo["categoria"] == "imagem"
    assert anexo["eh_imagem"] is True
    assert anexo["url"].endswith(f"/app/api/laudo/{laudo_id}/mesa/anexos/{anexo['id']}")

    resposta_lista = client.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")
    assert resposta_lista.status_code == 200
    itens = resposta_lista.json()["itens"]
    assert itens[-1]["anexos"][0]["nome"] == "protecao.png"

    resposta_download = client.get(anexo["url"])
    assert resposta_download.status_code == 200
    assert resposta_download.content == _imagem_png_bytes_teste()
    assert "image/png" in resposta_download.headers.get("content-type", "").lower()

    with SessionLocal() as banco:
        anexo_db = banco.get(AnexoMesa, int(anexo["id"]))
        assert anexo_db is not None
        assert anexo_db.laudo_id == laudo_id
        assert anexo_db.mensagem_id > 0
        assert anexo_db.categoria == "imagem"
        assert os.path.isfile(str(anexo_db.caminho_arquivo))


def test_mesa_anexo_multipart_invalido_retorna_422_json_serializavel(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    boundary = "mesa-malformado"
    corpo = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="arquivo"\r\n\r\n\r\n'
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="referencia_mensagem_id"; filename="referencia_mensagem_id"\r\n\r\nNone\r\n'
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="texto"\r\n\r\n\r\n'
        f"--{boundary}--\r\n"
    ).encode("utf-8")

    resposta = client.post(
        "/app/api/laudo/0/mesa/anexo",
        headers={
            "X-CSRF-Token": csrf,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        content=corpo,
    )

    assert resposta.status_code == 422
    detalhe = resposta.json()["detail"]
    assert isinstance(detalhe, list)
    assert detalhe[0]["loc"][0] == "body"
    assert detalhe[1]["input"]["__type__"] == "UploadFile"
    assert detalhe[1]["input"]["filename"] == "referencia_mensagem_id"


def test_primeira_interacao_com_mesa_cria_card_normal_no_historico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    iniciar = client.post(
        "/app/api/laudo/iniciar",
        data={"tipo_template": "padrao"},
        headers={"X-CSRF-Token": csrf},
    )
    assert iniciar.status_code == 200
    laudo_id = int(iniciar.json()["laudo_id"])

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf},
        json={"texto": "Mesa, validar item estrutural antes da vistoria final."},
    )

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert corpo["estado"] == "relatorio_ativo"
    assert corpo["laudo_card"]["id"] == laudo_id
    assert corpo["laudo_card"]["status_card"] == "aberto"

    home = client.get("/app/", follow_redirects=False)
    assert home.status_code == 200
    assert f'data-laudo-id="{laudo_id}"' in home.text

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.primeira_mensagem == "Mesa, validar item estrutural antes da vistoria final."


def test_inspetor_envia_mensagem_mesa_com_referencia_invalida_retorna_404(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf},
        json={
            "texto": "Resposta do inspetor para a mesa.",
            "referencia_mensagem_id": 999999,
        },
        follow_redirects=False,
    )

    assert resposta.status_code == 404
    assert resposta.json()["detail"] == "Mensagem de referência não encontrada."


def test_revisor_responde_e_inspetor_visualiza_no_canal_mesa(ambiente_critico) -> None:
    client_revisor = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_revisor = _login_revisor(client_revisor, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta_revisor = client_revisor.post(
        f"/revisao/api/laudo/{laudo_id}/responder",
        headers={"X-CSRF-Token": csrf_revisor},
        json={"texto": "Mesa avaliadora: incluir foto da placa de identificação."},
    )
    assert resposta_revisor.status_code == 200
    assert resposta_revisor.json()["success"] is True

    with TestClient(main.app) as client_inspetor:
        _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")
        resposta_mesa = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")

    assert resposta_mesa.status_code == 200
    itens = resposta_mesa.json()["itens"]
    assert len(itens) >= 1
    assert itens[-1]["tipo"] == TipoMensagem.HUMANO_ENG.value
    assert "Mesa avaliadora" in itens[-1]["texto"]
    assert itens[-1]["lida"] is False
    assert itens[-1]["resolvida_por_nome"] == ""
    assert itens[-1]["resolvida_em"] == ""


def test_revisor_responde_com_anexo_e_inspetor_recebe_no_canal_mesa(ambiente_critico) -> None:
    client_revisor = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_revisor = _login_revisor(client_revisor, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta_revisor = client_revisor.post(
        f"/revisao/api/laudo/{laudo_id}/responder-anexo",
        headers={"X-CSRF-Token": csrf_revisor},
        data={"texto": "Segue checklist complementar da mesa."},
        files={"arquivo": ("checklist.pdf", _pdf_base_bytes_teste(), "application/pdf")},
    )
    assert resposta_revisor.status_code == 200
    corpo_revisor = resposta_revisor.json()
    assert corpo_revisor["success"] is True
    assert corpo_revisor["mensagem"]["anexos"][0]["nome"] == "checklist.pdf"
    assert corpo_revisor["mensagem"]["anexos"][0]["categoria"] == "documento"

    with TestClient(main.app) as client_inspetor:
        _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")
        resposta_mesa = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")

    assert resposta_mesa.status_code == 200
    itens = resposta_mesa.json()["itens"]
    assert itens[-1]["tipo"] == TipoMensagem.HUMANO_ENG.value
    assert itens[-1]["anexos"][0]["nome"] == "checklist.pdf"

    resposta_download = client_inspetor.get(itens[-1]["anexos"][0]["url"])
    assert resposta_download.status_code == 200
    assert resposta_download.content.startswith(b"%PDF")
    assert "application/pdf" in resposta_download.headers.get("content-type", "").lower()


def test_laudo_com_ajustes_exige_reabertura_manual_para_chat_e_mesa(ambiente_critico) -> None:
    client_inspetor = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_inspetor = _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.encerrado_pelo_inspetor_em = datetime.now(timezone.utc)
        laudo.primeira_mensagem = "Inspeção encerrada e enviada para a mesa."
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["inspetor_a"],
                tipo=TipoMensagem.USER.value,
                conteudo="Coleta concluída em campo.",
                custo_api_reais=Decimal("0.0000"),
            )
        )
        banco.commit()

    with TestClient(main.app) as client_revisor:
        csrf_revisor = _login_revisor(client_revisor, "revisor@empresa-a.test")
        resposta_revisor = client_revisor.post(
            f"/revisao/api/laudo/{laudo_id}/responder",
            headers={"X-CSRF-Token": csrf_revisor},
            json={"texto": "Mesa: complementar foto da proteção lateral."},
        )

    assert resposta_revisor.status_code == 200
    assert resposta_revisor.json()["success"] is True

    resposta_mensagens = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mensagens")
    assert resposta_mensagens.status_code == 200
    corpo_mensagens = resposta_mensagens.json()
    assert corpo_mensagens["estado"] == "ajustes"
    assert corpo_mensagens["permite_reabrir"] is True
    assert corpo_mensagens["laudo_card"]["status_card"] == "ajustes"

    status = client_inspetor.get("/app/api/laudo/status")
    assert status.status_code == 200
    corpo_status = status.json()
    assert corpo_status["estado"] == "ajustes"
    assert corpo_status["permite_reabrir"] is True
    assert corpo_status["laudo_card"]["status_card"] == "ajustes"

    resposta_chat_bloqueado = client_inspetor.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf_inspetor},
        json={
            "mensagem": "Quero continuar o laudo sem reabrir.",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )
    assert resposta_chat_bloqueado.status_code == 400
    assert "reaberto" in resposta_chat_bloqueado.json()["detail"].lower()

    resposta_mesa_bloqueada = client_inspetor.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf_inspetor},
        json={"texto": "Respondendo a mesa sem reabrir."},
    )
    assert resposta_mesa_bloqueada.status_code == 400
    assert "reaberto" in resposta_mesa_bloqueada.json()["detail"].lower()

    resposta_reabrir = client_inspetor.post(
        f"/app/api/laudo/{laudo_id}/reabrir",
        headers={"X-CSRF-Token": csrf_inspetor},
    )
    assert resposta_reabrir.status_code == 200
    corpo_reabrir = resposta_reabrir.json()
    assert corpo_reabrir["estado"] == "relatorio_ativo"
    assert corpo_reabrir["permite_reabrir"] is False
    assert corpo_reabrir["laudo_card"]["status_card"] == "aberto"

    class ClienteIAStub:
        def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
            yield "Laudo reaberto e pronto para complementação.\n"

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta_chat_ok = client_inspetor.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf_inspetor},
            json={
                "mensagem": "Agora sim, complementando após reabrir.",
                "historico": [],
                "laudo_id": laudo_id,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta_chat_ok.status_code == 200
    assert "text/event-stream" in (resposta_chat_ok.headers.get("content-type", "").lower())

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.RASCUNHO.value
        assert laudo.reabertura_pendente_em is None
        assert laudo.reaberto_em is not None


def test_revisor_whisper_responder_rejeita_destinatario_diferente_do_responsavel(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        inspetor_extra = Usuario(
            empresa_id=ids["empresa_a"],
            nome_completo="Inspetor Extra",
            email=f"inspetor.extra.{uuid.uuid4().hex[:6]}@empresa-a.test",
            senha_hash=SENHA_HASH_PADRAO,
            nivel_acesso=NivelAcesso.INSPETOR.value,
        )
        banco.add(inspetor_extra)
        banco.flush()

        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.commit()
        destinatario_invalido = inspetor_extra.id

    resposta = client.post(
        "/revisao/api/whisper/responder",
        headers={"X-CSRF-Token": csrf},
        json={
            "laudo_id": laudo_id,
            "destinatario_id": destinatario_invalido,
            "mensagem": "Mensagem da mesa para inspetor incorreto.",
        },
    )

    assert resposta.status_code == 400
    assert "não corresponde ao inspetor responsável" in resposta.json()["detail"]


def test_jornada_e2e_chat_ia_e_mesa_comunicacao_bilateral(ambiente_critico) -> None:
    client_inspetor = ambiente_critico["client"]
    csrf_inspetor = _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")

    with TestClient(main.app) as client_revisor:
        csrf_revisor = _login_revisor(client_revisor, "revisor@empresa-a.test")

        resposta_inicio = client_inspetor.post(
            "/app/api/laudo/iniciar",
            headers={"X-CSRF-Token": csrf_inspetor},
            data={"tipo_template": "padrao"},
        )
        assert resposta_inicio.status_code == 200
        laudo_id = int(resposta_inicio.json()["laudo_id"])

        class ClienteIAStub:
            def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
                yield "Diagnóstico técnico da IA para validação.\n"
                yield "Existe risco moderado em proteção mecânica.\n"

        cliente_original = rotas_inspetor.cliente_ia
        rotas_inspetor.cliente_ia = ClienteIAStub()
        try:
            resposta_chat = client_inspetor.post(
                "/app/api/chat",
                headers={"X-CSRF-Token": csrf_inspetor},
                json={
                    "mensagem": "Analise os riscos da prensa hidráulica.",
                    "historico": [],
                    "laudo_id": laudo_id,
                },
            )
        finally:
            rotas_inspetor.cliente_ia = cliente_original

        assert resposta_chat.status_code == 200
        assert "text/event-stream" in (resposta_chat.headers.get("content-type", "").lower())
        assert "Diagnóstico técnico da IA" in resposta_chat.text

        resposta_inspetor_para_mesa = client_inspetor.post(
            f"/app/api/laudo/{laudo_id}/mesa/mensagem",
            headers={"X-CSRF-Token": csrf_inspetor},
            json={"texto": "Mesa, validar item 4 da NR-12 na foto enviada."},
        )
        assert resposta_inspetor_para_mesa.status_code == 201
        mensagem_inspetor_id = int(resposta_inspetor_para_mesa.json()["mensagem"]["id"])

        historico_revisor = client_revisor.get(f"/revisao/api/laudo/{laudo_id}/completo?incluir_historico=true")
        assert historico_revisor.status_code == 200
        corpo_historico_revisor = historico_revisor.json()
        assert any(item["is_whisper"] for item in corpo_historico_revisor["historico"])
        assert any(item["tipo"] == TipoMensagem.HUMANO_INSP.value for item in corpo_historico_revisor["whispers"])

        resposta_revisor = client_revisor.post(
            f"/revisao/api/laudo/{laudo_id}/responder",
            headers={"X-CSRF-Token": csrf_revisor},
            json={
                "texto": "Mesa avaliadora: ponto recebido, pode seguir com evidência complementar.",
                "referencia_mensagem_id": mensagem_inspetor_id,
            },
        )
        assert resposta_revisor.status_code == 200
        assert resposta_revisor.json()["success"] is True

        resposta_mesa_inspetor = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")
        assert resposta_mesa_inspetor.status_code == 200
        itens_mesa = resposta_mesa_inspetor.json()["itens"]
        assert any(item["tipo"] == TipoMensagem.HUMANO_ENG.value and item.get("referencia_mensagem_id") == mensagem_inspetor_id for item in itens_mesa)

        resposta_chat_inspetor = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mensagens")
        assert resposta_chat_inspetor.status_code == 200
        tipos_chat = {item["tipo"] for item in resposta_chat_inspetor.json()["itens"]}
        assert TipoMensagem.USER.value in tipos_chat
        assert TipoMensagem.IA.value in tipos_chat
        assert TipoMensagem.HUMANO_INSP.value not in tipos_chat
        assert TipoMensagem.HUMANO_ENG.value not in tipos_chat


def test_jornada_e2e_whisper_revisor_para_inspetor_com_referencia(ambiente_critico) -> None:
    client_inspetor = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_inspetor = _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta_base = client_inspetor.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf_inspetor},
        json={"texto": "Favor avaliar item de aterramento da máquina."},
    )
    assert resposta_base.status_code == 201
    referencia_id = int(resposta_base.json()["mensagem"]["id"])

    with TestClient(main.app) as client_revisor:
        csrf_revisor = _login_revisor(client_revisor, "revisor@empresa-a.test")

        resposta_whisper = client_revisor.post(
            "/revisao/api/whisper/responder",
            headers={"X-CSRF-Token": csrf_revisor},
            json={
                "laudo_id": laudo_id,
                "destinatario_id": ids["inspetor_a"],
                "mensagem": "Mesa: validar continuidade elétrica com instrumento calibrado.",
                "referencia_mensagem_id": referencia_id,
            },
        )

    assert resposta_whisper.status_code == 200
    assert resposta_whisper.json()["success"] is True
    assert int(resposta_whisper.json()["destinatario_id"]) == ids["inspetor_a"]

    resposta_mesa = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")
    assert resposta_mesa.status_code == 200
    itens_mesa = resposta_mesa.json()["itens"]
    assert any(
        item["tipo"] == TipoMensagem.HUMANO_ENG.value
        and item.get("referencia_mensagem_id") == referencia_id
        and "Mesa: validar continuidade elétrica" in item["texto"]
        for item in itens_mesa
    )


def test_jornada_e2e_isolamento_multiempresa_no_chat_e_mesa(ambiente_critico) -> None:
    client_inspetor_a = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_a = _login_app_inspetor(client_inspetor_a, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id_a = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id_a,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="Mensagem do inspetor A no chat IA.",
                ),
                MensagemLaudo(
                    laudo_id=laudo_id_a,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Mensagem da mesa para o inspetor A.",
                ),
            ]
        )
        banco.commit()

    with TestClient(main.app) as client_inspetor_b:
        csrf_b = _login_app_inspetor(client_inspetor_b, "inspetor@empresa-b.test")

        resposta_chat = client_inspetor_b.get(f"/app/api/laudo/{laudo_id_a}/mensagens", follow_redirects=False)
        assert resposta_chat.status_code == 404

        resposta_mesa = client_inspetor_b.get(f"/app/api/laudo/{laudo_id_a}/mesa/mensagens", follow_redirects=False)
        assert resposta_mesa.status_code == 404

        resposta_envio = client_inspetor_b.post(
            f"/app/api/laudo/{laudo_id_a}/mesa/mensagem",
            headers={"X-CSRF-Token": csrf_b},
            json={"texto": "Tentativa indevida de acesso cruzado."},
            follow_redirects=False,
        )
        assert resposta_envio.status_code == 404

    resposta_legitima = client_inspetor_a.post(
        f"/app/api/laudo/{laudo_id_a}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf_a},
        json={"texto": "Mensagem legítima do inspetor A para mesa."},
    )
    assert resposta_legitima.status_code == 201


def test_chat_ignora_aprendizado_visual_ainda_nao_validado_pela_mesa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta_aprendizado = client.post(
        f"/app/api/laudo/{laudo_id}/aprendizados",
        headers={"X-CSRF-Token": csrf},
        json={
            "resumo": "Linha de vida provisória",
            "descricao_contexto": "Foto inicial do conjunto de ancoragem.",
            "correcao_inspetor": "O ponto A da linha de vida parece correto nesta cena.",
            "veredito_inspetor": "conforme",
            "dados_imagem": _imagem_png_data_uri_teste(),
            "nome_imagem": "linha-vida.png",
            "pontos_chave": ["ponto A", "linha de vida"],
            "referencias_norma": ["NR-35"],
        },
    )
    assert resposta_aprendizado.status_code == 201

    captura: dict[str, str] = {}

    class ClienteIAStub:
        def gerar_resposta_stream(self, mensagem: str, *args, **kwargs):  # noqa: ANN002, ANN003
            captura["mensagem"] = mensagem
            yield "Resposta de teste."

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta_chat = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Analise a linha de vida desta evidência.",
                "historico": [],
                "laudo_id": laudo_id,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta_chat.status_code == 200
    assert "text/event-stream" in (resposta_chat.headers.get("content-type", "").lower())
    assert "aprendizados_visuais_validados" not in captura["mensagem"]
    assert "ponto A da linha de vida parece correto" not in captura["mensagem"].lower()


def test_chat_com_imagem_cria_rascunho_visual_para_mesa_mesmo_sem_correcao_explicita(ambiente_critico) -> None:
    client_inspetor = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_inspetor = _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    class ClienteIAStub:
        def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
            yield "Análise inicial da IA."

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta_chat = client_inspetor.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf_inspetor},
            json={
                "mensagem": "Analise esta linha de vida.",
                "historico": [],
                "laudo_id": laudo_id,
                "dados_imagem": _imagem_png_data_uri_teste(),
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta_chat.status_code == 200

    with TestClient(main.app) as client_revisor:
        csrf_revisor = _login_revisor(client_revisor, "revisor@empresa-a.test")
        resposta_aprendizados = client_revisor.get(
            f"/revisao/api/laudo/{laudo_id}/aprendizados",
            headers={"X-CSRF-Token": csrf_revisor},
        )
        assert resposta_aprendizados.status_code == 200
        itens = resposta_aprendizados.json()["itens"]
        assert len(itens) == 1
        assert itens[0]["status"] == "rascunho_inspetor"
        assert itens[0]["imagem_url"].startswith("/static/uploads/aprendizados_ia/")
        assert "Sem correção explícita do inspetor" in itens[0]["correcao_inspetor"]

        resposta_completo = client_revisor.get(f"/revisao/api/laudo/{laudo_id}/completo?incluir_historico=true")
        assert resposta_completo.status_code == 200
        assert len(resposta_completo.json()["aprendizados_visuais"]) == 1


def test_chat_com_correcao_textual_atualiza_rascunho_visual_automatico(ambiente_critico) -> None:
    client_inspetor = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_inspetor = _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    class ClienteIAStub:
        def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
            yield "A IA marcou o ponto como incorreto."

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta_imagem = client_inspetor.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf_inspetor},
            json={
                "mensagem": "Verifique esta ancoragem.",
                "historico": [],
                "laudo_id": laudo_id,
                "dados_imagem": _imagem_png_data_uri_teste(),
            },
        )
        resposta_correcao = client_inspetor.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf_inspetor},
            json={
                "mensagem": "Isso está correto, faça o relatório pra mim.",
                "historico": [],
                "laudo_id": laudo_id,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta_imagem.status_code == 200
    assert resposta_correcao.status_code == 200

    with SessionLocal() as banco:
        itens = (
            banco.query(AprendizadoVisualIa)
            .filter(
                AprendizadoVisualIa.laudo_id == laudo_id,
                AprendizadoVisualIa.empresa_id == ids["empresa_a"],
            )
            .order_by(AprendizadoVisualIa.id.asc())
            .all()
        )
        assert len(itens) == 1
        assert "Isso está correto" in str(itens[0].correcao_inspetor)
        assert str(getattr(itens[0].veredito_inspetor, "value", itens[0].veredito_inspetor)) == "conforme"


def test_mesa_valida_aprendizado_visual_e_chat_consulta_sintese_final(ambiente_critico) -> None:
    client_inspetor = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf_inspetor = _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta_aprendizado = client_inspetor.post(
        f"/app/api/laudo/{laudo_id}/aprendizados",
        headers={"X-CSRF-Token": csrf_inspetor},
        json={
            "resumo": "Ancoragem da linha de vida",
            "descricao_contexto": "Correção inicial feita pelo inspetor em campo.",
            "correcao_inspetor": "O ponto A é o ponto correto da linha de vida nesta imagem.",
            "veredito_inspetor": "conforme",
            "dados_imagem": _imagem_png_data_uri_teste(),
            "nome_imagem": "ancoragem.png",
            "pontos_chave": ["ponto A", "linha de vida"],
            "referencias_norma": ["NR-35 item 35.5"],
            "marcacoes": [{"rotulo": "Ponto A", "observacao": "Marcado pelo inspetor"}],
        },
    )
    assert resposta_aprendizado.status_code == 201
    aprendizado_id = int(resposta_aprendizado.json()["aprendizado"]["id"])

    with TestClient(main.app) as client_revisor:
        csrf_revisor = _login_revisor(client_revisor, "revisor@empresa-a.test")
        resposta_validacao = client_revisor.post(
            f"/revisao/api/aprendizados/{aprendizado_id}/validar",
            headers={"X-CSRF-Token": csrf_revisor},
            json={
                "acao": "aprovar",
                "parecer_mesa": "Mesa validou que o ponto B é o ponto correto; o ponto A estava incorreto.",
                "sintese_consolidada": (
                    "Usar como referência que o ponto B identifica a ancoragem correta "
                    "da linha de vida e o ponto A deve ser tratado como incorreto."
                ),
                "veredito_mesa": "nao_conforme",
                "pontos_chave": ["ponto B", "ancoragem correta", "linha de vida"],
                "referencias_norma": ["NR-35 item 35.5", "ancoragem certificada"],
                "marcacoes": [{"rotulo": "Ponto B", "observacao": "Referência validada pela mesa"}],
            },
        )
    assert resposta_validacao.status_code == 200
    assert resposta_validacao.json()["aprendizado"]["status"] == "validado_mesa"

    captura: dict[str, str] = {}

    class ClienteIAStub:
        def gerar_resposta_stream(self, mensagem: str, *args, **kwargs):  # noqa: ANN002, ANN003
            captura["mensagem"] = mensagem
            yield "Resposta de teste."

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta_chat = client_inspetor.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf_inspetor},
            json={
                "mensagem": "Confirme qual é o ponto correto da linha de vida nesta foto.",
                "historico": [],
                "laudo_id": laudo_id,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta_chat.status_code == 200
    assert "aprendizados_visuais_validados" in captura["mensagem"]
    assert "ponto b identifica a ancoragem correta" in captura["mensagem"].lower()
    assert "ponto a é o ponto correto" not in captura["mensagem"].lower()


def test_chat_nao_vaza_aprendizado_visual_validado_de_outra_empresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_a = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_b = _criar_laudo(
            banco,
            empresa_id=ids["empresa_b"],
            usuario_id=ids["inspetor_b"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        aprendizado = AprendizadoVisualIa(
            empresa_id=ids["empresa_b"],
            laudo_id=laudo_b,
            criado_por_id=ids["inspetor_b"],
            setor_industrial="geral",
            resumo="Caso externo de ancoragem",
            correcao_inspetor="Empresa B indicou ponto externo.",
            sintese_consolidada="Empresa B validou que o ponto externo Z é a única ancoragem correta.",
            status="validado_mesa",
            veredito_inspetor="duvida",
            veredito_mesa="conforme",
            pontos_chave_json=["ponto externo Z"],
            referencias_norma_json=["NR-35"],
            marcacoes_json=[{"rotulo": "Ponto Z", "observacao": "Aprendizado empresa B"}],
        )
        banco.add(aprendizado)
        banco.commit()

    captura: dict[str, str] = {}

    class ClienteIAStub:
        def gerar_resposta_stream(self, mensagem: str, *args, **kwargs):  # noqa: ANN002, ANN003
            captura["mensagem"] = mensagem
            yield "Resposta de teste."

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta_chat = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Analise a ancoragem desta linha de vida.",
                "historico": [],
                "laudo_id": laudo_a,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta_chat.status_code == 200
    assert "empresa b validou" not in captura["mensagem"].lower()
    assert "ponto externo z" not in captura["mensagem"].lower()


def test_api_chat_stream_emite_confianca_e_salva_revisao(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Inspecao inicial da area de prensas."
        banco.commit()

    class ClienteIAStub:
        def gerar_resposta_stream(self, *args, **kwargs):  # noqa: ANN002, ANN003
            yield "### Diagnostico Tecnico\n"
            yield "Foram verificadas evidencias na NR-12 e medicao de 12 mm.\n"
            yield "Ha ponto com possivel desgaste; necessario validar em campo.\n"

    cliente_original = rotas_inspetor.cliente_ia
    rotas_inspetor.cliente_ia = ClienteIAStub()
    try:
        resposta = client.post(
            "/app/api/chat",
            headers={"X-CSRF-Token": csrf},
            json={
                "mensagem": "Analise os riscos da linha de prensas e entregue parecer tecnico.",
                "historico": [],
                "laudo_id": laudo_id,
            },
        )
    finally:
        rotas_inspetor.cliente_ia = cliente_original

    assert resposta.status_code == 200
    assert "text/event-stream" in (resposta.headers.get("content-type", "").lower())
    assert "confianca_ia" in resposta.text

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert isinstance(laudo.confianca_ia_json, dict)
        assert laudo.confianca_ia_json.get("geral") in {"alta", "media", "baixa"}

        revisoes = banco.query(LaudoRevisao).filter(LaudoRevisao.laudo_id == laudo_id).order_by(LaudoRevisao.numero_versao.asc()).all()
        assert len(revisoes) == 1
        assert revisoes[0].numero_versao == 1
        assert revisoes[0].confianca_geral in {"alta", "media", "baixa"}


def test_inspetor_api_revisoes_lista_e_diff(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add_all(
            [
                LaudoRevisao(
                    laudo_id=laudo_id,
                    numero_versao=1,
                    origem="ia",
                    resumo="Versao inicial",
                    conteudo="Linha A: sem nao conformidade.",
                    confianca_geral="alta",
                    confianca_json={"geral": "alta", "secoes": [], "pontos_validacao_humana": []},
                ),
                LaudoRevisao(
                    laudo_id=laudo_id,
                    numero_versao=2,
                    origem="ia",
                    resumo="Versao atualizada",
                    conteudo="Linha A: sem nao conformidade.\nLinha B: ajustar bloqueio LOTO.",
                    confianca_geral="media",
                    confianca_json={"geral": "media", "secoes": [], "pontos_validacao_humana": []},
                ),
            ]
        )
        banco.commit()

    resposta_lista = client.get(f"/app/api/laudo/{laudo_id}/revisoes")
    assert resposta_lista.status_code == 200
    corpo_lista = resposta_lista.json()
    assert corpo_lista["laudo_id"] == laudo_id
    assert corpo_lista["total_revisoes"] == 2
    assert corpo_lista["ultima_versao"] == 2
    assert len(corpo_lista["revisoes"]) == 2

    resposta_diff = client.get(f"/app/api/laudo/{laudo_id}/revisoes/diff?base=1&comparar=2")
    assert resposta_diff.status_code == 200
    corpo_diff = resposta_diff.json()
    assert corpo_diff["base"]["versao"] == 1
    assert corpo_diff["comparar"]["versao"] == 2
    assert "versao_base" in corpo_diff["diff_unificado"]
    assert "versao_comparada" in corpo_diff["diff_unificado"]
    assert corpo_diff["resumo_diff"]["linhas_adicionadas"] >= 1
    assert corpo_diff["resumo_diff"]["total_alteracoes"] >= 1


def test_api_chat_comando_resumo_exibe_confianca_e_versionamento(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        laudo.primeira_mensagem = "Inspecao eletrica em painel principal."
        laudo.confianca_ia_json = {
            "geral": "baixa",
            "secoes": [],
            "pontos_validacao_humana": [
                "Sintese geral: validar medicao com instrumento calibrado.",
            ],
        }
        banco.add(
            LaudoRevisao(
                laudo_id=laudo_id,
                numero_versao=1,
                origem="ia",
                resumo="Primeira versao",
                conteudo="Versao inicial do parecer tecnico.",
                confianca_geral="baixa",
                confianca_json=laudo.confianca_ia_json,
            )
        )
        banco.commit()

    resposta = client.post(
        "/app/api/chat",
        headers={"X-CSRF-Token": csrf},
        json={
            "mensagem": "/resumo",
            "historico": [],
            "laudo_id": laudo_id,
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["tipo"] == "comando_rapido"
    assert "Confiança IA" in corpo["texto"]
    assert "Versionamento: **v1**" in corpo["texto"]
    assert "Pontos para validação humana" in corpo["texto"]


def test_inspetor_nao_pode_deletar_laudo_aguardando(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

    resposta = client.request(
        "DELETE",
        f"/app/api/laudo/{laudo_id}",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Esse laudo não pode ser excluído no estado atual."


def test_inspetor_pendencias_lista_somente_mensagens_da_mesa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência 1",
                    lida=False,
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência 2",
                    lida=True,
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="Mensagem comum do inspetor",
                    lida=False,
                ),
            ]
        )
        banco.commit()

    resposta = client.get(f"/app/api/laudo/{laudo_id}/pendencias")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["laudo_id"] == laudo_id
    assert corpo["filtro"] == "abertas"
    assert corpo["abertas"] == 1
    assert corpo["resolvidas"] == 1
    assert corpo["total"] == 2
    assert corpo["total_filtrado"] == 1
    assert len(corpo["pendencias"]) == 1
    assert all("Pendência" in item["texto"] for item in corpo["pendencias"])
    assert all(item["lida"] is False for item in corpo["pendencias"])


def test_inspetor_pendencias_rejeita_parametro_extra_com_formato_padrao_422(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta = client.get(f"/app/api/laudo/{laudo_id}/pendencias?x-schemathesis-unknown-property=42")

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert isinstance(corpo["detail"], list)
    assert corpo["detail"][0]["loc"] == ["query", "x-schemathesis-unknown-property"]
    assert corpo["detail"][0]["msg"] == "Extra inputs are not permitted"
    assert corpo["detail"][0]["type"] == "extra_forbidden"


def test_inspetor_pendencias_filtros_todas_e_resolvidas(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência aberta",
                    lida=False,
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência resolvida",
                    lida=True,
                ),
            ]
        )
        banco.commit()

    resposta_todas = client.get(f"/app/api/laudo/{laudo_id}/pendencias?filtro=todas")
    assert resposta_todas.status_code == 200
    corpo_todas = resposta_todas.json()
    assert corpo_todas["filtro"] == "todas"
    assert corpo_todas["total"] == 2
    assert corpo_todas["total_filtrado"] == 2
    assert len(corpo_todas["pendencias"]) == 2

    resposta_resolvidas = client.get(f"/app/api/laudo/{laudo_id}/pendencias?filtro=resolvidas")
    assert resposta_resolvidas.status_code == 200
    corpo_resolvidas = resposta_resolvidas.json()
    assert corpo_resolvidas["filtro"] == "resolvidas"
    assert corpo_resolvidas["total"] == 2
    assert corpo_resolvidas["total_filtrado"] == 1
    assert len(corpo_resolvidas["pendencias"]) == 1
    assert corpo_resolvidas["pendencias"][0]["lida"] is True


def test_inspetor_pendencias_paginacao_respeita_filtro(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        mensagens = []
        for indice in range(17):
            mensagens.append(
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo=f"Pendência aberta {indice}",
                    lida=False,
                )
            )

        for indice in range(4):
            mensagens.append(
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo=f"Pendência resolvida {indice}",
                    lida=True,
                )
            )

        banco.add_all(mensagens)
        banco.commit()

    resposta = client.get(f"/app/api/laudo/{laudo_id}/pendencias?filtro=abertas&pagina=2&tamanho=5")
    assert resposta.status_code == 200

    corpo = resposta.json()
    assert corpo["filtro"] == "abertas"
    assert corpo["pagina"] == 2
    assert corpo["tamanho"] == 5
    assert corpo["total"] == 21
    assert corpo["total_filtrado"] == 17
    assert corpo["tem_mais"] is True
    assert len(corpo["pendencias"]) == 5
    assert all(item["lida"] is False for item in corpo["pendencias"])


def test_inspetor_pendencias_marcar_lidas_atualiza_apenas_humano_eng(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendente A",
                    lida=False,
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendente B",
                    lida=False,
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.HUMANO_INSP.value,
                    conteudo="Whisper do inspetor",
                    lida=False,
                ),
            ]
        )
        banco.commit()

    resposta = client.post(
        f"/app/api/laudo/{laudo_id}/pendencias/marcar-lidas",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["ok"] is True
    assert corpo["marcadas"] == 2

    with SessionLocal() as banco:
        abertas_humano_eng = (
            banco.query(MensagemLaudo)
            .filter(
                MensagemLaudo.laudo_id == laudo_id,
                MensagemLaudo.tipo == TipoMensagem.HUMANO_ENG.value,
                MensagemLaudo.lida.is_(False),
            )
            .count()
        )
        assert abertas_humano_eng == 0

        aberto_humano_insp = (
            banco.query(MensagemLaudo)
            .filter(
                MensagemLaudo.laudo_id == laudo_id,
                MensagemLaudo.tipo == TipoMensagem.HUMANO_INSP.value,
                MensagemLaudo.lida.is_(False),
            )
            .count()
        )
        assert aberto_humano_insp == 1


def test_inspetor_pendencia_individual_registra_historico_e_reabre(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        msg = MensagemLaudo(
            laudo_id=laudo_id,
            remetente_id=ids["revisor_a"],
            tipo=TipoMensagem.HUMANO_ENG.value,
            conteudo="Corrigir item de segurança da NR.",
            lida=False,
        )
        banco.add(msg)
        banco.commit()
        banco.refresh(msg)
        mensagem_id = msg.id

    resposta_resolver = client.patch(
        f"/app/api/laudo/{laudo_id}/pendencias/{mensagem_id}",
        json={"lida": True},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta_resolver.status_code == 200
    corpo_resolver = resposta_resolver.json()
    assert corpo_resolver["ok"] is True
    assert corpo_resolver["lida"] is True
    assert corpo_resolver["resolvida_por_id"] == ids["inspetor_a"]
    assert corpo_resolver["resolvida_em"]

    with SessionLocal() as banco:
        msg_db = banco.get(MensagemLaudo, mensagem_id)
        assert msg_db is not None
        assert msg_db.lida is True
        assert msg_db.resolvida_por_id == ids["inspetor_a"]
        assert msg_db.resolvida_em is not None

    resposta_reabrir = client.patch(
        f"/app/api/laudo/{laudo_id}/pendencias/{mensagem_id}",
        json={"lida": False},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta_reabrir.status_code == 200
    corpo_reabrir = resposta_reabrir.json()
    assert corpo_reabrir["ok"] is True
    assert corpo_reabrir["lida"] is False
    assert corpo_reabrir["resolvida_por_id"] is None
    assert corpo_reabrir["resolvida_em"] == ""

    with SessionLocal() as banco:
        msg_db = banco.get(MensagemLaudo, mensagem_id)
        assert msg_db is not None
        assert msg_db.lida is False
        assert msg_db.resolvida_por_id is None
        assert msg_db.resolvida_em is None


def test_inspetor_exportar_pendencias_pdf_retorna_arquivo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    _csrf = _login_app_inspetor(client, "inspetor@empresa-a.test")

    with SessionLocal() as banco:
        revisor = banco.get(Usuario, ids["revisor_a"])
        assert revisor is not None
        revisor.crea = "123456-SP"

        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["revisor_a"],
                tipo=TipoMensagem.HUMANO_ENG.value,
                conteudo="Ajustar item do laudo para adequacao.",
                lida=False,
            )
        )
        banco.commit()

    resposta = client.get(f"/app/api/laudo/{laudo_id}/pendencias/exportar-pdf?filtro=abertas")

    assert resposta.status_code == 200
    content_type = resposta.headers.get("content-type", "").lower()
    assert "application/pdf" in content_type

    content_disposition = resposta.headers.get("content-disposition", "").lower()
    assert "filename=" in content_disposition
    assert len(resposta.content) > 300

    pypdf = pytest.importorskip("pypdf")
    leitor = pypdf.PdfReader(io.BytesIO(resposta.content))
    texto_pdf = "\n".join((pagina.extract_text() or "") for pagina in leitor.pages)
    texto_pdf_maiusculo = texto_pdf.upper()

    assert "RELATORIO DE PENDENCIAS DA MESA AVALIADORA" in texto_pdf_maiusculo
    assert "CARIMBO DIGITAL TARIEL.IA" in texto_pdf_maiusculo
    assert "REVISOR A" in texto_pdf_maiusculo
    assert "123456-SP" in texto_pdf_maiusculo


def test_revisor_rejeitar_exige_motivo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

    resposta = client.post(
        f"/revisao/api/laudo/{laudo_id}/avaliar",
        data={"acao": "rejeitar", "motivo": "", "csrf_token": csrf},
    )

    assert resposta.status_code == 400
    assert resposta.json()["detail"] == "Motivo obrigatório."


def test_revisor_aprovar_atualiza_status_e_registra_mensagem(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

    resposta = client.post(
        f"/revisao/api/laudo/{laudo_id}/avaliar",
        data={"acao": "aprovar", "motivo": "", "csrf_token": csrf},
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert resposta.headers["location"] == "/revisao/painel"

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.APROVADO.value
        assert laudo.revisado_por == ids["revisor_a"]

        msg = banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo_id).order_by(MensagemLaudo.id.desc()).first()
        assert msg is not None
        assert msg.tipo == TipoMensagem.HUMANO_ENG.value
        assert "APROVADO" in msg.conteudo


def test_revisor_rejeitar_via_api_com_header_sem_motivo_assume_padrao(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

    resposta = client.post(
        f"/revisao/api/laudo/{laudo_id}/avaliar",
        data={"acao": "rejeitar", "motivo": "", "csrf_token": ""},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["success"] is True
    assert corpo["acao"] == "rejeitar"
    assert corpo["motivo"] == "Devolvido pela mesa sem motivo detalhado."

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        assert laudo.status_revisao == StatusRevisao.REJEITADO.value
        assert laudo.motivo_rejeicao == "Devolvido pela mesa sem motivo detalhado."


def test_inspetor_login_permite_bloqueio_temporario_expirado(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]

    with SessionLocal() as banco:
        usuario = banco.scalar(select(Usuario).where(Usuario.email == "inspetor@empresa-a.test"))
        assert usuario is not None
        usuario.status_bloqueio = True
        usuario.bloqueado_ate = datetime.now(timezone.utc) - timedelta(minutes=1)
        banco.commit()

    tela_login = client.get("/app/login")
    csrf = _extrair_csrf(tela_login.text)

    resposta = client.post(
        "/app/login",
        data={
            "email": "inspetor@empresa-a.test",
            "senha": SENHA_PADRAO,
            "csrf_token": csrf,
        },
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert resposta.headers["location"] == "/app/"


def test_revisor_websocket_rejeita_sessao_inativa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]

    _login_revisor(client, "revisor@empresa-a.test")

    seguranca.SESSOES_ATIVAS.clear()
    seguranca._SESSAO_EXPIRACAO.clear()  # noqa: SLF001
    seguranca._SESSAO_META.clear()  # noqa: SLF001
    with SessionLocal() as banco:
        banco.query(SessaoAtiva).delete()
        banco.commit()

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/revisao/ws/whispers"):
            pass

    assert exc.value.code == 4401


def test_sessao_admin_recupera_do_banco_apos_limpar_cache_memoria(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]

    _login_admin(client, "admin@empresa-a.test")

    with SessionLocal() as banco:
        assert banco.query(SessaoAtiva).count() == 1

    seguranca.SESSOES_ATIVAS.clear()
    seguranca._SESSAO_EXPIRACAO.clear()  # noqa: SLF001
    seguranca._SESSAO_META.clear()  # noqa: SLF001

    resposta = client.get("/admin/painel", follow_redirects=False)

    assert resposta.status_code == 200
    assert len(seguranca.SESSOES_ATIVAS) == 1


def test_sessao_admin_invalida_cache_local_quando_registro_some_do_banco(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]

    _login_admin(client, "admin@empresa-a.test")

    with SessionLocal() as banco:
        sessao = banco.query(SessaoAtiva).one()
        token = sessao.token
        banco.query(SessaoAtiva).filter(SessaoAtiva.token == token).delete()
        banco.commit()

    assert token in seguranca.SESSOES_ATIVAS
    assert seguranca.token_esta_ativo(token) is False
    assert token not in seguranca.SESSOES_ATIVAS

    resposta = client.get("/admin/painel", follow_redirects=False)

    assert resposta.status_code == 303
    assert resposta.headers["location"] == "/admin/login"


def test_reset_senha_revoga_sessoes_ativas_do_usuario(ambiente_critico) -> None:
    client_admin = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with TestClient(main.app) as client_inspetor:
        _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")

        resposta_autenticada = client_inspetor.get("/app/", follow_redirects=False)
        assert resposta_autenticada.status_code == 200

        _login_admin(client_admin, "admin@empresa-a.test")
        csrf_admin = _csrf_pagina(client_admin, f"/admin/clientes/{ids['empresa_a']}")

        reset = client_admin.post(
            f"/admin/clientes/{ids['empresa_a']}/resetar-senha/{ids['inspetor_a']}",
            data={"csrf_token": csrf_admin},
            follow_redirects=False,
        )
        assert reset.status_code == 303

        with SessionLocal() as banco:
            sessoes_usuario = banco.query(SessaoAtiva).filter(SessaoAtiva.usuario_id == ids["inspetor_a"]).count()
            assert sessoes_usuario == 0

        resposta_pos_reset = client_inspetor.get("/app/", follow_redirects=False)
        assert resposta_pos_reset.status_code == 303
        assert resposta_pos_reset.headers["location"] == "/app/login"


def test_admin_reset_senha_exibe_senha_temporaria_em_flash(ambiente_critico, monkeypatch: pytest.MonkeyPatch) -> None:
    client = ambiente_critico["client"]
    ids = ambiente_critico["ids"]
    senha_temporaria = "Reset@Temp123"

    _login_admin(client, "admin@empresa-a.test")
    csrf = _csrf_pagina(client, f"/admin/clientes/{ids['empresa_a']}")

    def _resetar_stub(_db: Session, _usuario_id: int) -> str:
        return senha_temporaria

    monkeypatch.setattr(rotas_admin, "resetar_senha_inspetor", _resetar_stub)

    resposta = client.post(
        f"/admin/clientes/{ids['empresa_a']}/resetar-senha/{ids['inspetor_a']}",
        data={"csrf_token": csrf},
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert senha_temporaria not in resposta.headers["location"]

    primeira_view = client.get(resposta.headers["location"])
    assert primeira_view.status_code == 200
    assert senha_temporaria in primeira_view.text

    segunda_view = client.get(f"/admin/clientes/{ids['empresa_a']}")
    assert segunda_view.status_code == 200
    assert senha_temporaria not in segunda_view.text


def test_admin_adicionar_inspetor_exibe_senha_temporaria_em_flash(ambiente_critico, monkeypatch: pytest.MonkeyPatch) -> None:
    client = ambiente_critico["client"]
    ids = ambiente_critico["ids"]
    senha_temporaria = "Novo@Temp123"

    _login_admin(client, "admin@empresa-a.test")
    csrf = _csrf_pagina(client, f"/admin/clientes/{ids['empresa_a']}")

    def _adicionar_stub(_db: Session, _empresa_id: int, _nome: str, _email: str) -> str:
        return senha_temporaria

    monkeypatch.setattr(rotas_admin, "adicionar_inspetor", _adicionar_stub)

    resposta = client.post(
        f"/admin/clientes/{ids['empresa_a']}/adicionar-inspetor",
        data={
            "csrf_token": csrf,
            "nome": "Novo Inspetor",
            "email": "novo.inspetor@empresa-a.test",
        },
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert senha_temporaria not in resposta.headers["location"]

    primeira_view = client.get(resposta.headers["location"])
    assert primeira_view.status_code == 200
    assert senha_temporaria in primeira_view.text

    segunda_view = client.get(f"/admin/clientes/{ids['empresa_a']}")
    assert segunda_view.status_code == 200
    assert senha_temporaria not in segunda_view.text


def test_admin_atualizar_crea_revisor(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    _login_admin(client, "admin@empresa-a.test")
    csrf = _csrf_pagina(client, f"/admin/clientes/{ids['empresa_a']}")

    resposta = client.post(
        f"/admin/clientes/{ids['empresa_a']}/usuarios/{ids['revisor_a']}/atualizar-crea",
        data={"csrf_token": csrf, "crea": " 123456-sp "},
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert resposta.headers["location"] == f"/admin/clientes/{ids['empresa_a']}?sucesso=CREA%20atualizado%20para%20Revisor%20A."

    with SessionLocal() as banco:
        revisor = banco.get(Usuario, ids["revisor_a"])
        assert revisor is not None
        assert revisor.crea == "123456-SP"


def test_admin_atualizar_crea_rejeita_inspetor(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    _login_admin(client, "admin@empresa-a.test")
    csrf = _csrf_pagina(client, f"/admin/clientes/{ids['empresa_a']}")

    resposta = client.post(
        f"/admin/clientes/{ids['empresa_a']}/usuarios/{ids['inspetor_a']}/atualizar-crea",
        data={"csrf_token": csrf, "crea": "123456-SP"},
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert "erro=" in resposta.headers["location"]

    with SessionLocal() as banco:
        inspetor = banco.get(Usuario, ids["inspetor_a"])
        assert inspetor is not None
        assert inspetor.crea in (None, "")


def test_admin_detalhe_empresa_exibe_admins_cliente_e_revisores(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    ids = ambiente_critico["ids"]

    _login_admin(client, "admin@empresa-a.test")

    resposta = client.get(f"/admin/clientes/{ids['empresa_a']}")

    assert resposta.status_code == 200
    assert "Admins-Cliente" in resposta.text
    assert "cliente@empresa-a.test" in resposta.text
    assert "Revisor A" in resposta.text


def test_admin_cadastrar_empresa_exibe_senha_temporaria_em_flash(ambiente_critico, monkeypatch: pytest.MonkeyPatch) -> None:
    client = ambiente_critico["client"]
    senha_temporaria = "Onboard@Temp123"

    _login_admin(client, "admin@empresa-a.test")
    csrf = _csrf_pagina(client, "/admin/painel")

    class _EmpresaStub:
        id = 999
        nome_fantasia = "Cliente Stub"

    def _registrar_stub(_db: Session, **_kwargs) -> tuple[_EmpresaStub, str]:
        return _EmpresaStub(), senha_temporaria

    monkeypatch.setattr(rotas_admin, "registrar_novo_cliente", _registrar_stub)

    resposta = client.post(
        "/admin/cadastrar-empresa",
        data={
            "csrf_token": csrf,
            "nome": "Cliente Stub",
            "cnpj": "99999999000199",
            "email": "admin@cliente-stub.test",
            "plano": "Ilimitado",
        },
        follow_redirects=False,
    )

    assert resposta.status_code == 303
    assert senha_temporaria not in resposta.headers["location"]

    primeira_view = client.get(resposta.headers["location"])
    assert primeira_view.status_code == 200
    assert senha_temporaria in primeira_view.text

    segunda_view = client.get("/admin/clientes")
    assert segunda_view.status_code == 200
    assert senha_temporaria not in segunda_view.text


def test_revisor_api_pacote_mesa_consolida_resumo_e_pendencias(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        agora = datetime.now(timezone.utc)
        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="Descrição técnica da inspeção de campo.",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="[imagem]",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="documento: checklist_nr12.pdf",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.HUMANO_INSP.value,
                    conteudo="[@mesa] preciso validar um ponto de segurança.",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.IA.value,
                    conteudo="Análise preliminar da IA com riscos mapeados.",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência aberta: enviar foto detalhada do quadro.",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendência resolvida: evidência validada.",
                    lida=True,
                    resolvida_por_id=ids["revisor_a"],
                    resolvida_em=agora,
                    custo_api_reais=Decimal("0.0000"),
                ),
                LaudoRevisao(
                    laudo_id=laudo_id,
                    numero_versao=1,
                    origem="ia",
                    resumo="Rascunho inicial da IA",
                    conteudo="Conteúdo da versão inicial",
                    confianca_geral="media",
                ),
                LaudoRevisao(
                    laudo_id=laudo_id,
                    numero_versao=2,
                    origem="mesa",
                    resumo="Ajustes da engenharia",
                    conteudo="Conteúdo revisado com ajustes",
                    confianca_geral="alta",
                ),
            ]
        )
        banco.commit()

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert int(corpo["laudo_id"]) == laudo_id

    resumo_mensagens = corpo["resumo_mensagens"]
    assert int(resumo_mensagens["total"]) == 7
    assert int(resumo_mensagens["inspetor"]) == 4
    assert int(resumo_mensagens["ia"]) == 1
    assert int(resumo_mensagens["mesa"]) == 2

    resumo_evidencias = corpo["resumo_evidencias"]
    assert int(resumo_evidencias["total"]) == 3
    assert int(resumo_evidencias["textuais"]) == 1
    assert int(resumo_evidencias["fotos"]) == 1
    assert int(resumo_evidencias["documentos"]) == 1

    resumo_pendencias = corpo["resumo_pendencias"]
    assert int(resumo_pendencias["total"]) == 2
    assert int(resumo_pendencias["abertas"]) == 1
    assert int(resumo_pendencias["resolvidas"]) == 1

    assert len(corpo["pendencias_abertas"]) == 1
    assert len(corpo["pendencias_resolvidas_recentes"]) == 1
    assert corpo["pendencias_resolvidas_recentes"][0]["resolvida_por_nome"] == "Revisor A"
    assert len(corpo["whispers_recentes"]) == 3
    assert len(corpo["revisoes_recentes"]) == 2


def test_revisor_api_pacote_mesa_serializa_anexos_por_mensagem(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    caminho_anexo = os.path.join(tempfile.gettempdir(), f"mesa_pkg_{uuid.uuid4().hex[:8]}.pdf")
    with open(caminho_anexo, "wb") as arquivo:
        arquivo.write(_pdf_base_bytes_teste())

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        mensagem = MensagemLaudo(
            laudo_id=laudo_id,
            remetente_id=ids["revisor_a"],
            tipo=TipoMensagem.HUMANO_ENG.value,
            conteudo="[ANEXO_MESA_SEM_TEXTO]",
            custo_api_reais=Decimal("0.0000"),
        )
        banco.add(mensagem)
        banco.flush()
        banco.add(
            AnexoMesa(
                laudo_id=laudo_id,
                mensagem_id=mensagem.id,
                enviado_por_id=ids["revisor_a"],
                nome_original="complemento.pdf",
                nome_arquivo="complemento.pdf",
                mime_type="application/pdf",
                categoria="documento",
                tamanho_bytes=len(_pdf_base_bytes_teste()),
                caminho_arquivo=caminho_anexo,
            )
        )
        banco.commit()

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert len(corpo["pendencias_abertas"]) == 1
    assert corpo["pendencias_abertas"][0]["texto"] == ""
    assert corpo["pendencias_abertas"][0]["anexos"][0]["nome"] == "complemento.pdf"
    assert corpo["pendencias_abertas"][0]["anexos"][0]["categoria"] == "documento"


def test_revisor_api_mensagens_e_completo_aceitam_cursor_nullish(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["inspetor_a"],
                tipo=TipoMensagem.USER.value,
                conteudo="Mensagem seed para histórico do revisor.",
                custo_api_reais=Decimal("0.0000"),
            )
        )
        banco.commit()

    _login_revisor(client, "revisor@empresa-a.test")

    resposta_mensagens = client.get(f"/revisao/api/laudo/{laudo_id}/mensagens?cursor=null")
    assert resposta_mensagens.status_code == 200
    assert resposta_mensagens.json()["laudo_id"] == laudo_id

    resposta_completo = client.get(f"/revisao/api/laudo/{laudo_id}/completo?incluir_historico=true&cursor=null")
    assert resposta_completo.status_code == 200
    assert int(resposta_completo.json()["id"]) == laudo_id


def test_revisor_api_pacote_rejeita_parametro_extra_com_formato_padrao_422(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote?x-schemathesis-unknown-property=42")

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert isinstance(corpo["detail"], list)
    assert corpo["detail"][0]["loc"] == ["query", "x-schemathesis-unknown-property"]
    assert corpo["detail"][0]["msg"] == "Extra inputs are not permitted"
    assert corpo["detail"][0]["type"] == "extra_forbidden"


def test_revisor_pode_resolver_e_reabrir_pendencia_da_mesa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        msg = MensagemLaudo(
            laudo_id=laudo_id,
            remetente_id=ids["revisor_a"],
            tipo=TipoMensagem.HUMANO_ENG.value,
            conteudo="Pendência aberta para validar aterramento.",
            lida=False,
            custo_api_reais=Decimal("0.0000"),
        )
        banco.add(msg)
        banco.commit()
        banco.refresh(msg)
        mensagem_id = int(msg.id)

    resposta_resolver = client.patch(
        f"/revisao/api/laudo/{laudo_id}/pendencias/{mensagem_id}",
        json={"lida": True},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta_resolver.status_code == 200
    corpo_resolver = resposta_resolver.json()
    assert corpo_resolver["success"] is True
    assert corpo_resolver["lida"] is True
    assert corpo_resolver["resolvida_por_id"] == ids["revisor_a"]
    assert corpo_resolver["resolvida_por_nome"] == "Revisor A"
    assert corpo_resolver["resolvida_em"]
    assert int(corpo_resolver["pendencias_abertas"]) == 0

    with SessionLocal() as banco:
        msg_db = banco.get(MensagemLaudo, mensagem_id)
        assert msg_db is not None
        assert msg_db.lida is True
        assert msg_db.resolvida_por_id == ids["revisor_a"]
        assert msg_db.resolvida_em is not None

    with TestClient(main.app) as client_inspetor:
        _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")
        resposta_mesa_resolvida = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")

    assert resposta_mesa_resolvida.status_code == 200
    item_resolvido = next(item for item in resposta_mesa_resolvida.json()["itens"] if int(item["id"]) == mensagem_id)
    assert item_resolvido["lida"] is True
    assert item_resolvido["resolvida_por_nome"] == "Revisor A"
    assert item_resolvido["resolvida_em"]

    resposta_reabrir = client.patch(
        f"/revisao/api/laudo/{laudo_id}/pendencias/{mensagem_id}",
        json={"lida": False},
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta_reabrir.status_code == 200
    corpo_reabrir = resposta_reabrir.json()
    assert corpo_reabrir["success"] is True
    assert corpo_reabrir["lida"] is False
    assert corpo_reabrir["resolvida_por_id"] is None
    assert corpo_reabrir["resolvida_por_nome"] == ""
    assert corpo_reabrir["resolvida_em"] == ""
    assert int(corpo_reabrir["pendencias_abertas"]) == 1

    with SessionLocal() as banco:
        msg_db = banco.get(MensagemLaudo, mensagem_id)
        assert msg_db is not None
        assert msg_db.lida is False
        assert msg_db.resolvida_por_id is None
        assert msg_db.resolvida_em is None

    with TestClient(main.app) as client_inspetor:
        _login_app_inspetor(client_inspetor, "inspetor@empresa-a.test")
        resposta_mesa_reaberta = client_inspetor.get(f"/app/api/laudo/{laudo_id}/mesa/mensagens")

    assert resposta_mesa_reaberta.status_code == 200
    item_reaberto = next(item for item in resposta_mesa_reaberta.json()["itens"] if int(item["id"]) == mensagem_id)
    assert item_reaberto["lida"] is False
    assert item_reaberto["resolvida_por_nome"] == ""
    assert item_reaberto["resolvida_em"] == ""


def test_revisor_marca_whispers_como_lidos_no_servidor(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.HUMANO_INSP.value,
                    conteudo="Whisper 1",
                    lida=False,
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.HUMANO_INSP.value,
                    conteudo="Whisper 2",
                    lida=False,
                    custo_api_reais=Decimal("0.0000"),
                ),
            ]
        )
        banco.commit()

    resposta = client.post(
        f"/revisao/api/laudo/{laudo_id}/marcar-whispers-lidos",
        headers={"X-CSRF-Token": csrf},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["success"] is True
    assert int(corpo["marcadas"]) == 2

    with SessionLocal() as banco:
        total_aberto = (
            banco.query(MensagemLaudo)
            .filter(
                MensagemLaudo.laudo_id == laudo_id,
                MensagemLaudo.tipo == TipoMensagem.HUMANO_INSP.value,
                MensagemLaudo.lida.is_(False),
            )
            .count()
        )
        assert total_aberto == 0


def test_revisor_api_pacote_mesa_respeita_isolamento_multiempresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_empresa_b = _criar_laudo(
            banco,
            empresa_id=ids["empresa_b"],
            usuario_id=ids["inspetor_b"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_empresa_b}/pacote")

    assert resposta.status_code == 404


def test_revisor_exportar_pacote_mesa_pdf_retorna_arquivo(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        revisor = banco.get(Usuario, ids["revisor_a"])
        assert revisor is not None
        revisor.crea = "987654-SP"

        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add_all(
            [
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["inspetor_a"],
                    tipo=TipoMensagem.USER.value,
                    conteudo="Descricao de campo para consolidacao do pacote.",
                    custo_api_reais=Decimal("0.0000"),
                ),
                MensagemLaudo(
                    laudo_id=laudo_id,
                    remetente_id=ids["revisor_a"],
                    tipo=TipoMensagem.HUMANO_ENG.value,
                    conteudo="Pendencia aberta para revisar instalacao eletrica.",
                    lida=False,
                    custo_api_reais=Decimal("0.0000"),
                ),
                LaudoRevisao(
                    laudo_id=laudo_id,
                    numero_versao=1,
                    origem="mesa",
                    resumo="Ajuste inicial da mesa",
                    conteudo="Conteudo revisado pela engenharia.",
                    confianca_geral="media",
                    criado_em=datetime.now(timezone.utc),
                ),
            ]
        )
        banco.commit()

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote/exportar-pdf")

    assert resposta.status_code == 200
    content_type = resposta.headers.get("content-type", "").lower()
    assert "application/pdf" in content_type

    content_disposition = resposta.headers.get("content-disposition", "").lower()
    assert "filename=" in content_disposition
    assert len(resposta.content) > 300

    pypdf = pytest.importorskip("pypdf")
    leitor = pypdf.PdfReader(io.BytesIO(resposta.content))
    texto_pdf = "\n".join((pagina.extract_text() or "") for pagina in leitor.pages)
    texto_pdf_maiusculo = texto_pdf.upper()

    assert "PACOTE TECNICO DA MESA AVALIADORA" in texto_pdf_maiusculo
    assert "RESUMO CONSOLIDADO" in texto_pdf_maiusculo
    assert "REVISOR A" in texto_pdf_maiusculo
    assert "987654-SP" in texto_pdf_maiusculo


def test_revisor_exportar_pacote_mesa_pdf_suporta_anexos_nas_pendencias(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    caminho_anexo = os.path.join(tempfile.gettempdir(), f"mesa_pdf_{uuid.uuid4().hex[:8]}.pdf")
    with open(caminho_anexo, "wb") as arquivo:
        arquivo.write(_pdf_base_bytes_teste())

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        mensagem = MensagemLaudo(
            laudo_id=laudo_id,
            remetente_id=ids["revisor_a"],
            tipo=TipoMensagem.HUMANO_ENG.value,
            conteudo="[ANEXO_MESA_SEM_TEXTO]",
            lida=False,
            custo_api_reais=Decimal("0.0000"),
        )
        banco.add(mensagem)
        banco.flush()
        banco.add(
            AnexoMesa(
                laudo_id=laudo_id,
                mensagem_id=mensagem.id,
                enviado_por_id=ids["revisor_a"],
                nome_original="complemento.pdf",
                nome_arquivo="complemento.pdf",
                mime_type="application/pdf",
                categoria="documento",
                tamanho_bytes=os.path.getsize(caminho_anexo),
                caminho_arquivo=caminho_anexo,
            )
        )
        banco.commit()

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote/exportar-pdf")

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert len(resposta.content) > 300


def test_revisor_exportar_pacote_pdf_rejeita_parametro_extra_com_formato_padrao_422(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote/exportar-pdf?x-schemathesis-unknown-property=42")

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert isinstance(corpo["detail"], list)
    assert corpo["detail"][0]["loc"] == ["query", "x-schemathesis-unknown-property"]
    assert corpo["detail"][0]["msg"] == "Extra inputs are not permitted"
    assert corpo["detail"][0]["type"] == "extra_forbidden"


def test_revisor_exportar_pacote_pdf_em_modo_schemathesis_retorna_placeholder_estavel(ambiente_critico, monkeypatch) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    monkeypatch.setenv("SCHEMATHESIS_TEST_HINTS", "1")

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_id}/pacote/exportar-pdf")

    assert resposta.status_code == 200
    assert "application/pdf" in (resposta.headers.get("content-type", "").lower())
    assert resposta.content.startswith(b"%PDF")


def test_revisor_exportar_pacote_mesa_pdf_respeita_isolamento_multiempresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_empresa_b = _criar_laudo(
            banco,
            empresa_id=ids["empresa_b"],
            usuario_id=ids["inspetor_b"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    _login_revisor(client, "revisor@empresa-a.test")
    resposta = client.get(f"/revisao/api/laudo/{laudo_empresa_b}/pacote/exportar-pdf")
    assert resposta.status_code == 404
