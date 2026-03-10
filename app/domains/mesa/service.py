"""Serviços de aplicação do domínio Mesa Avaliadora.

Neste passo a implementação é leve e focada em organizar contratos.
As rotas continuam no domínio de chat para manter compatibilidade.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.domains.mesa.contracts import EventoMesa, NotificacaoMesa


def agora_utc() -> datetime:
    return datetime.now(timezone.utc)


def criar_notificacao(
    *,
    evento: EventoMesa,
    laudo_id: int,
    origem: str,
    resumo: str,
) -> NotificacaoMesa:
    return NotificacaoMesa(
        evento=evento,
        laudo_id=laudo_id,
        origem=origem,
        resumo=resumo,
    )
