"""Rotas de pendências de revisão (mesa)."""

from fastapi.routing import APIRouter

from app.domains.chat.routes import (
    atualizar_pendencia_laudo,
    exportar_pendencias_laudo_pdf,
    marcar_pendencias_laudo_como_lidas,
    obter_pendencias_laudo,
)

listar_pendencias_laudo = obter_pendencias_laudo
marcar_pendencias_como_lidas = marcar_pendencias_laudo_como_lidas
exportar_pendencias_pdf = exportar_pendencias_laudo_pdf

roteador_pendencias = APIRouter()

roteador_pendencias.add_api_route(
    "/api/laudo/{laudo_id}/pendencias",
    obter_pendencias_laudo,
    methods=["GET"],
)
roteador_pendencias.add_api_route(
    "/api/laudo/{laudo_id}/pendencias/marcar-lidas",
    marcar_pendencias_laudo_como_lidas,
    methods=["POST"],
)
roteador_pendencias.add_api_route(
    "/api/laudo/{laudo_id}/pendencias/{mensagem_id}",
    atualizar_pendencia_laudo,
    methods=["PATCH"],
)
roteador_pendencias.add_api_route(
    "/api/laudo/{laudo_id}/pendencias/exportar-pdf",
    exportar_pendencias_laudo_pdf,
    methods=["GET"],
)

__all__ = [
    "roteador_pendencias",
    "obter_pendencias_laudo",
    "listar_pendencias_laudo",
    "marcar_pendencias_laudo_como_lidas",
    "marcar_pendencias_como_lidas",
    "atualizar_pendencia_laudo",
    "exportar_pendencias_laudo_pdf",
    "exportar_pendencias_pdf",
]
