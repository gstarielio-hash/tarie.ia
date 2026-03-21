from __future__ import annotations

import asyncio
import contextlib
import json
from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from app.core.settings import get_settings
from app.domains.chat.notifications import inspetor_notif_manager
from app.domains.mesa.attachments import resumo_mensagem_mesa
from app.domains.revisor.base import _agora_utc, logger


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, dict[int, set[WebSocket]]] = defaultdict(lambda: defaultdict(set))

    async def connect(self, empresa_id: int, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[empresa_id][user_id].add(websocket)

    def disconnect(self, empresa_id: int, user_id: int, websocket: WebSocket) -> None:
        user_conns = self._connections.get(empresa_id, {}).get(user_id, set())
        user_conns.discard(websocket)

        if not user_conns and empresa_id in self._connections:
            self._connections[empresa_id].pop(user_id, None)

        if empresa_id in self._connections and not self._connections[empresa_id]:
            self._connections.pop(empresa_id, None)

    async def _send_json_seguro(
        self,
        *,
        empresa_id: int,
        user_id: int,
        websocket: WebSocket,
        mensagem: dict[str, Any],
    ) -> bool:
        try:
            await websocket.send_json(mensagem)
            return True
        except (WebSocketDisconnect, RuntimeError):
            self.disconnect(empresa_id, user_id, websocket)
            return False
        except Exception:
            logger.warning(
                "Falha ao enviar mensagem WS; removendo socket morto.",
                extra={
                    "empresa_id": empresa_id,
                    "user_id": user_id,
                },
                exc_info=True,
            )
            self.disconnect(empresa_id, user_id, websocket)
            return False

    async def send_to_user(self, empresa_id: int, user_id: int, mensagem: dict[str, Any]) -> None:
        conexoes = list(self._connections.get(empresa_id, {}).get(user_id, set()))
        if not conexoes:
            return

        for connection in conexoes:
            await self._send_json_seguro(
                empresa_id=empresa_id,
                user_id=user_id,
                websocket=connection,
                mensagem=mensagem,
            )

    async def broadcast_empresa(self, empresa_id: int, mensagem: dict[str, Any]) -> None:
        empresa_conexoes = self._connections.get(empresa_id, {})
        if not empresa_conexoes:
            return

        for user_id, connections in list(empresa_conexoes.items()):
            for connection in list(connections):
                await self._send_json_seguro(
                    empresa_id=empresa_id,
                    user_id=user_id,
                    websocket=connection,
                    mensagem=mensagem,
                )


class RevisorRealtimeTransport(ABC):
    backend_name = "memory"
    distributed = False

    def __init__(self) -> None:
        self._manager: ConnectionManager | None = None

    def bind_manager(self, manager: ConnectionManager) -> None:
        self._manager = manager

    def _require_manager(self) -> ConnectionManager:
        if self._manager is None:
            raise RuntimeError("Realtime transport sem ConnectionManager vinculado.")
        return self._manager

    async def startup(self) -> None:
        return None

    async def shutdown(self) -> None:
        return None

    @abstractmethod
    async def publish_to_user(self, *, empresa_id: int, user_id: int, mensagem: dict[str, Any]) -> None:
        raise NotImplementedError

    @abstractmethod
    async def publish_to_empresa(self, *, empresa_id: int, mensagem: dict[str, Any]) -> None:
        raise NotImplementedError


class InMemoryRevisorRealtimeTransport(RevisorRealtimeTransport):
    backend_name = "memory"
    distributed = False

    async def publish_to_user(self, *, empresa_id: int, user_id: int, mensagem: dict[str, Any]) -> None:
        await self._require_manager().send_to_user(
            empresa_id=empresa_id,
            user_id=user_id,
            mensagem=mensagem,
        )

    async def publish_to_empresa(self, *, empresa_id: int, mensagem: dict[str, Any]) -> None:
        await self._require_manager().broadcast_empresa(
            empresa_id=empresa_id,
            mensagem=mensagem,
        )


class RedisRevisorRealtimeTransport(RevisorRealtimeTransport):
    backend_name = "redis"
    distributed = True

    def __init__(self, *, redis_url: str, channel_prefix: str) -> None:
        super().__init__()
        self._redis_url = redis_url
        self._channel_prefix = channel_prefix.rstrip(":")
        self._redis: Any | None = None
        self._pubsub: Any | None = None
        self._listener_task: asyncio.Task[None] | None = None
        self._started = False

    def _canal_usuario(self, *, empresa_id: int, user_id: int) -> str:
        return f"{self._channel_prefix}:user:{empresa_id}:{user_id}"

    def _canal_empresa(self, *, empresa_id: int) -> str:
        return f"{self._channel_prefix}:empresa:{empresa_id}"

    def _carregar_payload_redis(self, *, canal: str, dados_brutos: Any) -> dict[str, Any] | None:
        if isinstance(dados_brutos, bytes):
            try:
                dados_texto = dados_brutos.decode("utf-8")
            except UnicodeDecodeError:
                logger.warning("Payload redis inválido no realtime do revisor | channel=%s", canal)
                return None
        elif isinstance(dados_brutos, str):
            dados_texto = dados_brutos
        else:
            logger.warning("Payload redis inesperado no realtime do revisor | channel=%s", canal)
            return None

        try:
            payload = json.loads(dados_texto)
        except json.JSONDecodeError:
            logger.warning("JSON redis inválido no realtime do revisor | channel=%s", canal)
            return None

        if not isinstance(payload, dict):
            logger.warning("Mensagem redis descartada por payload não-dict | channel=%s", canal)
            return None

        return payload

    def _resolver_destino_canal(self, canal: str) -> tuple[str, int, int | None] | None:
        partes = canal.split(":")
        if len(partes) < 3:
            logger.warning("Canal redis inválido no realtime do revisor | channel=%s", canal)
            return None

        try:
            if partes[-3] == "user" and len(partes) >= 4:
                return ("user", int(partes[-2]), int(partes[-1]))

            if partes[-2] == "empresa":
                return ("empresa", int(partes[-1]), None)
        except (TypeError, ValueError):
            logger.warning("Identificadores inválidos no canal redis do realtime | channel=%s", canal)
            return None

        logger.warning("Canal redis desconhecido no realtime do revisor | channel=%s", canal)
        return None

    async def startup(self) -> None:
        if self._started:
            return
        if not self._redis_url:
            raise RuntimeError("REDIS_URL é obrigatório quando REVISOR_REALTIME_BACKEND=redis.")

        try:
            import redis.asyncio as redis  # type: ignore[import-not-found]
        except ModuleNotFoundError as exc:
            raise RuntimeError("Backend realtime redis exige o pacote 'redis'. Instale a dependência antes de iniciar.") from exc

        self._redis = redis.from_url(self._redis_url, decode_responses=True)
        self._pubsub = self._redis.pubsub()
        await self._pubsub.psubscribe(
            f"{self._channel_prefix}:user:*:*",
            f"{self._channel_prefix}:empresa:*",
        )
        self._listener_task = asyncio.create_task(self._escutar_pubsub(), name="revisor-realtime-redis-listener")
        self._started = True

    async def shutdown(self) -> None:
        self._started = False

        if self._listener_task is not None:
            self._listener_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._listener_task
            self._listener_task = None

        if self._pubsub is not None:
            with contextlib.suppress(Exception):
                await self._pubsub.close()
            self._pubsub = None

        if self._redis is not None:
            with contextlib.suppress(Exception):
                await self._redis.close()
            self._redis = None

    async def publish_to_user(self, *, empresa_id: int, user_id: int, mensagem: dict[str, Any]) -> None:
        if self._redis is None:
            logger.warning("Transport redis ainda não iniciado; usando fallback local para publish_to_user.")
            await self._require_manager().send_to_user(
                empresa_id=empresa_id,
                user_id=user_id,
                mensagem=mensagem,
            )
            return

        await self._redis.publish(
            self._canal_usuario(empresa_id=empresa_id, user_id=user_id),
            json.dumps(mensagem),
        )

    async def publish_to_empresa(self, *, empresa_id: int, mensagem: dict[str, Any]) -> None:
        if self._redis is None:
            logger.warning("Transport redis ainda não iniciado; usando fallback local para publish_to_empresa.")
            await self._require_manager().broadcast_empresa(
                empresa_id=empresa_id,
                mensagem=mensagem,
            )
            return

        await self._redis.publish(
            self._canal_empresa(empresa_id=empresa_id),
            json.dumps(mensagem),
        )

    async def _escutar_pubsub(self) -> None:
        pubsub = self._pubsub
        if pubsub is None:
            return

        while self._started:
            try:
                mensagem = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("Falha ao consumir pubsub do realtime redis.", exc_info=True)
                await asyncio.sleep(1)
                continue

            if not mensagem:
                await asyncio.sleep(0)
                continue

            try:
                await self._despachar_mensagem_redis(mensagem)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("Falha ao despachar mensagem do realtime redis.", exc_info=True)

    async def _despachar_mensagem_redis(self, mensagem: dict[str, Any]) -> None:
        canal = str(mensagem.get("channel") or "")
        dados_brutos = mensagem.get("data")
        if not canal or dados_brutos is None:
            return

        payload = self._carregar_payload_redis(canal=canal, dados_brutos=dados_brutos)
        if payload is None:
            return

        destino = self._resolver_destino_canal(canal)
        if destino is None:
            return

        tipo_destino, empresa_id, user_id = destino
        if tipo_destino == "user" and user_id is not None:
            await self._require_manager().send_to_user(
                empresa_id=empresa_id,
                user_id=user_id,
                mensagem=payload,
            )
            return

        if tipo_destino == "empresa":
            await self._require_manager().broadcast_empresa(
                empresa_id=empresa_id,
                mensagem=payload,
            )


def _build_transport() -> RevisorRealtimeTransport:
    settings = get_settings()
    if settings.revisor_realtime_backend == "redis":
        return RedisRevisorRealtimeTransport(
            redis_url=settings.redis_url,
            channel_prefix=settings.revisor_realtime_channel_prefix,
        )
    return InMemoryRevisorRealtimeTransport()


manager = ConnectionManager()
transport = _build_transport()
transport.bind_manager(manager)


async def startup_revisor_realtime() -> None:
    await transport.startup()


async def shutdown_revisor_realtime() -> None:
    await transport.shutdown()


def describe_revisor_realtime() -> dict[str, Any]:
    settings = get_settings()
    return {
        "backend": transport.backend_name,
        "distributed": bool(getattr(transport, "distributed", False)),
        "channel_prefix": settings.revisor_realtime_channel_prefix,
    }


async def notificar_inspetor_sse(
    *,
    inspetor_id: int | None,
    laudo_id: int,
    tipo: str,
    texto: str,
    mensagem_id: int | None = None,
    referencia_mensagem_id: int | None = None,
    de_usuario_id: int | None = None,
    de_nome: str = "",
) -> None:
    if not inspetor_id:
        return

    try:
        payload = {
            "tipo": (tipo or "mensagem_eng").strip().lower(),
            "laudo_id": int(laudo_id),
            "mensagem_id": int(mensagem_id or 0) if mensagem_id else None,
            "referencia_mensagem_id": int(referencia_mensagem_id or 0) if referencia_mensagem_id else None,
            "de_usuario_id": int(de_usuario_id or 0) if de_usuario_id else None,
            "de_nome": (de_nome or "Mesa Avaliadora").strip()[:120],
            "texto": (texto or "").strip()[:300],
            "timestamp": _agora_utc().isoformat(),
        }

        await inspetor_notif_manager.notificar(int(inspetor_id), payload)
    except Exception:
        logger.warning(
            "Falha ao notificar inspetor via SSE | inspetor_id=%s | laudo_id=%s",
            inspetor_id,
            laudo_id,
            exc_info=True,
        )


async def notificar_whisper_resposta_revisor(
    *,
    empresa_id: int,
    destinatario_id: int,
    laudo_id: int,
    de_usuario_id: int,
    de_nome: str,
    mensagem_id: int,
    referencia_mensagem_id: int | None,
    preview: str,
) -> None:
    await transport.publish_to_user(
        empresa_id=empresa_id,
        user_id=destinatario_id,
        mensagem={
            "tipo": "whisper_resposta",
            "laudo_id": laudo_id,
            "de_usuario_id": de_usuario_id,
            "de_nome": de_nome,
            "mensagem_id": mensagem_id,
            "referencia_mensagem_id": referencia_mensagem_id,
            "preview": preview[:120],
            "timestamp": _agora_utc().isoformat(),
        },
    )


async def notificar_mesa_whisper_empresa(
    *,
    empresa_id: int,
    laudo_id: int,
    inspetor_id: int,
    inspetor_nome: str,
    preview: str,
) -> None:
    payload = {
        "tipo": "whisper_ping",
        "laudo_id": laudo_id,
        "inspetor": inspetor_nome,
        "inspetor_id": inspetor_id,
        "preview": resumo_mensagem_mesa(preview)[:120],
        "timestamp": _agora_utc().isoformat(),
    }
    await transport.publish_to_empresa(
        empresa_id=empresa_id,
        mensagem=payload,
    )


__all__ = [
    "ConnectionManager",
    "InMemoryRevisorRealtimeTransport",
    "RedisRevisorRealtimeTransport",
    "RevisorRealtimeTransport",
    "describe_revisor_realtime",
    "manager",
    "notificar_inspetor_sse",
    "notificar_mesa_whisper_empresa",
    "notificar_whisper_resposta_revisor",
    "shutdown_revisor_realtime",
    "startup_revisor_realtime",
    "transport",
]
