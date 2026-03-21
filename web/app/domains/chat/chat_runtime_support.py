"""Suporte de runtime assíncrono e persistência final do chat inspetor."""

from __future__ import annotations

import asyncio
import os
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from fastapi import Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import delete

import app.domains.chat.routes as rotas_inspetor
from app.domains.chat.app_context import logger
from app.domains.chat.chat_runtime import LIMITE_PARECER, TIMEOUT_KEEPALIVE_SSE_SEGUNDOS
from app.domains.chat.core_helpers import agora_utc, evento_sse
from app.domains.chat.notifications import inspetor_notif_manager
from app.domains.chat.revisao_helpers import _registrar_revisao_laudo
from app.shared.database import CitacaoLaudo, Empresa, Laudo, MensagemLaudo, TipoMensagem, Usuario, commit_ou_rollback_operacional
from app.shared.security import exigir_inspetor
from nucleo.inspetor.confianca_ia import analisar_confianca_resposta_ia, normalizar_payload_confianca_ia


def _cabecalhos_sse() -> dict[str, str]:
    return {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive",
    }


def _normalizar_custo_reais(metadados: Optional[dict[str, Any]]) -> Decimal:
    if not metadados:
        return Decimal("0")

    try:
        return Decimal(str(metadados.get("custo_reais", "0")))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal("0")


async def sse_notificacoes_inspetor(
    request: Request,
    usuario: Usuario = Depends(exigir_inspetor),
) -> StreamingResponse:
    usuario_id = int(usuario.id)

    if os.getenv("SCHEMATHESIS_TEST_HINTS") == "1":

        async def gerador_hint():
            yield evento_sse({"tipo": "conectado", "usuario_id": usuario_id})

        return StreamingResponse(
            gerador_hint(),
            media_type="text/event-stream",
            headers=_cabecalhos_sse(),
        )

    fila = await inspetor_notif_manager.conectar(usuario_id)

    async def gerador():
        try:
            yield evento_sse({"tipo": "conectado", "usuario_id": usuario_id})

            while True:
                if await request.is_disconnected():
                    break

                try:
                    msg = await asyncio.wait_for(
                        fila.get(),
                        timeout=TIMEOUT_KEEPALIVE_SSE_SEGUNDOS,
                    )
                    yield evento_sse(msg)
                except asyncio.TimeoutError:
                    yield evento_sse({"tipo": "heartbeat"})
        finally:
            inspetor_notif_manager.desconectar(usuario_id, fila)

    return StreamingResponse(
        gerador(),
        media_type="text/event-stream",
        headers=_cabecalhos_sse(),
    )


def _atualizar_citacoes_laudo(
    *,
    banco: Any,
    laudo_id: int,
    citacoes: list[dict[str, Any]],
) -> None:
    banco.execute(delete(CitacaoLaudo).where(CitacaoLaudo.laudo_id == laudo_id))

    for citacao in citacoes:
        if not isinstance(citacao, dict):
            continue

        referencia = str(citacao.get("referencia", "") or "")[:300].strip()
        trecho = str(citacao.get("trecho", "") or "")[:300].strip() or None
        url = str(citacao.get("url", "") or "")[:500].strip() or None

        try:
            ordem = int(citacao.get("ordem", 0) or 0)
        except (TypeError, ValueError):
            ordem = 0

        if not referencia:
            continue

        banco.add(
            CitacaoLaudo(
                laudo_id=laudo_id,
                referencia=referencia,
                trecho=trecho,
                url=url,
                ordem=max(0, ordem),
            )
        )


async def salvar_mensagem_ia(
    laudo_id: int,
    usuario_id: int,
    empresa_id: int,
    texto_final: str,
    metadados: Optional[dict[str, Any]],
    is_deep: bool = False,
    citacoes: Optional[list[dict[str, Any]]] = None,
    confianca_ia: Optional[dict[str, Any]] = None,
) -> None:
    if not (texto_final or "").strip():
        return

    with rotas_inspetor.SessaoLocal() as banco:
        try:
            custo_reais = _normalizar_custo_reais(metadados)

            banco.add(
                MensagemLaudo(
                    laudo_id=laudo_id,
                    tipo=TipoMensagem.IA.value,
                    conteudo=texto_final,
                    custo_api_reais=custo_reais,
                )
            )

            laudo = banco.get(Laudo, laudo_id)
            if laudo:
                laudo_modelo: Any = laudo
                payload_confianca = normalizar_payload_confianca_ia(confianca_ia or {})
                if not payload_confianca:
                    payload_confianca = analisar_confianca_resposta_ia(texto_final)

                laudo_modelo.parecer_ia = texto_final[:LIMITE_PARECER]
                laudo_modelo.confianca_ia_json = payload_confianca or None
                laudo_modelo.custo_api_reais = (laudo_modelo.custo_api_reais or Decimal("0")) + custo_reais
                laudo_modelo.atualizado_em = agora_utc()
                _registrar_revisao_laudo(
                    banco,
                    laudo,
                    conteudo=texto_final,
                    origem="ia",
                    confianca=payload_confianca,
                )

                if is_deep and citacoes:
                    _atualizar_citacoes_laudo(
                        banco=banco,
                        laudo_id=laudo_id,
                        citacoes=citacoes,
                    )

            empresa = banco.get(Empresa, empresa_id)
            if empresa:
                empresa_modelo: Any = empresa
                if custo_reais > 0:
                    empresa_modelo.custo_gerado_reais = (empresa_modelo.custo_gerado_reais or Decimal("0")) + custo_reais

                empresa_modelo.mensagens_processadas = (empresa_modelo.mensagens_processadas or 0) + 1

            commit_ou_rollback_operacional(
                banco,
                logger_operacao=logger,
                mensagem_erro="Falha ao confirmar persistencia da resposta da IA.",
            )

        except Exception:
            logger.error(
                "Erro ao salvar mensagem IA | laudo_id=%s | usuario_id=%s",
                laudo_id,
                usuario_id,
                exc_info=True,
            )
            banco.rollback()


__all__ = [
    "salvar_mensagem_ia",
    "sse_notificacoes_inspetor",
]
