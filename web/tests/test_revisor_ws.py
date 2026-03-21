from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import HTTPException
import app.shared.security as seguranca
import pytest
from starlette.websockets import WebSocketDisconnect

import app.domains.revisor.routes as rotas_revisor
import app.domains.revisor.ws as ws
from app.shared.database import SessaoAtiva, Usuario
from app.shared.database import NivelAcesso
from tests.regras_rotas_criticas_support import _login_revisor


class _FakeSessaoLocal:
    def __init__(self, usuario: object | None) -> None:
        self.usuario = usuario

    def __enter__(self) -> "_FakeSessaoLocal":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:  # type: ignore[no-untyped-def]
        return False

    def get(self, _modelo: object, _usuario_id: int) -> object | None:
        return self.usuario


class _FakeWsManager:
    def __init__(self, *, falha_connect: BaseException | None = None) -> None:
        self.falha_connect = falha_connect
        self.connected: list[tuple[int, int, object]] = []
        self.disconnected: list[tuple[int, int, object]] = []
        self.broadcasts: list[tuple[int, dict[str, object]]] = []

    async def connect(self, empresa_id: int, user_id: int, websocket: object) -> None:
        if self.falha_connect is not None:
            raise self.falha_connect
        self.connected.append((empresa_id, user_id, websocket))

    def disconnect(self, empresa_id: int, user_id: int, websocket: object) -> None:
        self.disconnected.append((empresa_id, user_id, websocket))

    async def broadcast_empresa(self, empresa_id: int, mensagem: dict[str, object]) -> None:
        self.broadcasts.append((empresa_id, mensagem))


class _FakeUnitWebSocket:
    def __init__(
        self,
        *,
        session: dict[str, object] | None = None,
        recebidos: list[object] | None = None,
        falhas_envio: list[BaseException | None] | None = None,
        falha_fechar: BaseException | None = None,
    ) -> None:
        self.session = session or {}
        self.recebidos = list(recebidos or [])
        self.falhas_envio = list(falhas_envio or [])
        self.falha_fechar = falha_fechar
        self.enviados: list[dict[str, object]] = []
        self.closed_codes: list[int] = []

    async def send_json(self, payload: dict[str, object]) -> None:
        if self.falhas_envio:
            falha = self.falhas_envio.pop(0)
            if falha is not None:
                raise falha
        self.enviados.append(payload)

    async def receive_json(self) -> object:
        if not self.recebidos:
            raise WebSocketDisconnect()
        recebido = self.recebidos.pop(0)
        if isinstance(recebido, BaseException):
            raise recebido
        return recebido

    async def close(self, *, code: int) -> None:
        self.closed_codes.append(code)
        if self.falha_fechar is not None:
            raise self.falha_fechar


def test_revisor_websocket_fluxo_basico_e_payloads_invalidos(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_revisor(client, "revisor@empresa-a.test")

    with client.websocket_connect("/revisao/ws/whispers") as websocket:
        pronto = websocket.receive_json()
        assert pronto["tipo"] == "whisper_ready"
        assert pronto["empresa_id"] == ambiente_critico["ids"]["empresa_a"]

        websocket.send_json({"acao": "ping"})
        pong = websocket.receive_json()
        assert pong["tipo"] == "pong"

        websocket.send_json(["payload-invalido"])
        erro_payload = websocket.receive_json()
        assert erro_payload == {"tipo": "erro", "detail": "Payload WebSocket inválido."}

        websocket.send_json({"acao": "broadcast_mesa", "laudo_id": "abc"})
        erro_laudo = websocket.receive_json()
        assert erro_laudo == {"tipo": "erro", "detail": "laudo_id inválido para broadcast_mesa."}

        websocket.send_json({"acao": "desconhecida"})
        erro_acao = websocket.receive_json()
        assert erro_acao == {"tipo": "erro", "detail": "Ação WebSocket inválida."}


def test_revisor_websocket_recupera_sessao_do_banco_apos_limpar_cache_local(ambiente_critico) -> None:
    client = ambiente_critico["client"]

    _login_revisor(client, "revisor@empresa-a.test")

    seguranca.SESSOES_ATIVAS.clear()
    seguranca._SESSAO_EXPIRACAO.clear()  # noqa: SLF001
    seguranca._SESSAO_META.clear()  # noqa: SLF001

    with client.websocket_connect("/revisao/ws/whispers") as websocket:
        pronto = websocket.receive_json()
        assert pronto["tipo"] == "whisper_ready"
        assert len(seguranca.SESSOES_ATIVAS) == 1


def test_revisor_websocket_rejeita_usuario_bloqueado(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]
    ids = ambiente_critico["ids"]

    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        usuario = banco.get(Usuario, ids["revisor_a"])
        assert usuario is not None
        usuario.status_bloqueio = True
        usuario.bloqueado_ate = None
        banco.commit()

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/revisao/ws/whispers"):
            pass

    assert exc.value.code == 4403


def test_revisor_websocket_rejeita_sessao_removida_do_banco(ambiente_critico) -> None:
    client = ambiente_critico["client"]
    SessionLocal = ambiente_critico["SessionLocal"]

    _login_revisor(client, "revisor@empresa-a.test")

    with SessionLocal() as banco:
        banco.query(SessaoAtiva).delete()
        banco.commit()

    seguranca.SESSOES_ATIVAS.clear()
    seguranca._SESSAO_EXPIRACAO.clear()  # noqa: SLF001
    seguranca._SESSAO_META.clear()  # noqa: SLF001

    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/revisao/ws/whispers"):
            pass

    assert exc.value.code == 4401


def test_usuario_ws_da_sessao_rejeita_sessao_sem_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws, "obter_dados_sessao_portal", lambda sessao, portal: sessao)
    monkeypatch.setattr(ws, "token_esta_ativo", lambda token: True)

    with pytest.raises(HTTPException) as exc:
        ws._usuario_ws_da_sessao(_FakeUnitWebSocket(session={"token": "token-ok"}))

    assert exc.value.status_code == 401


def test_usuario_ws_da_sessao_rejeita_ids_invalidos(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws, "obter_dados_sessao_portal", lambda sessao, portal: sessao)
    monkeypatch.setattr(ws, "token_esta_ativo", lambda token: True)

    with pytest.raises(HTTPException) as exc:
        ws._usuario_ws_da_sessao(
            _FakeUnitWebSocket(
                session={
                    "token": "token-ok",
                    "usuario_id": "abc",
                    "empresa_id": "1",
                    "nivel_acesso": NivelAcesso.REVISOR.value,
                }
            )
        )

    assert exc.value.status_code == 401


def test_usuario_ws_da_sessao_rejeita_usuario_inexistente_ou_empresa_errada(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws, "obter_dados_sessao_portal", lambda sessao, portal: sessao)
    monkeypatch.setattr(ws, "token_esta_ativo", lambda token: True)
    monkeypatch.setattr(ws, "usuario_tem_bloqueio_ativo", lambda usuario: False)
    monkeypatch.setattr(ws, "usuario_tem_acesso_portal", lambda usuario, portal: True)
    monkeypatch.setattr(rotas_revisor, "SessaoLocal", lambda: _FakeSessaoLocal(SimpleNamespace(empresa_id=99, nome="Outro")))

    with pytest.raises(HTTPException) as exc:
        ws._usuario_ws_da_sessao(
            _FakeUnitWebSocket(
                session={
                    "token": "token-ok",
                    "usuario_id": 4,
                    "empresa_id": 1,
                    "nivel_acesso": NivelAcesso.REVISOR.value,
                }
            )
        )

    assert exc.value.status_code == 401


def test_usuario_ws_da_sessao_rejeita_usuario_sem_acesso_ou_nivel_invalido(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws, "obter_dados_sessao_portal", lambda sessao, portal: sessao)
    monkeypatch.setattr(ws, "token_esta_ativo", lambda token: True)
    monkeypatch.setattr(ws, "usuario_tem_bloqueio_ativo", lambda usuario: False)
    monkeypatch.setattr(rotas_revisor, "SessaoLocal", lambda: _FakeSessaoLocal(SimpleNamespace(empresa_id=1, nome="Revisor A")))

    monkeypatch.setattr(ws, "usuario_tem_acesso_portal", lambda usuario, portal: False)
    with pytest.raises(HTTPException) as exc_acesso:
        ws._usuario_ws_da_sessao(
            _FakeUnitWebSocket(
                session={
                    "token": "token-ok",
                    "usuario_id": 4,
                    "empresa_id": 1,
                    "nivel_acesso": NivelAcesso.REVISOR.value,
                }
            )
        )
    assert exc_acesso.value.status_code == 403

    monkeypatch.setattr(ws, "usuario_tem_acesso_portal", lambda usuario, portal: True)
    with pytest.raises(HTTPException) as exc_nivel:
        ws._usuario_ws_da_sessao(
            _FakeUnitWebSocket(
                session={
                    "token": "token-ok",
                    "usuario_id": 4,
                    "empresa_id": 1,
                    "nivel_acesso": NivelAcesso.ADMIN_CLIENTE.value,
                }
            )
        )

    assert exc_nivel.value.status_code == 403


def test_resolver_payload_broadcast_mesa_valida_laudo_ausente_e_nome_padrao() -> None:
    assert ws._resolver_payload_broadcast_mesa({}, nome_padrao="Revisor Padrao") == (None, None)

    laudo_id, payload = ws._resolver_payload_broadcast_mesa(
        {
            "laudo_id": "15",
            "preview": "x" * 200,
        },
        nome_padrao="Revisor Padrao",
    )

    assert laudo_id == 15
    assert payload is not None
    assert payload["tipo"] == "whisper_ping"
    assert payload["inspetor"] == "Revisor Padrao"
    assert len(str(payload["preview"])) == 120


def test_websocket_whispers_interrompe_se_nao_consegue_enviar_ready(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_manager = _FakeWsManager()
    fake_websocket = _FakeUnitWebSocket(falhas_envio=[RuntimeError("falha no ready")])

    monkeypatch.setattr(ws, "_usuario_ws_da_sessao", lambda websocket: {"empresa_id": 7, "usuario_id": 3, "nome": "Revisor A"})
    monkeypatch.setattr(ws, "manager", fake_manager)

    asyncio.run(ws.websocket_whispers(fake_websocket))

    assert fake_manager.connected == [(7, 3, fake_websocket)]
    assert fake_manager.disconnected == [(7, 3, fake_websocket)]
    assert fake_websocket.enviados == []


def test_websocket_whispers_envia_erro_quando_receive_json_falha(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_manager = _FakeWsManager()
    fake_websocket = _FakeUnitWebSocket(recebidos=[ValueError("json invalido"), WebSocketDisconnect()], falhas_envio=[None, None])

    monkeypatch.setattr(ws, "_usuario_ws_da_sessao", lambda websocket: {"empresa_id": 7, "usuario_id": 3, "nome": "Revisor A"})
    monkeypatch.setattr(ws, "manager", fake_manager)

    asyncio.run(ws.websocket_whispers(fake_websocket))

    assert fake_websocket.enviados[0]["tipo"] == "whisper_ready"
    assert fake_websocket.enviados[1] == {"tipo": "erro", "detail": "Payload WebSocket inválido."}
    assert fake_manager.disconnected == [(7, 3, fake_websocket)]


def test_websocket_whispers_interrompe_quando_resposta_de_erro_nao_pode_ser_enviada(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws, "_usuario_ws_da_sessao", lambda websocket: {"empresa_id": 7, "usuario_id": 3, "nome": "Revisor A"})

    for recebido in (
        ["payload-invalido"],
        {"acao": "broadcast_mesa", "laudo_id": "abc"},
        {"acao": "desconhecida"},
    ):
        fake_manager = _FakeWsManager()
        fake_websocket = _FakeUnitWebSocket(recebidos=[recebido], falhas_envio=[None, RuntimeError("erro nao enviado")])
        monkeypatch.setattr(ws, "manager", fake_manager)

        asyncio.run(ws.websocket_whispers(fake_websocket))

        assert fake_websocket.enviados == [{"tipo": "whisper_ready", "usuario_id": 3, "empresa_id": 7, "timestamp": fake_websocket.enviados[0]["timestamp"]}]
        assert fake_manager.disconnected == [(7, 3, fake_websocket)]


def test_websocket_whispers_broadcast_mesa_sucesso(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_manager = _FakeWsManager()
    fake_websocket = _FakeUnitWebSocket(
        recebidos=[
            {
                "acao": "broadcast_mesa",
                "laudo_id": "19",
                "preview": "mensagem importante",
            },
            WebSocketDisconnect(),
        ],
        falhas_envio=[None],
    )

    monkeypatch.setattr(ws, "_usuario_ws_da_sessao", lambda websocket: {"empresa_id": 11, "usuario_id": 5, "nome": "Revisor Nome"})
    monkeypatch.setattr(ws, "manager", fake_manager)

    asyncio.run(ws.websocket_whispers(fake_websocket))

    assert fake_manager.broadcasts[0][0] == 11
    assert fake_manager.broadcasts[0][1]["laudo_id"] == 19
    assert fake_manager.broadcasts[0][1]["inspetor"] == "Revisor Nome"
    assert fake_manager.disconnected == [(11, 5, fake_websocket)]


def test_websocket_whispers_interrompe_se_envio_do_pong_falha(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_manager = _FakeWsManager()
    fake_websocket = _FakeUnitWebSocket(recebidos=[{"acao": "ping"}], falhas_envio=[None, ValueError("pong indisponivel")])

    monkeypatch.setattr(ws, "_usuario_ws_da_sessao", lambda websocket: {"empresa_id": 11, "usuario_id": 5, "nome": "Revisor Nome"})
    monkeypatch.setattr(ws, "manager", fake_manager)

    asyncio.run(ws.websocket_whispers(fake_websocket))

    assert fake_websocket.enviados == [{"tipo": "whisper_ready", "usuario_id": 5, "empresa_id": 11, "timestamp": fake_websocket.enviados[0]["timestamp"]}]
    assert fake_manager.disconnected == [(11, 5, fake_websocket)]


def test_websocket_whispers_tolera_http_exception_e_falha_no_close(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_websocket = _FakeUnitWebSocket(falha_fechar=ValueError("close falhou"))

    def _levantar_http(_websocket: object) -> dict[str, object]:
        raise HTTPException(status_code=401, detail="sessao invalida")

    monkeypatch.setattr(ws, "_usuario_ws_da_sessao", _levantar_http)

    asyncio.run(ws.websocket_whispers(fake_websocket))

    assert fake_websocket.closed_codes == [4401]


def test_websocket_whispers_tolera_falhas_externas_de_connect(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ws, "_usuario_ws_da_sessao", lambda websocket: {"empresa_id": 1, "usuario_id": 2, "nome": "Revisor"})

    for falha in (WebSocketDisconnect(), RuntimeError("connect falhou"), ValueError("connect falhou")):
        fake_manager = _FakeWsManager(falha_connect=falha)
        monkeypatch.setattr(ws, "manager", fake_manager)

        asyncio.run(ws.websocket_whispers(_FakeUnitWebSocket()))

        assert fake_manager.connected == []
        assert fake_manager.disconnected == []
