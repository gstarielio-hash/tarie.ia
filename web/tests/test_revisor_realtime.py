from __future__ import annotations

import asyncio
import json

import pytest

from app.domains.revisor.realtime import (
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


def test_transport_redis_exige_redis_url_no_startup() -> None:
    transport = RedisRevisorRealtimeTransport(redis_url="", channel_prefix="tariel:revisor")
    transport.bind_manager(_FakeManager())

    with pytest.raises(RuntimeError, match="REDIS_URL"):
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
