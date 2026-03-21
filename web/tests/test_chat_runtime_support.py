from __future__ import annotations

import asyncio
from decimal import Decimal
from types import SimpleNamespace

import app.domains.chat.chat_runtime_support as chat_runtime_support
from app.shared.database import CitacaoLaudo, Empresa, Laudo, LaudoRevisao, MensagemLaudo, TipoMensagem
from tests.regras_rotas_criticas_support import _criar_laudo


class _FakeRequest:
    def __init__(self) -> None:
        self._disconnected = False

    async def is_disconnected(self) -> bool:
        return self._disconnected


def test_atualizar_citacoes_laudo_descarta_itens_invalidos(ambiente_critico) -> None:
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao="rascunho",
        )
        banco.add(
            CitacaoLaudo(
                laudo_id=laudo_id,
                referencia="Antiga",
                trecho="Antiga",
                url="https://antiga.test",
                ordem=9,
            )
        )
        banco.commit()

        chat_runtime_support._atualizar_citacoes_laudo(
            banco=banco,
            laudo_id=laudo_id,
            citacoes=[
                "ignorar",
                {"referencia": "   "},
                {"referencia": "Norma 1", "trecho": "Trecho", "url": "https://nova.test", "ordem": "abc"},
            ],
        )
        banco.commit()

        citacoes = banco.query(CitacaoLaudo).filter(CitacaoLaudo.laudo_id == laudo_id).all()
        assert len(citacoes) == 1
        assert citacoes[0].referencia == "Norma 1"
        assert citacoes[0].ordem == 0


def test_salvar_mensagem_ia_persiste_revisao_citacoes_e_custos(ambiente_critico) -> None:
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao="rascunho",
        )

    asyncio.run(
        chat_runtime_support.salvar_mensagem_ia(
            laudo_id=laudo_id,
            usuario_id=ids["inspetor_a"],
            empresa_id=ids["empresa_a"],
            texto_final="Resposta final da IA com recomendação técnica.",
            metadados={"custo_reais": "1.25"},
            is_deep=True,
            citacoes=[
                {
                    "referencia": "NBR Exemplo",
                    "trecho": "Trecho relevante",
                    "url": "https://norma.test",
                    "ordem": 2,
                }
            ],
            confianca_ia={"geral": "alta"},
        )
    )

    with SessionLocal() as banco:
        mensagem = banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo_id).one()
        laudo = banco.get(Laudo, laudo_id)
        empresa = banco.get(Empresa, ids["empresa_a"])
        revisoes = banco.query(LaudoRevisao).filter(LaudoRevisao.laudo_id == laudo_id).all()
        citacoes = banco.query(CitacaoLaudo).filter(CitacaoLaudo.laudo_id == laudo_id).all()

        assert mensagem.tipo == TipoMensagem.IA.value
        assert mensagem.conteudo == "Resposta final da IA com recomendação técnica."
        assert Decimal(str(mensagem.custo_api_reais)) == Decimal("1.2500")
        assert laudo is not None
        assert laudo.parecer_ia == "Resposta final da IA com recomendação técnica."
        assert laudo.confianca_ia_json is not None
        assert Decimal(str(laudo.custo_api_reais)) == Decimal("1.2500")
        assert empresa is not None
        assert Decimal(str(empresa.custo_gerado_reais)) == Decimal("1.2500")
        assert empresa.mensagens_processadas == 1
        assert len(revisoes) == 1
        assert revisoes[0].origem == "ia"
        assert len(citacoes) == 1
        assert citacoes[0].referencia == "NBR Exemplo"


def test_salvar_mensagem_ia_ignora_texto_vazio(ambiente_critico) -> None:
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    with SessionLocal() as banco:
        laudo_id = _criar_laudo(
            banco,
            empresa_id=ids["empresa_a"],
            usuario_id=ids["inspetor_a"],
            status_revisao="rascunho",
        )

    asyncio.run(
        chat_runtime_support.salvar_mensagem_ia(
            laudo_id=laudo_id,
            usuario_id=ids["inspetor_a"],
            empresa_id=ids["empresa_a"],
            texto_final="   ",
            metadados={"custo_reais": "invalido"},
        )
    )

    with SessionLocal() as banco:
        assert banco.query(MensagemLaudo).filter(MensagemLaudo.laudo_id == laudo_id).count() == 0


def test_sse_notificacoes_inspetor_emite_hint_quando_schemathesis_ativo(monkeypatch) -> None:
    monkeypatch.setenv("SCHEMATHESIS_TEST_HINTS", "1")

    async def _cenario() -> None:
        resposta = await chat_runtime_support.sse_notificacoes_inspetor(
            _FakeRequest(),
            usuario=SimpleNamespace(id=77),
        )
        iterator = resposta.body_iterator.__aiter__()
        evento = await iterator.__anext__()

        assert resposta.headers["Cache-Control"] == "no-cache, no-store, must-revalidate"
        assert "\"usuario_id\": 77" in evento

    asyncio.run(_cenario())


def test_sse_notificacoes_inspetor_emite_eventos_e_heartbeat(monkeypatch) -> None:
    monkeypatch.delenv("SCHEMATHESIS_TEST_HINTS", raising=False)
    monkeypatch.setattr(chat_runtime_support, "TIMEOUT_KEEPALIVE_SSE_SEGUNDOS", 0.01)

    async def _cenario() -> None:
        request = _FakeRequest()
        resposta = await chat_runtime_support.sse_notificacoes_inspetor(
            request,
            usuario=SimpleNamespace(id=88),
        )
        iterator = resposta.body_iterator.__aiter__()

        primeiro = await iterator.__anext__()
        assert "\"tipo\": \"conectado\"" in primeiro
        assert chat_runtime_support.inspetor_notif_manager.total_conexoes(88) == 1

        await chat_runtime_support.inspetor_notif_manager.notificar(88, {"tipo": "alerta"})
        segundo = await iterator.__anext__()
        assert "\"tipo\": \"alerta\"" in segundo

        terceiro = await iterator.__anext__()
        assert "\"tipo\": \"heartbeat\"" in terceiro

        request._disconnected = True
        with pytest.raises(StopAsyncIteration):
            await iterator.__anext__()

        assert chat_runtime_support.inspetor_notif_manager.total_conexoes(88) == 0

    import pytest

    asyncio.run(_cenario())
