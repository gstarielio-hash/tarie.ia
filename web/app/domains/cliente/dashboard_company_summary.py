"""Resumo agregado da empresa para o portal admin-cliente."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.admin.services import filtro_usuarios_gerenciaveis_cliente
from app.domains.chat.limits_helpers import contar_laudos_mes
from app.domains.cliente.dashboard_operational_health import resumo_saude_empresa_cliente
from app.domains.cliente.dashboard_plan_analytics import (
    avaliar_capacidade_empresa,
    avisos_operacionais_empresa,
    catalogo_planos_cliente,
)
from app.shared.database import Laudo, NivelAcesso, PlanoEmpresa, Usuario
from app.shared.tenant_access import obter_empresa_usuario


def resumo_empresa_cliente(banco: Session, usuario: Usuario) -> dict[str, Any]:
    empresa = obter_empresa_usuario(banco, usuario)
    limites = empresa.obter_limites(banco)
    plano_atual = str(empresa.plano_ativo or "")
    total_usuarios = (
        banco.scalar(
            select(func.count(Usuario.id)).where(
                Usuario.empresa_id == empresa.id,
                filtro_usuarios_gerenciaveis_cliente(),
            )
        )
        or 0
    )
    total_laudos = banco.scalar(select(func.count(Laudo.id)).where(Laudo.empresa_id == empresa.id)) or 0
    laudos_mes_atual = contar_laudos_mes(banco, int(empresa.id))
    admins_cliente = (
        banco.scalar(
            select(func.count(Usuario.id)).where(
                Usuario.empresa_id == empresa.id,
                Usuario.nivel_acesso == int(NivelAcesso.ADMIN_CLIENTE),
            )
        )
        or 0
    )
    inspetores = (
        banco.scalar(
            select(func.count(Usuario.id)).where(
                Usuario.empresa_id == empresa.id,
                Usuario.nivel_acesso == int(NivelAcesso.INSPETOR),
            )
        )
        or 0
    )
    revisores = (
        banco.scalar(
            select(func.count(Usuario.id)).where(
                Usuario.empresa_id == empresa.id,
                Usuario.nivel_acesso == int(NivelAcesso.REVISOR),
            )
        )
        or 0
    )
    capacidade = avaliar_capacidade_empresa(
        plano_atual=plano_atual,
        total_usuarios=int(total_usuarios),
        usuarios_limite=limites.usuarios_max,
        laudos_mes_atual=int(laudos_mes_atual),
        laudos_limite=limites.laudos_mes,
    )
    planos_catalogo = catalogo_planos_cliente(banco, plano_atual)
    avisos_operacionais = avisos_operacionais_empresa(
        empresa=empresa,
        usuarios_restantes=capacidade["usuarios_restantes"],
        usuarios_excedente=int(capacidade["usuarios_excedente"]),
        usuarios_max=limites.usuarios_max,
        laudos_restantes=capacidade["laudos_restantes"],
        laudos_excedente=int(capacidade["laudos_excedente"]),
        laudos_mes_limite=limites.laudos_mes,
        laudos_mes_atual=int(laudos_mes_atual),
        plano_sugerido=capacidade["plano_sugerido"],
    )
    saude_operacional = resumo_saude_empresa_cliente(
        banco,
        empresa=empresa,
        usuarios_total=int(total_usuarios),
        admins_cliente=int(admins_cliente),
        inspetores=int(inspetores),
        revisores=int(revisores),
        capacidade_status=str(capacidade["capacidade_status"]),
        capacidade_tone=str(capacidade["capacidade_tone"]),
        laudos_mes_atual=int(laudos_mes_atual),
    )

    return {
        "id": int(empresa.id),
        "nome_fantasia": str(empresa.nome_fantasia or ""),
        "cnpj": str(empresa.cnpj or ""),
        "plano_ativo": plano_atual,
        "planos_disponiveis": [item.value for item in PlanoEmpresa],
        "planos_catalogo": planos_catalogo,
        "segmento": str(empresa.segmento or ""),
        "cidade_estado": str(empresa.cidade_estado or ""),
        "nome_responsavel": str(empresa.nome_responsavel or ""),
        "observacoes": str(empresa.observacoes or ""),
        "status_bloqueio": bool(empresa.status_bloqueio),
        "laudos_mes_limite": limites.laudos_mes,
        "usuarios_max": limites.usuarios_max,
        "upload_doc": bool(limites.upload_doc),
        "deep_research": bool(limites.deep_research),
        "mensagens_processadas": int(empresa.mensagens_processadas or 0),
        "laudos_mes_atual": int(laudos_mes_atual),
        "laudos_restantes": capacidade["laudos_restantes"],
        "laudos_excedente": int(capacidade["laudos_excedente"]),
        "laudos_percentual": capacidade["laudos_percentual"],
        "usuarios_em_uso": int(total_usuarios),
        "usuarios_restantes": capacidade["usuarios_restantes"],
        "usuarios_excedente": int(capacidade["usuarios_excedente"]),
        "usuarios_percentual": capacidade["usuarios_percentual"],
        "uso_percentual": capacidade["capacidade_percentual"],
        "capacidade_status": capacidade["capacidade_status"],
        "capacidade_tone": capacidade["capacidade_tone"],
        "capacidade_badge": capacidade["capacidade_badge"],
        "capacidade_acao": capacidade["capacidade_acao"],
        "capacidade_gargalo": capacidade["capacidade_gargalo"],
        "plano_sugerido": capacidade["plano_sugerido"],
        "plano_sugerido_motivo": capacidade["plano_sugerido_motivo"],
        "avisos_operacionais": avisos_operacionais,
        "saude_operacional": saude_operacional,
        "total_usuarios": int(total_usuarios),
        "total_laudos": int(total_laudos),
        "admins_cliente": int(admins_cliente),
        "inspetores": int(inspetores),
        "revisores": int(revisores),
    }


__all__ = [
    "resumo_empresa_cliente",
]
