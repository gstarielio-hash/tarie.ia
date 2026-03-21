"""Serializacao e bootstrap do portal admin-cliente."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domains.admin.services import filtro_usuarios_gerenciaveis_cliente
from app.domains.chat.laudo_state_helpers import serializar_card_laudo
from app.domains.chat.normalization import TIPOS_TEMPLATE_VALIDOS
from app.domains.cliente.auditoria import listar_auditoria_empresa, serializar_registro_auditoria
from app.domains.cliente.dashboard_analytics import resumo_empresa_cliente
from app.shared.database import Laudo, MensagemLaudo, NivelAcesso, TipoMensagem, Usuario

ROLE_LABELS = {
    int(NivelAcesso.INSPETOR): "Inspetor",
    int(NivelAcesso.REVISOR): "Mesa Avaliadora",
    int(NivelAcesso.ADMIN_CLIENTE): "Admin-Cliente",
    int(NivelAcesso.DIRETORIA): "Admin-CEO",
}


def _usuario_nome(usuario: Usuario) -> str:
    return getattr(usuario, "nome", None) or getattr(usuario, "nome_completo", None) or f"Cliente #{usuario.id}"


def serializar_usuario_cliente(usuario: Usuario) -> dict[str, Any]:
    nivel = int(usuario.nivel_acesso or 0)
    return {
        "id": int(usuario.id),
        "nome": _usuario_nome(usuario),
        "email": str(usuario.email or ""),
        "telefone": str(usuario.telefone or ""),
        "crea": str(usuario.crea or ""),
        "nivel_acesso": nivel,
        "papel": ROLE_LABELS.get(nivel, f"Nível {nivel}"),
        "ativo": bool(usuario.ativo),
        "senha_temporaria_ativa": bool(getattr(usuario, "senha_temporaria_ativa", False)),
        "ultimo_login": usuario.ultimo_login.isoformat() if getattr(usuario, "ultimo_login", None) else "",
        "ultimo_login_label": (usuario.ultimo_login.astimezone().strftime("%d/%m/%Y %H:%M") if getattr(usuario, "ultimo_login", None) else "Nunca"),
    }


def _mapa_contagem_por_laudo(
    banco: Session,
    *,
    laudo_ids: list[int],
    tipo: str,
    apenas_nao_lidas: bool = False,
) -> dict[int, int]:
    ids_validos = [int(item) for item in laudo_ids if int(item or 0) > 0]
    if not ids_validos:
        return {}

    consulta = select(MensagemLaudo.laudo_id, func.count(MensagemLaudo.id)).where(
        MensagemLaudo.laudo_id.in_(ids_validos),
        MensagemLaudo.tipo == tipo,
    )
    if apenas_nao_lidas:
        consulta = consulta.where(MensagemLaudo.lida.is_(False))

    resultado = banco.execute(consulta.group_by(MensagemLaudo.laudo_id)).all()
    return {int(laudo_id): int(total) for laudo_id, total in resultado}


def _serializar_laudo_chat(banco: Session, laudo: Laudo) -> dict[str, Any]:
    payload = serializar_card_laudo(banco, laudo)
    payload.update(
        {
            "usuario_id": int(laudo.usuario_id) if laudo.usuario_id else None,
            "atualizado_em": laudo.atualizado_em.isoformat() if laudo.atualizado_em else "",
            "tipo_template_label": TIPOS_TEMPLATE_VALIDOS.get(str(laudo.tipo_template or "padrao"), "Inspeção"),
        }
    )
    return payload


def _serializar_laudo_mesa(
    banco: Session,
    laudo: Laudo,
    *,
    pendencias_abertas: int,
    whispers_nao_lidos: int,
) -> dict[str, Any]:
    payload = serializar_card_laudo(banco, laudo)
    payload.update(
        {
            "pendencias_abertas": int(pendencias_abertas),
            "whispers_nao_lidos": int(whispers_nao_lidos),
            "usuario_id": int(laudo.usuario_id) if laudo.usuario_id else None,
            "revisado_por": int(laudo.revisado_por) if laudo.revisado_por else None,
            "atualizado_em": laudo.atualizado_em.isoformat() if laudo.atualizado_em else "",
        }
    )
    return payload


def listar_laudos_chat_usuario(banco: Session, usuario: Usuario) -> list[dict[str, Any]]:
    laudos = list(
        banco.scalars(
            select(Laudo)
            .where(
                Laudo.empresa_id == usuario.empresa_id,
            )
            .order_by(func.coalesce(Laudo.atualizado_em, Laudo.criado_em).desc(), Laudo.id.desc())
            .limit(40)
        ).all()
    )
    return [_serializar_laudo_chat(banco, laudo) for laudo in laudos]


def listar_laudos_mesa_empresa(banco: Session, usuario: Usuario) -> list[dict[str, Any]]:
    laudos = list(
        banco.scalars(
            select(Laudo)
            .where(Laudo.empresa_id == usuario.empresa_id)
            .order_by(func.coalesce(Laudo.atualizado_em, Laudo.criado_em).desc(), Laudo.id.desc())
            .limit(60)
        ).all()
    )
    laudo_ids = [int(laudo.id) for laudo in laudos]
    pendencias_abertas = _mapa_contagem_por_laudo(
        banco,
        laudo_ids=laudo_ids,
        tipo=TipoMensagem.HUMANO_ENG.value,
        apenas_nao_lidas=True,
    )
    whispers_nao_lidos = _mapa_contagem_por_laudo(
        banco,
        laudo_ids=laudo_ids,
        tipo=TipoMensagem.HUMANO_INSP.value,
        apenas_nao_lidas=True,
    )
    return [
        _serializar_laudo_mesa(
            banco,
            laudo,
            pendencias_abertas=pendencias_abertas.get(int(laudo.id), 0),
            whispers_nao_lidos=whispers_nao_lidos.get(int(laudo.id), 0),
        )
        for laudo in laudos
    ]


def bootstrap_cliente(banco: Session, usuario: Usuario) -> dict[str, Any]:
    usuarios = list(
        banco.scalars(
            select(Usuario)
            .where(
                Usuario.empresa_id == usuario.empresa_id,
                filtro_usuarios_gerenciaveis_cliente(),
            )
            .order_by(Usuario.nivel_acesso.desc(), Usuario.nome_completo.asc())
        ).all()
    )
    return {
        "empresa": resumo_empresa_cliente(banco, usuario),
        "usuarios": [serializar_usuario_cliente(item) for item in usuarios],
        "chat": {
            "tipos_template": TIPOS_TEMPLATE_VALIDOS,
            "laudos": listar_laudos_chat_usuario(banco, usuario),
        },
        "mesa": {
            "laudos": listar_laudos_mesa_empresa(banco, usuario),
        },
        "auditoria": {"itens": [serializar_registro_auditoria(item) for item in listar_auditoria_empresa(banco, empresa_id=int(usuario.empresa_id))]},
    }


__all__ = [
    "ROLE_LABELS",
    "bootstrap_cliente",
    "listar_laudos_chat_usuario",
    "listar_laudos_mesa_empresa",
    "serializar_usuario_cliente",
]
