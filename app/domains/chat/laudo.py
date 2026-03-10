"""Façade de rotas de ciclo de laudo (inspetor)."""

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

__all__ = [
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
