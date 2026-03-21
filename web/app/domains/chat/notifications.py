"""Gerenciador de notificações SSE por usuário (inspetor)."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from app.domains.chat.app_context import logger


class GerenciadorSSEUsuario:
    def __init__(self, *, max_queue_size: int = 50) -> None:
        self._max_queue_size = max(1, int(max_queue_size))
        self._filas: dict[int, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)

    async def conectar(self, usuario_id: int) -> asyncio.Queue[dict[str, Any]]:
        fila: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=self._max_queue_size)
        self._filas[usuario_id].add(fila)
        return fila

    def desconectar(self, usuario_id: int, fila: asyncio.Queue[dict[str, Any]]) -> None:
        filas = self._filas.get(usuario_id)
        if not filas:
            return

        filas.discard(fila)
        if not filas:
            self._filas.pop(usuario_id, None)

    async def notificar(self, usuario_id: int, mensagem: dict[str, Any]) -> int:
        filas = list(self._filas.get(usuario_id, set()))
        if not filas:
            return 0

        filas_para_remover: list[asyncio.Queue[dict[str, Any]]] = []
        entregues = 0

        for fila in filas:
            try:
                fila.put_nowait(mensagem)
                entregues += 1
            except asyncio.QueueFull:
                logger.warning("Fila SSE cheia | usuario_id=%s", usuario_id)
                filas_para_remover.append(fila)

        for fila in filas_para_remover:
            self.desconectar(usuario_id, fila)

        return entregues

    def total_conexoes(self, usuario_id: int | None = None) -> int:
        if usuario_id is not None:
            return len(self._filas.get(usuario_id, set()))
        return sum(len(filas) for filas in self._filas.values())

    def total_usuarios(self) -> int:
        return len(self._filas)


inspetor_notif_manager = GerenciadorSSEUsuario()


__all__ = [
    "GerenciadorSSEUsuario",
    "inspetor_notif_manager",
]
