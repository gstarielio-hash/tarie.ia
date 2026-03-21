"""base recomendada fixa para templates de laudo

Revision ID: fc2a6b9d4e11
Revises: fa3b1c7d9e21
Create Date: 2026-03-19 18:35:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "fc2a6b9d4e11"
down_revision = "fa3b1c7d9e21"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspetor = sa.inspect(bind)
    colunas = {coluna["name"]: coluna for coluna in inspetor.get_columns("templates_laudo")}

    if "base_recomendada_fixa" not in colunas:
        with op.batch_alter_table("templates_laudo") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "base_recomendada_fixa",
                    sa.Boolean(),
                    nullable=True,
                    server_default=sa.false(),
                ),
            )

    coluna_base = colunas.get("base_recomendada_fixa")
    tipo_base = coluna_base.get("type") if coluna_base else None
    valor_falso = "false"
    if tipo_base is not None and not isinstance(tipo_base, sa.Boolean):
        valor_falso = "0"

    op.execute(
        sa.text(
            f"""
            UPDATE templates_laudo
               SET base_recomendada_fixa = {valor_falso}
             WHERE base_recomendada_fixa IS NULL
            """
        )
    )

    inspetor = sa.inspect(bind)
    colunas = {coluna["name"]: coluna for coluna in inspetor.get_columns("templates_laudo")}
    coluna_base = colunas.get("base_recomendada_fixa")
    precisa_not_null = bool(coluna_base and coluna_base.get("nullable", True))
    precisa_limpar_default = bool(coluna_base and coluna_base.get("default") is not None)

    if precisa_not_null or precisa_limpar_default:
        with op.batch_alter_table("templates_laudo") as batch_op:
            batch_op.alter_column(
                "base_recomendada_fixa",
                existing_type=sa.Boolean(),
                nullable=False,
                server_default=None,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspetor = sa.inspect(bind)
    colunas = {coluna["name"] for coluna in inspetor.get_columns("templates_laudo")}

    if "base_recomendada_fixa" not in colunas:
        return

    with op.batch_alter_table("templates_laudo") as batch_op:
        batch_op.drop_column("base_recomendada_fixa")
