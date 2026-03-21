from __future__ import annotations

import asyncio
import builtins
import json
import os
import sys
import types
import uuid
from types import SimpleNamespace

import pytest
from starlette.websockets import WebSocketDisconnect

import app.domains.revisor.realtime as realtime
from app.domains.revisor.realtime import (
    ConnectionManager,
    InMemoryRevisorRealtimeTransport,
    RedisRevisorRealtimeTransport,
)


class _FakeManager:
    def __init__(self) -> None:
        self.user_messages: list[tuple[int, int, dict[str, object]]] = []
        self.empresa_messages: list[tuple[int, dict[str, object]]] = []

    async def send_to_user(self, *, empresa_id: int, user_id: int, mensagem: dict[str, object]) -> None:
        self.user_messages.append((empresa_id, user_id, mensagem))

    async def broadcast_empresa(self, *, empresa_id: int, mensagem: dict[str, object]) -> None:
        self.empresa_messages.append((empresa_id, mensagem))


class _FakeWebSocket:
    def __init__(self, *, falha: Exception | None = None) -> None:
        self.aceito = False
        self.mensagens: list[dict[str, object]] = []
        self._falha = falha

    async def accept(self) -> None:
        self.aceito = True

    async def send_json(self, mensagem: dict[str, object]) -> None:
        if self._falha is not None:
            raise self._falha
        self.mensagens.append(mensagem)


class _BridgeTransport(realtime.RevisorRealtimeTransport):
    async def publish_to_user(self, *, empresa_id: int, user_id: int, mensagem: dict[str, object]) -> None:
        await super().publish_to_user(empresa_id=empresa_id, user_id=user_id, mensagem=mensagem)

    async def publish_to_empresa(self, *, empresa_id: int, mensagem: dict[str, object]) -> None:
        await super().publish_to_empresa(empresa_id=empresa_id, mensagem=mensagem)


class _FakeRedisPubSub:
    def __init__(self, *, mensagens: list[object] | None = None) -> None:
        self.mensagens = list(mensagens or [])
        self.closed = False
        self.patterns: tuple[str, ...] = ()

    async def psubscribe(self, *patterns: str) -> None:
        self.patterns = patterns

    async def get_message(self, *, ignore_subscribe_messages: bool, timeout: float) -> object | None:
        assert ignore_subscribe_messages is True
        assert timeout == 1.0
        if not self.mensagens:
            return None
        mensagem = self.mensagens.pop(0)
        if isinstance(mensagem, BaseException):
            raise mensagem
        return mensagem

    async def close(self) -> None:
        self.closed = True


class _FakeRedisClient:
    def __init__(self, *, pubsub: _FakeRedisPubSub) -> None:
        self._pubsub = pubsub
        self.closed = False
        self.published: list[tuple[str, dict[str, object]]] = []

    def pubsub(self) -> _FakeRedisPubSub:
        return self._pubsub

    async def publish(self, canal: str, payload: str) -> None:
        self.published.append((canal, json.loads(payload)))

    async def close(self) -> None:
        self.closed = True


class _FakeListenerTask:
    def __init__(self) -> None:
        self.cancelled = False
        self.awaited = False

    def cancel(self) -> None:
        self.cancelled = True

    def __await__(self):  # type: ignore[no-untyped-def]
        async def _done() -> None:
            self.awaited = True

        return _done().__await__()


def test_connection_manager_remove_socket_morto_e_preserva_demais_conexoes() -> None:
    manager = ConnectionManager()
    socket_ok = _FakeWebSocket()
    socket_empresa = _FakeWebSocket()
    socket_morto = _FakeWebSocket(falha=RuntimeError("socket morto"))

    async def _cenario() -> None:
        await manager.connect(empresa_id=3, user_id=10, websocket=socket_ok)
        await manager.connect(empresa_id=3, user_id=10, websocket=socket_morto)
        await manager.connect(empresa_id=3, user_id=11, websocket=socket_empresa)

        await manager.send_to_user(
            empresa_id=3,
            user_id=10,
            mensagem={"tipo": "whisper_resposta"},
        )
        await manager.broadcast_empresa(
            empresa_id=3,
            mensagem={"tipo": "whisper_ping"},
        )

    asyncio.run(_cenario())

    assert socket_ok.aceito is True
    assert socket_empresa.aceito is True
    assert socket_ok.mensagens == [{"tipo": "whisper_resposta"}, {"tipo": "whisper_ping"}]
    assert socket_empresa.mensagens == [{"tipo": "whisper_ping"}]
    assert socket_morto.mensagens == []


def test_connection_manager_remove_socket_com_disconnect() -> None:
    manager = ConnectionManager()
    socket_morto = _FakeWebSocket(falha=WebSocketDisconnect())

    async def _cenario() -> None:
        await manager.connect(empresa_id=4, user_id=99, websocket=socket_morto)
        await manager.send_to_user(empresa_id=4, user_id=99, mensagem={"tipo": "ping"})

    asyncio.run(_cenario())

    assert socket_morto.aceito is True
    assert socket_morto.mensagens == []


def test_connection_manager_remove_socket_com_falha_generica_de_envio() -> None:
    manager = ConnectionManager()
    socket_ok = _FakeWebSocket()
    socket_morto = _FakeWebSocket(falha=ValueError("boom"))

    async def _cenario() -> None:
        await manager.connect(empresa_id=8, user_id=15, websocket=socket_ok)
        await manager.connect(empresa_id=8, user_id=15, websocket=socket_morto)
        await manager.send_to_user(empresa_id=8, user_id=15, mensagem={"tipo": "whisper_ping"})
        await manager.send_to_user(empresa_id=8, user_id=15, mensagem={"tipo": "whisper_ping_2"})

    asyncio.run(_cenario())

    assert socket_ok.mensagens == [{"tipo": "whisper_ping"}, {"tipo": "whisper_ping_2"}]
    assert socket_morto.mensagens == []


def test_transport_memory_publica_no_manager_local() -> None:
    manager = _FakeManager()
    transport = InMemoryRevisorRealtimeTransport()
    transport.bind_manager(manager)

    asyncio.run(
        transport.publish_to_user(
            empresa_id=7,
            user_id=42,
            mensagem={"tipo": "whisper_resposta"},
        )
    )
    asyncio.run(
        transport.publish_to_empresa(
            empresa_id=7,
            mensagem={"tipo": "whisper_ping"},
        )
    )

    assert manager.user_messages == [(7, 42, {"tipo": "whisper_resposta"})]
    assert manager.empresa_messages == [(7, {"tipo": "whisper_ping"})]


def test_transport_base_exige_manager_e_metodos_abstratos_falham() -> None:
    transport_memory = InMemoryRevisorRealtimeTransport()
    bridge_transport = _BridgeTransport()

    with pytest.raises(RuntimeError, match="ConnectionManager vinculado"):
        transport_memory._require_manager()

    assert asyncio.run(bridge_transport.startup()) is None
    assert asyncio.run(bridge_transport.shutdown()) is None

    with pytest.raises(NotImplementedError):
        asyncio.run(
            bridge_transport.publish_to_user(
                empresa_id=1,
                user_id=2,
                mensagem={"tipo": "whisper"},
            )
        )

    with pytest.raises(NotImplementedError):
        asyncio.run(
            bridge_transport.publish_to_empresa(
                empresa_id=1,
                mensagem={"tipo": "whisper"},
            )
        )


def test_transport_redis_exige_redis_url_no_startup() -> None:
    transport = RedisRevisorRealtimeTransport(redis_url="", channel_prefix="tariel:revisor")
    transport.bind_manager(_FakeManager())

    with pytest.raises(RuntimeError, match="REDIS_URL"):
        asyncio.run(transport.startup())


def test_transport_redis_startup_falha_sem_dependencia_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    transport = RedisRevisorRealtimeTransport(
        redis_url="redis://localhost:6379/0",
        channel_prefix="tariel:revisor",
    )
    transport.bind_manager(_FakeManager())

    import_original = builtins.__import__

    def _import_fake(name: str, globals=None, locals=None, fromlist=(), level: int = 0):  # type: ignore[no-untyped-def]
        if name == "redis.asyncio":
            raise ModuleNotFoundError("redis ausente")
        return import_original(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", _import_fake)

    with pytest.raises(RuntimeError, match="pacote 'redis'"):
        asyncio.run(transport.startup())


def test_transport_redis_faz_fallback_local_antes_do_startup() -> None:
    manager = _FakeManager()
    transport = RedisRevisorRealtimeTransport(
        redis_url="redis://localhost:6379/0",
        channel_prefix="tariel:revisor",
    )
    transport.bind_manager(manager)

    asyncio.run(
        transport.publish_to_user(
            empresa_id=3,
            user_id=9,
            mensagem={"tipo": "whisper_resposta", "texto": "ok"},
        )
    )
    asyncio.run(
        transport.publish_to_empresa(
            empresa_id=3,
            mensagem={"tipo": "whisper_ping", "texto": "ok"},
        )
    )

    assert manager.user_messages == [(3, 9, {"tipo": "whisper_resposta", "texto": "ok"})]
    assert manager.empresa_messages == [(3, {"tipo": "whisper_ping", "texto": "ok"})]


def test_transport_redis_helpers_cobrem_payloads_e_canais_invalidos() -> None:
    transport = RedisRevisorRealtimeTransport(
        redis_url="redis://localhost:6379/0",
        channel_prefix="tariel:revisor:",
    )

    assert transport._canal_usuario(empresa_id=11, user_id=22) == "tariel:revisor:user:11:22"
    assert transport._canal_empresa(empresa_id=11) == "tariel:revisor:empresa:11"
    assert transport._carregar_payload_redis(canal="unit", dados_brutos=b'{"tipo":"ok"}') == {"tipo": "ok"}
    assert transport._carregar_payload_redis(canal="unit", dados_brutos=b"\xff") is None
    assert transport._carregar_payload_redis(canal="unit", dados_brutos=123) is None
    assert transport._resolver_destino_canal("ruim") is None
    assert transport._resolver_destino_canal("tariel:revisor:user:abc:22") is None
    assert transport._resolver_destino_canal("tariel:revisor:desconhecido:11") is None
    assert transport._resolver_destino_canal("tariel:revisor:user:11:22") == ("user", 11, 22)
    assert transport._resolver_destino_canal("tariel:revisor:empresa:11") == ("empresa", 11, None)


def test_transport_redis_despacha_canal_usuario_para_manager_local() -> None:
    manager = _FakeManager()
    transport = RedisRevisorRealtimeTransport(
        redis_url="redis://localhost:6379/0",
        channel_prefix="tariel:revisor",
    )
    transport.bind_manager(manager)

    asyncio.run(
        transport._despachar_mensagem_redis(
            {
                "channel": "tariel:revisor:user:11:22",
                "data": json.dumps({"tipo": "whisper_resposta", "mensagem_id": 5}),
            }
        )
    )

    assert manager.user_messages == [(11, 22, {"tipo": "whisper_resposta", "mensagem_id": 5})]
    assert manager.empresa_messages == []


def test_transport_redis_despacha_canal_empresa_para_manager_local() -> None:
    manager = _FakeManager()
    transport = RedisRevisorRealtimeTransport(
        redis_url="redis://localhost:6379/0",
        channel_prefix="tariel:revisor",
    )
    transport.bind_manager(manager)

    asyncio.run(
        transport._despachar_mensagem_redis(
            {
                "channel": "tariel:revisor:empresa:11",
                "data": json.dumps({"tipo": "whisper_ping", "laudo_id": 99}),
            }
        )
    )

    assert manager.user_messages == []
    assert manager.empresa_messages == [(11, {"tipo": "whisper_ping", "laudo_id": 99})]


def test_transport_redis_descarta_payloads_malformados_sem_explodir() -> None:
    manager = _FakeManager()
    transport = RedisRevisorRealtimeTransport(
        redis_url="redis://localhost:6379/0",
        channel_prefix="tariel:revisor",
    )
    transport.bind_manager(manager)

    asyncio.run(transport._despachar_mensagem_redis({"channel": "tariel:revisor:user:11:22", "data": "{"}))
    asyncio.run(
        transport._despachar_mensagem_redis(
            {
                "channel": "tariel:revisor:user:empresa:22",
                "data": json.dumps({"tipo": "whisper_resposta"}),
            }
        )
    )
    asyncio.run(
        transport._despachar_mensagem_redis(
            {
                "channel": "tariel:revisor:empresa:11",
                "data": json.dumps(["nao-dict"]),
            }
        )
    )
    asyncio.run(
        transport._despachar_mensagem_redis(
            {
                "channel": "tariel:revisor:desconhecido:11",
                "data": json.dumps({"tipo": "ignorar"}),
            }
        )
    )

    assert manager.user_messages == []
    assert manager.empresa_messages == []


def test_transport_redis_startup_publica_e_shutdown_limpa_recursos(monkeypatch: pytest.MonkeyPatch) -> None:
    manager = _FakeManager()
    pubsub = _FakeRedisPubSub()
    redis_client = _FakeRedisClient(pubsub=pubsub)
    listener_task = _FakeListenerTask()
    redis_asyncio = types.ModuleType("redis.asyncio")
    redis_asyncio.from_url = lambda url, decode_responses=True: redis_client  # type: ignore[attr-defined]
    redis_package = types.ModuleType("redis")
    redis_package.asyncio = redis_asyncio  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "redis", redis_package)
    monkeypatch.setitem(sys.modules, "redis.asyncio", redis_asyncio)

    def _create_task_fake(coroutine, *, name: str | None = None):  # type: ignore[no-untyped-def]
        assert name == "revisor-realtime-redis-listener"
        coroutine.close()
        return listener_task

    monkeypatch.setattr(realtime.asyncio, "create_task", _create_task_fake)

    transport = RedisRevisorRealtimeTransport(
        redis_url="redis://localhost:6379/0",
        channel_prefix="tariel:revisor",
    )
    transport.bind_manager(manager)

    async def _cenario() -> None:
        await transport.startup()
        await transport.startup()
        await transport.publish_to_user(
            empresa_id=17,
            user_id=29,
            mensagem={"tipo": "whisper_resposta", "texto": "redis-ok"},
        )
        await transport.publish_to_empresa(
            empresa_id=17,
            mensagem={"tipo": "whisper_ping", "texto": "redis-broadcast"},
        )
        await transport.shutdown()

    asyncio.run(_cenario())

    assert pubsub.patterns == ("tariel:revisor:user:*:*", "tariel:revisor:empresa:*")
    assert redis_client.published == [
        ("tariel:revisor:user:17:29", {"tipo": "whisper_resposta", "texto": "redis-ok"}),
        ("tariel:revisor:empresa:17", {"tipo": "whisper_ping", "texto": "redis-broadcast"}),
    ]
    assert listener_task.cancelled is True
    assert listener_task.awaited is True
    assert pubsub.closed is True
    assert redis_client.closed is True


def test_transport_redis_escutar_pubsub_cobre_none_erro_e_dispatch(monkeypatch: pytest.MonkeyPatch) -> None:
    transport = RedisRevisorRealtimeTransport(
        redis_url="redis://localhost:6379/0",
        channel_prefix="tariel:revisor",
    )
    transport.bind_manager(_FakeManager())

    asyncio.run(transport._escutar_pubsub())

    pausas: list[int] = []

    async def _sleep_fake(segundos: int) -> None:
        pausas.append(segundos)

    monkeypatch.setattr(realtime.asyncio, "sleep", _sleep_fake)

    class _ErroNoGetMessage(_FakeRedisPubSub):
        async def get_message(self, *, ignore_subscribe_messages: bool, timeout: float) -> object | None:
            transport._started = False
            raise ValueError("pubsub indisponivel")

    transport._pubsub = _ErroNoGetMessage()
    transport._started = True
    asyncio.run(transport._escutar_pubsub())
    assert pausas == [1]

    pausas.clear()

    class _SemMensagem(_FakeRedisPubSub):
        async def get_message(self, *, ignore_subscribe_messages: bool, timeout: float) -> object | None:
            transport._started = False
            return None

    transport._pubsub = _SemMensagem()
    transport._started = True
    asyncio.run(transport._escutar_pubsub())
    assert pausas == [0]

    async def _despachar_falho(mensagem: dict[str, object]) -> None:
        assert mensagem["channel"] == "tariel:revisor:empresa:10"
        raise ValueError("dispatch falhou")

    monkeypatch.setattr(transport, "_despachar_mensagem_redis", _despachar_falho)

    class _MensagemValida(_FakeRedisPubSub):
        async def get_message(self, *, ignore_subscribe_messages: bool, timeout: float) -> object | None:
            transport._started = False
            return {"channel": "tariel:revisor:empresa:10", "data": '{"tipo":"whisper_ping"}'}

    transport._pubsub = _MensagemValida()
    transport._started = True
    asyncio.run(transport._escutar_pubsub())


def test_transport_redis_descarta_mensagem_sem_canal_ou_dados() -> None:
    manager = _FakeManager()
    transport = RedisRevisorRealtimeTransport(
        redis_url="redis://localhost:6379/0",
        channel_prefix="tariel:revisor",
    )
    transport.bind_manager(manager)

    asyncio.run(transport._despachar_mensagem_redis({"channel": "", "data": None}))

    assert manager.user_messages == []
    assert manager.empresa_messages == []


def test_transport_build_describe_wrappers_e_notificacoes(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeTransport:
        backend_name = "fake"
        distributed = True

        def __init__(self) -> None:
            self.started = 0
            self.stopped = 0
            self.user_messages: list[tuple[int, int, dict[str, object]]] = []
            self.empresa_messages: list[tuple[int, dict[str, object]]] = []

        async def startup(self) -> None:
            self.started += 1

        async def shutdown(self) -> None:
            self.stopped += 1

        async def publish_to_user(self, *, empresa_id: int, user_id: int, mensagem: dict[str, object]) -> None:
            self.user_messages.append((empresa_id, user_id, mensagem))

        async def publish_to_empresa(self, *, empresa_id: int, mensagem: dict[str, object]) -> None:
            self.empresa_messages.append((empresa_id, mensagem))

    fake_transport = _FakeTransport()
    notificacoes: list[tuple[int, dict[str, object]]] = []

    monkeypatch.setattr(
        realtime,
        "get_settings",
        lambda: SimpleNamespace(
            revisor_realtime_backend="redis",
            redis_url="redis://unit",
            revisor_realtime_channel_prefix="tariel:teste",
        ),
    )

    assert isinstance(realtime._build_transport(), RedisRevisorRealtimeTransport)

    monkeypatch.setattr(
        realtime,
        "get_settings",
        lambda: SimpleNamespace(
            revisor_realtime_backend="memory",
            redis_url="",
            revisor_realtime_channel_prefix="tariel:memory",
        ),
    )

    assert isinstance(realtime._build_transport(), InMemoryRevisorRealtimeTransport)
    monkeypatch.setattr(realtime, "transport", fake_transport)

    async def _notificar_ok(usuario_id: int, payload: dict[str, object]) -> None:
        notificacoes.append((usuario_id, payload))

    monkeypatch.setattr(realtime.inspetor_notif_manager, "notificar", _notificar_ok)

    async def _cenario() -> None:
        await realtime.startup_revisor_realtime()
        await realtime.shutdown_revisor_realtime()
        await realtime.notificar_inspetor_sse(
            inspetor_id=None,
            laudo_id=101,
            tipo="Mensagem_ENG",
            texto="ignorar",
        )
        await realtime.notificar_inspetor_sse(
            inspetor_id=12,
            laudo_id=101,
            tipo="Mensagem_ENG",
            texto="  aviso importante  ",
            mensagem_id=8,
            referencia_mensagem_id=5,
            de_usuario_id=3,
            de_nome="Mesa Central",
        )
        await realtime.notificar_whisper_resposta_revisor(
            empresa_id=3,
            destinatario_id=9,
            laudo_id=55,
            de_usuario_id=4,
            de_nome="Revisor A",
            mensagem_id=7,
            referencia_mensagem_id=2,
            preview="x" * 160,
        )
        await realtime.notificar_mesa_whisper_empresa(
            empresa_id=3,
            laudo_id=55,
            inspetor_id=9,
            inspetor_nome="Inspetor A",
            preview="Mensagem com resumo",
        )

    asyncio.run(_cenario())

    assert fake_transport.started == 1
    assert fake_transport.stopped == 1
    assert realtime.describe_revisor_realtime() == {
        "backend": "fake",
        "distributed": True,
        "channel_prefix": "tariel:memory",
    }
    assert notificacoes[0][0] == 12
    assert notificacoes[0][1]["tipo"] == "mensagem_eng"
    assert notificacoes[0][1]["texto"] == "aviso importante"
    assert fake_transport.user_messages[0][0:2] == (3, 9)
    assert fake_transport.user_messages[0][2]["tipo"] == "whisper_resposta"
    assert len(str(fake_transport.user_messages[0][2]["preview"])) == 120
    assert fake_transport.empresa_messages[0][0] == 3
    assert fake_transport.empresa_messages[0][1]["tipo"] == "whisper_ping"


def test_notificar_inspetor_sse_tolera_falha_de_entrega(monkeypatch: pytest.MonkeyPatch) -> None:
    chamadas: list[tuple[int, dict[str, object]]] = []

    async def _notificar_falhando(usuario_id: int, payload: dict[str, object]) -> None:
        chamadas.append((usuario_id, payload))
        raise RuntimeError("falha sse")

    monkeypatch.setattr(realtime.inspetor_notif_manager, "notificar", _notificar_falhando)

    asyncio.run(
        realtime.notificar_inspetor_sse(
            inspetor_id=99,
            laudo_id=77,
            tipo="Mensagem_ENG",
            texto="falha controlada",
        )
    )

    assert chamadas[0][0] == 99


def test_transport_redis_real_publica_e_consume_eventos() -> None:
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        pytest.skip("REDIS_URL ausente; teste de integracao com Redis real desativado.")

    manager = _FakeManager()
    transport = RedisRevisorRealtimeTransport(
        redis_url=redis_url,
        channel_prefix=f"tariel:revisor:test:{uuid.uuid4().hex}",
    )
    transport.bind_manager(manager)

    async def _cenario() -> None:
        await transport.startup()
        try:
            await asyncio.sleep(0.1)

            await transport.publish_to_user(
                empresa_id=17,
                user_id=29,
                mensagem={"tipo": "whisper_resposta", "texto": "redis-ok"},
            )
            await transport.publish_to_empresa(
                empresa_id=17,
                mensagem={"tipo": "whisper_ping", "texto": "redis-broadcast"},
            )

            for _ in range(40):
                if manager.user_messages and manager.empresa_messages:
                    break
                await asyncio.sleep(0.05)

            assert manager.user_messages == [(17, 29, {"tipo": "whisper_resposta", "texto": "redis-ok"})]
            assert manager.empresa_messages == [(17, {"tipo": "whisper_ping", "texto": "redis-broadcast"})]
        finally:
            await transport.shutdown()

    asyncio.run(_cenario())
