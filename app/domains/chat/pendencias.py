"""Façade de rotas de pendências de revisão (mesa)."""

from app.domains.chat.routes import (
    atualizar_pendencia_laudo,
    exportar_pendencias_laudo_pdf,
    marcar_pendencias_laudo_como_lidas,
    obter_pendencias_laudo,
)

listar_pendencias_laudo = obter_pendencias_laudo
marcar_pendencias_como_lidas = marcar_pendencias_laudo_como_lidas
exportar_pendencias_pdf = exportar_pendencias_laudo_pdf

__all__ = [
    "obter_pendencias_laudo",
    "listar_pendencias_laudo",
    "marcar_pendencias_laudo_como_lidas",
    "marcar_pendencias_como_lidas",
    "atualizar_pendencia_laudo",
    "exportar_pendencias_laudo_pdf",
    "exportar_pendencias_pdf",
]
