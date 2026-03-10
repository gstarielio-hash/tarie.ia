"""Gerenciador de notificações SSE por usuário (inspetor)."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from app.domains.chat.app_context import logger


class GerenciadorSSEUsuario:
    def __init__(self) -> None:
        self._filas: dict[int, set[asyncio.Queue]] = defaultdict(set)

    async def conectar(self, usuario_id: int) -> asyncio.Queue:
        fila: asyncio.Queue = asyncio.Queue(maxsize=50)
        self._filas[usuario_id].add(fila)
        return fila

    def desconectar(self, usuario_id: int, fila: asyncio.Queue) -> None:
        filas = self._filas.get(usuario_id)
        if not filas:
            return

        filas.discard(fila)
        if not filas:
            self._filas.pop(usuario_id, None)

    async def notificar(self, usuario_id: int, mensagem: dict[str, Any]) -> None:
        filas = list(self._filas.get(usuario_id, set()))
        if not filas:
            return

        filas_para_remover: list[asyncio.Queue] = []

        for fila in filas:
            try:
                fila.put_nowait(mensagem)
            except asyncio.QueueFull:
                logger.warning("Fila SSE cheia | usuario_id=%s", usuario_id)
                filas_para_remover.append(fila)

        for fila in filas_para_remover:
            self.desconectar(usuario_id, fila)


inspetor_notif_manager = GerenciadorSSEUsuario()


__all__ = [
    "GerenciadorSSEUsuario",
    "inspetor_notif_manager",
]
