from __future__ import annotations

import asyncio

from app.domains.chat.notifications import GerenciadorSSEUsuario


def test_gerenciador_sse_entrega_notificacoes_e_expoe_metricas() -> None:
    gerenciador = GerenciadorSSEUsuario(max_queue_size=2)

    async def _cenario() -> None:
        fila_a = await gerenciador.conectar(7)
        fila_b = await gerenciador.conectar(7)
        fila_c = await gerenciador.conectar(9)

        entregues = await gerenciador.notificar(7, {"tipo": "mesa_ping"})

        assert entregues == 2
        assert fila_a.get_nowait() == {"tipo": "mesa_ping"}
        assert fila_b.get_nowait() == {"tipo": "mesa_ping"}
        assert fila_c.empty()
        assert gerenciador.total_conexoes(7) == 2
        assert gerenciador.total_conexoes() == 3
        assert gerenciador.total_usuarios() == 2

    asyncio.run(_cenario())


def test_gerenciador_sse_remove_filas_cheias() -> None:
    gerenciador = GerenciadorSSEUsuario(max_queue_size=1)

    async def _cenario() -> None:
        fila_lenta = await gerenciador.conectar(11)
        fila_ok = await gerenciador.conectar(11)

        fila_lenta.put_nowait({"tipo": "antiga"})

        entregues = await gerenciador.notificar(11, {"tipo": "nova"})

        assert entregues == 1
        assert gerenciador.total_conexoes(11) == 1
        assert fila_ok.get_nowait() == {"tipo": "nova"}
        assert fila_lenta.get_nowait() == {"tipo": "antiga"}

        gerenciador.desconectar(11, fila_ok)
        assert gerenciador.total_conexoes() == 0
        assert gerenciador.total_usuarios() == 0

    asyncio.run(_cenario())
