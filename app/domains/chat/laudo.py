"""Rotas de ciclo de laudo (inspetor)."""

from fastapi.routing import APIRouter

from app.domains.chat.routes import (
    api_cancelar_relatorio,
    api_desativar_relatorio_ativo,
    api_finalizar_relatorio,
    api_obter_gate_qualidade_laudo,
    api_iniciar_relatorio,
    api_status_relatorio,
    listar_revisoes_laudo,
    obter_diff_revisoes_laudo,
    pagina_inicial,
    pagina_planos,
    rota_deletar_laudo,
    rota_pin_laudo,
)

pinar_laudo = rota_pin_laudo
excluir_laudo = rota_deletar_laudo
api_gate_qualidade_laudo = api_obter_gate_qualidade_laudo

roteador_laudo = APIRouter()

roteador_laudo.add_api_route(
    "/api/laudo/status",
    api_status_relatorio,
    methods=["GET"],
)
roteador_laudo.add_api_route(
    "/api/laudo/iniciar",
    api_iniciar_relatorio,
    methods=["POST"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/finalizar",
    api_finalizar_relatorio,
    methods=["POST"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/gate-qualidade",
    api_obter_gate_qualidade_laudo,
    methods=["GET"],
)
roteador_laudo.add_api_route(
    "/api/laudo/cancelar",
    api_cancelar_relatorio,
    methods=["POST"],
)
roteador_laudo.add_api_route(
    "/api/laudo/desativar",
    api_desativar_relatorio_ativo,
    methods=["POST"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/revisoes",
    listar_revisoes_laudo,
    methods=["GET"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/revisoes/diff",
    obter_diff_revisoes_laudo,
    methods=["GET"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}/pin",
    rota_pin_laudo,
    methods=["PATCH"],
)
roteador_laudo.add_api_route(
    "/api/laudo/{laudo_id}",
    rota_deletar_laudo,
    methods=["DELETE"],
)

__all__ = [
    "roteador_laudo",
    "api_status_relatorio",
    "api_iniciar_relatorio",
    "api_finalizar_relatorio",
    "api_obter_gate_qualidade_laudo",
    "api_gate_qualidade_laudo",
    "api_cancelar_relatorio",
    "api_desativar_relatorio_ativo",
    "listar_revisoes_laudo",
    "obter_diff_revisoes_laudo",
    "pinar_laudo",
    "excluir_laudo",
    "pagina_inicial",
    "pagina_planos",
]
