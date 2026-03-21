from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from app.shared.database import Laudo, MensagemLaudo, StatusRevisao, TipoMensagem
from tests.regras_rotas_criticas_support import SENHA_PADRAO, _criar_laudo, _login_app_inspetor


def _login_mobile_inspetor(client) -> dict[str, str]:
    resposta = client.post(
        "/app/api/mobile/auth/login",
        json={
            "email": "inspetor@empresa-a.test",
            "senha": SENHA_PADRAO,
            "lembrar": True,
        },
    )
    assert resposta.status_code == 200
    token = resposta.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_mesa_mobile_idempotencia_reaproveita_mesma_mensagem(ambiente_critico) -> None:
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

    payload = {
        "texto": "Validação mobile com idempotência.",
        "client_message_id": "mesa:pytest:idempotencia:0001",
    }
    primeira = client.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf},
        json=payload,
    )
    assert primeira.status_code == 201
    corpo_primeira = primeira.json()
    assert corpo_primeira["idempotent_replay"] is False
    assert corpo_primeira["mensagem"]["client_message_id"] == payload["client_message_id"]

    segunda = client.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf},
        json=payload,
    )
    assert segunda.status_code == 200
    corpo_segunda = segunda.json()
    assert corpo_segunda["idempotent_replay"] is True
    assert corpo_segunda["mensagem"]["id"] == corpo_primeira["mensagem"]["id"]
    assert corpo_segunda["request_id"]

    with SessionLocal() as banco:
        mensagens = (
            banco.query(MensagemLaudo)
            .filter(
                MensagemLaudo.laudo_id == laudo_id,
                MensagemLaudo.client_message_id == payload["client_message_id"],
            )
            .all()
        )
        assert len(mensagens) == 1


def test_mesa_mobile_delta_e_resumo_refletem_novas_mensagens(ambiente_critico) -> None:
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

    primeira = client.post(
        f"/app/api/laudo/{laudo_id}/mesa/mensagem",
        headers={"X-CSRF-Token": csrf},
        json={"texto": "Primeira mensagem da mesa sync."},
    )
    assert primeira.status_code == 201
    cursor_ultimo_id = int(primeira.json()["mensagem"]["id"])

    with SessionLocal() as banco:
        laudo = banco.get(Laudo, laudo_id)
        assert laudo is not None
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_id,
                remetente_id=ids["revisor_a"],
                tipo=TipoMensagem.HUMANO_ENG.value,
                conteudo="Retorno novo da mesa para sync.",
                custo_api_reais=Decimal("0.0000"),
            )
        )
        laudo.atualizado_em = datetime.now(timezone.utc)
        banco.commit()

    resposta_delta = client.get(
        f"/app/api/laudo/{laudo_id}/mesa/mensagens",
        params={"apos_id": cursor_ultimo_id},
    )
    assert resposta_delta.status_code == 200
    corpo = resposta_delta.json()
    assert corpo["sync"]["modo"] == "delta"
    assert len(corpo["itens"]) == 1
    assert corpo["itens"][0]["texto"] == "Retorno novo da mesa para sync."
    assert corpo["cursor_ultimo_id"] == corpo["resumo"]["ultima_mensagem_id"]
    assert corpo["resumo"]["total_mensagens"] == 2
    assert corpo["resumo"]["pendencias_abertas"] == 1
    assert corpo["resumo"]["mensagens_nao_lidas"] == 1

    resposta_resumo = client.get(f"/app/api/laudo/{laudo_id}/mesa/resumo")
    assert resposta_resumo.status_code == 200
    resumo = resposta_resumo.json()["resumo"]
    assert resumo["ultima_mensagem_preview"] == "Retorno novo da mesa para sync."
    assert resumo["ultima_mensagem_tipo"] == TipoMensagem.HUMANO_ENG.value


def test_feed_mobile_mesa_retorna_apenas_laudos_alterados_desde_cursor(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]
    headers = _login_mobile_inspetor(client)

    with SessionLocal() as banco:
        laudo_a = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        laudo_b = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao=StatusRevisao.RASCUNHO.value,
        )
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_a,
                remetente_id=ids["revisor_a"],
                tipo=TipoMensagem.HUMANO_ENG.value,
                conteudo="Mensagem inicial da mesa no laudo A.",
                custo_api_reais=Decimal("0.0000"),
            )
        )
        laudo_modelo_a = banco.get(Laudo, laudo_a)
        assert laudo_modelo_a is not None
        laudo_modelo_a.atualizado_em = datetime.now(timezone.utc)
        banco.commit()

    primeira = client.get(
        "/app/api/mobile/mesa/feed",
        headers=headers,
        params={"laudo_ids": f"{laudo_a},{laudo_b}"},
    )
    assert primeira.status_code == 200
    corpo_primeira = primeira.json()
    assert set(corpo_primeira["laudo_ids"]) == {laudo_a, laudo_b}
    assert {item["laudo_id"] for item in corpo_primeira["itens"]} == {laudo_a, laudo_b}
    cursor = corpo_primeira["cursor_atual"]
    assert cursor

    with SessionLocal() as banco:
        laudo_modelo_b = banco.get(Laudo, laudo_b)
        assert laudo_modelo_b is not None
        banco.add(
            MensagemLaudo(
                laudo_id=laudo_b,
                remetente_id=ids["revisor_a"],
                tipo=TipoMensagem.HUMANO_ENG.value,
                conteudo="Mensagem nova da mesa no laudo B.",
                custo_api_reais=Decimal("0.0000"),
            )
        )
        laudo_modelo_b.atualizado_em = datetime.now(timezone.utc)
        banco.commit()

    segunda = client.get(
        "/app/api/mobile/mesa/feed",
        headers=headers,
        params={
            "laudo_ids": f"{laudo_a},{laudo_b}",
            "cursor_atualizado_em": cursor,
        },
    )
    assert segunda.status_code == 200
    corpo_segunda = segunda.json()
    assert len(corpo_segunda["itens"]) == 1
    assert corpo_segunda["itens"][0]["laudo_id"] == laudo_b
    assert corpo_segunda["itens"][0]["resumo"]["ultima_mensagem_preview"] == "Mensagem nova da mesa no laudo B."
