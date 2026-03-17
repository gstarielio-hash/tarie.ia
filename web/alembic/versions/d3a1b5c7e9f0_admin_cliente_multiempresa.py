"""Adiciona o papel ADMIN_CLIENTE e migra diretorias de clientes.

Revision ID: d3a1b5c7e9f0
Revises: c7d1a2e9f4b8
Create Date: 2026-03-12 10:45:00.000000
"""

from __future__ import annotations

import os

from alembic import op
import sqlalchemy as sa


revision = "d3a1b5c7e9f0"
down_revision = "c7d1a2e9f4b8"
branch_labels = None
depends_on = None

_NIVEL_INSPETOR = 1
_NIVEL_REVISOR = 50
_NIVEL_ADMIN_CLIENTE = 80
_NIVEL_DIRETORIA = 99


def _emails_diretoria_central() -> list[str]:
    bruto = os.getenv("EMAILS_DIRETORIA_CENTRAL", "admin@tariel.ia")
    return [item.strip().lower() for item in bruto.split(",") if item.strip()]


def upgrade() -> None:
    with op.batch_alter_table("usuarios", schema=None) as batch_op:
        batch_op.drop_constraint("ck_usuario_nivel_acesso_valido", type_="check")
        batch_op.create_check_constraint(
            "ck_usuario_nivel_acesso_valido",
            (
                "nivel_acesso IN "
                f"({_NIVEL_INSPETOR}, {_NIVEL_REVISOR}, {_NIVEL_ADMIN_CLIENTE}, {_NIVEL_DIRETORIA})"
            ),
        )

    bind = op.get_bind()
    emails_centro = _emails_diretoria_central()

    if emails_centro:
        placeholders = ", ".join(f":email_{indice}" for indice, _ in enumerate(emails_centro))
        params = {f"email_{indice}": email for indice, email in enumerate(emails_centro)}
        params["nivel_diretoria"] = _NIVEL_DIRETORIA
        params["nivel_admin_cliente"] = _NIVEL_ADMIN_CLIENTE
        bind.execute(
            sa.text(
                f"""
                UPDATE usuarios
                   SET nivel_acesso = :nivel_admin_cliente
                 WHERE nivel_acesso = :nivel_diretoria
                   AND empresa_id IN (
                        SELECT id
                          FROM empresas
                         WHERE cnpj <> '00000000000000'
                   )
                   AND lower(email) NOT IN ({placeholders})
                """
            ),
            params,
        )
    else:
        bind.execute(
            sa.text(
                """
                UPDATE usuarios
                   SET nivel_acesso = :nivel_admin_cliente
                 WHERE nivel_acesso = :nivel_diretoria
                   AND empresa_id IN (
                        SELECT id
                          FROM empresas
                         WHERE cnpj <> '00000000000000'
                   )
                """
            ),
            {
                "nivel_diretoria": _NIVEL_DIRETORIA,
                "nivel_admin_cliente": _NIVEL_ADMIN_CLIENTE,
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            """
            UPDATE usuarios
               SET nivel_acesso = :nivel_diretoria
             WHERE nivel_acesso = :nivel_admin_cliente
            """
        ),
        {
            "nivel_diretoria": _NIVEL_DIRETORIA,
            "nivel_admin_cliente": _NIVEL_ADMIN_CLIENTE,
        },
    )

    with op.batch_alter_table("usuarios", schema=None) as batch_op:
        batch_op.drop_constraint("ck_usuario_nivel_acesso_valido", type_="check")
        batch_op.create_check_constraint(
            "ck_usuario_nivel_acesso_valido",
            f"nivel_acesso IN ({_NIVEL_INSPETOR}, {_NIVEL_REVISOR}, {_NIVEL_DIRETORIA})",
        )
