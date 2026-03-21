from __future__ import annotations

import os
import tempfile
from decimal import Decimal

from sqlalchemy import select

from app.shared.database import (
    AnexoMesa,
    Empresa,
    MensagemLaudo,
    NivelAcesso,
    PlanoEmpresa,
    RegistroAuditoriaEmpresa,
    StatusRevisao,
    TipoMensagem,
    Usuario,
)
from tests.regras_rotas_criticas_support import (
    _criar_laudo,
    _docx_bytes_teste,
    _imagem_png_bytes_teste,
    _login_cliente,
)


def test_admin_cliente_altera_plano_apenas_da_propria_empresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta = client.patch(
        "/cliente/api/empresa/plano",
        headers={"X-CSRF-Token": csrf},
        json={"plano": "Intermediario"},
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["empresa"]["plano_ativo"] == "Intermediario"

    with SessionLocal() as banco:
        empresa_a = banco.get(Empresa, ids["empresa_a"])
        empresa_b = banco.get(Empresa, ids["empresa_b"])
        assert empresa_a is not None
        assert empresa_b is not None
        assert empresa_a.plano_ativo == "Intermediario"
        assert empresa_b.plano_ativo == PlanoEmpresa.ILIMITADO.value


def test_admin_cliente_cria_e_gerencia_usuarios_restritos_a_empresa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta_inspetor = client.post(
        "/cliente/api/usuarios",
        headers={"X-CSRF-Token": csrf},
        json={
            "nome": "Inspetor Operacional A2",
            "email": "inspetor2@empresa-a.test",
            "nivel_acesso": "inspetor",
            "telefone": "62999990000",
            "crea": "",
        },
    )

    assert resposta_inspetor.status_code == 201
    corpo_inspetor = resposta_inspetor.json()
    assert corpo_inspetor["usuario"]["papel"] == "Inspetor"
    assert corpo_inspetor["senha_temporaria"]

    resposta_revisor = client.post(
        "/cliente/api/usuarios",
        headers={"X-CSRF-Token": csrf},
        json={
            "nome": "Mesa Operacional A2",
            "email": "mesa2@empresa-a.test",
            "nivel_acesso": "revisor",
            "telefone": "62999991111",
            "crea": "123456/GO",
        },
    )

    assert resposta_revisor.status_code == 201
    corpo_revisor = resposta_revisor.json()
    usuario_revisor_id = int(corpo_revisor["usuario"]["id"])
    assert corpo_revisor["usuario"]["papel"] == "Mesa Avaliadora"
    assert corpo_revisor["usuario"]["crea"] == "123456/GO"

    resposta_toggle_outra_empresa = client.patch(
        f"/cliente/api/usuarios/{ids['inspetor_b']}/bloqueio",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_toggle_outra_empresa.status_code == 404

    resposta_reset = client.post(
        f"/cliente/api/usuarios/{usuario_revisor_id}/resetar-senha",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_reset.status_code == 200
    assert resposta_reset.json()["senha_temporaria"]

    with SessionLocal() as banco:
        novo_inspetor = banco.scalar(select(Usuario).where(Usuario.email == "inspetor2@empresa-a.test"))
        novo_revisor = banco.scalar(select(Usuario).where(Usuario.email == "mesa2@empresa-a.test"))
        assert novo_inspetor is not None
        assert novo_revisor is not None
        assert int(novo_inspetor.empresa_id) == ids["empresa_a"]
        assert int(novo_revisor.empresa_id) == ids["empresa_a"]
        assert int(novo_inspetor.nivel_acesso) == int(NivelAcesso.INSPETOR)
        assert int(novo_revisor.nivel_acesso) == int(NivelAcesso.REVISOR)


def test_admin_cliente_chat_lista_laudos_da_empresa_sem_vazar_outra(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    with SessionLocal() as banco:
        laudo_empresa_a = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_empresa_b = _criar_laudo(
            banco,
            empresa_id=ids["empresa_b"],
            usuario_id=ids["inspetor_b"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta_lista = client.get("/cliente/api/chat/laudos", headers={"X-CSRF-Token": csrf})

    assert resposta_lista.status_code == 200
    ids_laudos = {int(item["id"]) for item in resposta_lista.json()["itens"]}
    assert laudo_empresa_a in ids_laudos
    assert laudo_empresa_b not in ids_laudos

    resposta_mensagens_empresa_a = client.get(
        f"/cliente/api/chat/laudos/{laudo_empresa_a}/mensagens",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_mensagens_empresa_a.status_code == 200

    resposta_mensagens_empresa_b = client.get(
        f"/cliente/api/chat/laudos/{laudo_empresa_b}/mensagens",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_mensagens_empresa_b.status_code == 404


def test_admin_cliente_mesa_reescreve_urls_de_anexo_para_o_proprio_portal(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    conteudo = _imagem_png_bytes_teste()
    caminho = ""

    try:
        with SessionLocal() as banco:
            laudo_id = _criar_laudo(
                banco,
                empresa_id=ids["empresa_a"],
                usuario_id=ids["inspetor_a"],
                status_revisao=StatusRevisao.AGUARDANDO.value,
            )

            mensagem = MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["revisor_a"],
                tipo=TipoMensagem.HUMANO_ENG.value,
                conteudo="Pendencia com evidencia anexada.",
                lida=False,
                custo_api_reais=Decimal("0.0000"),
            )
            banco.add(mensagem)
            banco.flush()

            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as arquivo:
                arquivo.write(conteudo)
                caminho = arquivo.name

            anexo = AnexoMesa(
                laudo_id=laudo_id,
                mensagem_id=mensagem.id,
                enviado_por_id=ids["revisor_a"],
                nome_original="retorno-mesa.png",
                nome_arquivo="retorno-mesa.png",
                mime_type="image/png",
                categoria="imagem",
                tamanho_bytes=len(conteudo),
                caminho_arquivo=caminho,
            )
            banco.add(anexo)
            banco.commit()
            banco.refresh(anexo)
            anexo_id = int(anexo.id)

        resposta = client.get(
            f"/cliente/api/mesa/laudos/{laudo_id}/mensagens",
            headers={"X-CSRF-Token": csrf},
        )

        assert resposta.status_code == 200
        itens = resposta.json()["itens"]
        assert itens
        anexo_payload = itens[-1]["anexos"][0]
        assert anexo_payload["nome"] == "retorno-mesa.png"
        assert anexo_payload["url"] == f"/cliente/api/mesa/laudos/{laudo_id}/anexos/{anexo_id}"

        resposta_completo = client.get(
            f"/cliente/api/mesa/laudos/{laudo_id}/completo",
            params={"incluir_historico": "true"},
            headers={"X-CSRF-Token": csrf},
        )
        assert resposta_completo.status_code == 200
        historico = resposta_completo.json()["historico"]
        assert historico[-1]["anexos"][0]["url"] == f"/cliente/api/mesa/laudos/{laudo_id}/anexos/{anexo_id}"

        resposta_pacote = client.get(
            f"/cliente/api/mesa/laudos/{laudo_id}/pacote",
            headers={"X-CSRF-Token": csrf},
        )
        assert resposta_pacote.status_code == 200
        pacote = resposta_pacote.json()
        assert pacote["pendencias_abertas"][0]["anexos"][0]["url"] == f"/cliente/api/mesa/laudos/{laudo_id}/anexos/{anexo_id}"

        download = client.get(anexo_payload["url"])
        assert download.status_code == 200
        assert download.content == conteudo
    finally:
        if caminho and os.path.exists(caminho):
            os.unlink(caminho)


def test_admin_cliente_upload_documental_reaproveita_fluxo_do_chat(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta = client.post(
        "/cliente/api/chat/upload_doc",
        headers={"X-CSRF-Token": csrf},
        files={
            "arquivo": (
                "checklist-operacional.docx",
                _docx_bytes_teste("Checklist operacional do admin-cliente para a empresa."),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert "Checklist operacional do admin-cliente" in corpo["texto"]
    assert corpo["nome"] == "checklist-operacional.docx"
    assert corpo["chars"] >= 20
    assert corpo["truncado"] is False


def test_admin_cliente_registra_auditoria_de_plano_e_usuarios(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta_plano = client.patch(
        "/cliente/api/empresa/plano",
        headers={"X-CSRF-Token": csrf},
        json={"plano": "Intermediario"},
    )
    assert resposta_plano.status_code == 200

    resposta_usuario = client.post(
        "/cliente/api/usuarios",
        headers={"X-CSRF-Token": csrf},
        json={
            "nome": "Auditado Empresa A",
            "email": "auditado@empresa-a.test",
            "nivel_acesso": "inspetor",
            "telefone": "62991110000",
            "crea": "",
        },
    )
    assert resposta_usuario.status_code == 201
    usuario_novo_id = int(resposta_usuario.json()["usuario"]["id"])

    resposta_auditoria = client.get("/cliente/api/auditoria")
    assert resposta_auditoria.status_code == 200
    itens = resposta_auditoria.json()["itens"]
    acoes = [item["acao"] for item in itens]
    assert "plano_alterado" in acoes
    assert "usuario_criado" in acoes
    assert all(item["portal"] == "cliente" for item in itens)
    assert any(item["ator_usuario_id"] == ids["admin_cliente_a"] for item in itens)
    assert any(item["alvo_usuario_id"] == usuario_novo_id for item in itens if item["acao"] == "usuario_criado")
    registro_plano = next(item for item in itens if item["acao"] == "plano_alterado")
    assert registro_plano["payload"]["plano_anterior"] == "Ilimitado"
    assert registro_plano["payload"]["plano_novo"] == "Intermediario"
    assert registro_plano["payload"]["movimento"] == "downgrade"
    assert "Impacto esperado" in registro_plano["detalhe"]

    resposta_bootstrap = client.get("/cliente/api/bootstrap")
    assert resposta_bootstrap.status_code == 200
    bootstrap_itens = resposta_bootstrap.json()["auditoria"]["itens"]
    assert bootstrap_itens
    assert {item["acao"] for item in bootstrap_itens} >= {"plano_alterado", "usuario_criado"}

    with SessionLocal() as banco:
        registros = list(
            banco.scalars(
                select(RegistroAuditoriaEmpresa).where(RegistroAuditoriaEmpresa.empresa_id == ids["empresa_a"]).order_by(RegistroAuditoriaEmpresa.id.desc())
            ).all()
        )
        assert registros
        assert all(int(item.empresa_id) == ids["empresa_a"] for item in registros)
        assert {item.acao for item in registros} >= {"plano_alterado", "usuario_criado"}


def test_admin_cliente_registra_interesse_em_upgrade_no_historico(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta_plano = client.patch(
        "/cliente/api/empresa/plano",
        headers={"X-CSRF-Token": csrf},
        json={"plano": "Inicial"},
    )
    assert resposta_plano.status_code == 200

    resposta_interesse = client.post(
        "/cliente/api/empresa/plano/interesse",
        headers={"X-CSRF-Token": csrf},
        json={"plano": "Intermediario", "origem": "chat"},
    )
    assert resposta_interesse.status_code == 200
    corpo = resposta_interesse.json()
    assert corpo["success"] is True
    assert corpo["plano"]["plano"] == "Intermediario"
    assert corpo["plano"]["movimento"] == "upgrade"

    resposta_auditoria = client.get("/cliente/api/auditoria")
    assert resposta_auditoria.status_code == 200
    itens = resposta_auditoria.json()["itens"]
    registro = next(item for item in itens if item["acao"] == "plano_interesse_registrado")
    assert registro["payload"]["origem"] == "chat"
    assert registro["payload"]["plano_sugerido"] == "Intermediario"
    assert "Impacto esperado" in registro["detalhe"]


def test_admin_cliente_registra_auditoria_operacional_de_chat_e_mesa(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    resposta_criar = client.post(
        "/cliente/api/chat/laudos",
        headers={"X-CSRF-Token": csrf},
        data={"tipo_template": "padrao"},
    )
    assert resposta_criar.status_code == 200
    laudo_chat_id = int(resposta_criar.json()["laudo_id"])

    resposta_chat = client.post(
        "/cliente/api/chat/mensagem",
        headers={"X-CSRF-Token": csrf},
        json={
            "laudo_id": laudo_chat_id,
            "mensagem": "Fluxo auditado do admin-cliente no chat.",
            "historico": [],
            "setor": "geral",
            "modo": "detalhado",
        },
    )
    assert resposta_chat.status_code == 200

    with SessionLocal() as banco:
        laudo_reaberto_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.REJEITADO.value,
        )
        laudo_mesa_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.AGUARDANDO.value,
        )

    resposta_reabrir = client.post(
        f"/cliente/api/chat/laudos/{laudo_reaberto_id}/reabrir",
        headers={"X-CSRF-Token": csrf},
    )
    assert resposta_reabrir.status_code == 200

    resposta_mesa = client.post(
        f"/cliente/api/mesa/laudos/{laudo_mesa_id}/responder",
        headers={"X-CSRF-Token": csrf},
        json={"texto": "Mesa respondeu pelo portal do admin-cliente."},
    )
    assert resposta_mesa.status_code == 200

    resposta_avaliar = client.post(
        f"/cliente/api/mesa/laudos/{laudo_mesa_id}/avaliar",
        headers={"X-CSRF-Token": csrf},
        json={"acao": "aprovar", "motivo": ""},
    )
    assert resposta_avaliar.status_code == 200

    resposta_auditoria = client.get("/cliente/api/auditoria")
    assert resposta_auditoria.status_code == 200
    itens = resposta_auditoria.json()["itens"]
    acoes = {item["acao"] for item in itens}
    assert {
        "chat_laudo_criado",
        "chat_mensagem_enviada",
        "chat_laudo_reaberto",
        "mesa_resposta_enviada",
        "mesa_laudo_avaliado",
    }.issubset(acoes)

    registro_chat = next(item for item in itens if item["acao"] == "chat_mensagem_enviada")
    assert int(registro_chat["payload"]["laudo_id"]) == laudo_chat_id
    assert registro_chat["payload"]["modo"] == "detalhado"

    registro_mesa = next(item for item in itens if item["acao"] == "mesa_laudo_avaliado")
    assert int(registro_mesa["payload"]["laudo_id"]) == laudo_mesa_id
    assert registro_mesa["payload"]["acao"] == "aprovar"


def test_admin_cliente_resumo_empresa_explica_capacidade_e_upgrade_sugerido(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    csrf = _login_cliente(client, "cliente@empresa-a.test")

    with SessionLocal() as banco:
        _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )

    resposta_plano = client.patch(
        "/cliente/api/empresa/plano",
        headers={"X-CSRF-Token": csrf},
        json={"plano": "Inicial"},
    )
    assert resposta_plano.status_code == 200

    resposta = client.get("/cliente/api/empresa/resumo")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["plano_ativo"] == "Inicial"
    assert corpo["usuarios_em_uso"] == 3
    assert corpo["usuarios_max"] == 1
    assert corpo["usuarios_restantes"] == 0
    assert corpo["usuarios_excedente"] == 2
    assert corpo["laudos_mes_atual"] == 2
    assert corpo["laudos_mes_limite"] == 50
    assert corpo["laudos_restantes"] == 48
    assert corpo["capacidade_status"] == "critico"
    assert corpo["capacidade_tone"] == "ajustes"
    assert corpo["capacidade_gargalo"] == "usuarios"
    assert corpo["plano_sugerido"] == "Intermediario"
    assert "usuarios" in corpo["plano_sugerido_motivo"].lower()
    assert any(item["plano"] == "Intermediario" and item["sugerido"] is True for item in corpo["planos_catalogo"])
    assert any(item["canal"] == "admin" and "acessos" in item["badge"].lower() for item in corpo["avisos_operacionais"])
    saude = corpo["saude_operacional"]
    assert saude["historico_mensal"]
    assert saude["historico_diario"]
    assert saude["mix_equipe"]["inspetores"] >= 1
    assert saude["usuarios_ativos_total"] >= 1
    assert saude["status"]
    assert saude["tendencia_rotulo"]
