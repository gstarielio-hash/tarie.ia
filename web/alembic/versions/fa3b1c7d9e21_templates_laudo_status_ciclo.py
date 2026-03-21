"""status de ciclo dos templates de laudo

Revision ID: fa3b1c7d9e21
Revises: f9c4e2a7b6d1
Create Date: 2026-03-19 17:05:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "fa3b1c7d9e21"
down_revision = "f9c4e2a7b6d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspetor = sa.inspect(bind)
    colunas = {coluna["name"]: coluna for coluna in inspetor.get_columns("templates_laudo")}

    if "status_template" not in colunas:
        with op.batch_alter_table("templates_laudo") as batch_op:
            batch_op.add_column(
                sa.Column(
                    "status_template",
                    sa.String(length=20),
                    nullable=True,
                    server_default="rascunho",
                ),
            )

    coluna_ativo = colunas.get("ativo")
    tipo_ativo = coluna_ativo.get("type") if coluna_ativo else None
    condicao_ativo = "ativo IS TRUE"
    if tipo_ativo is not None and not isinstance(tipo_ativo, sa.Boolean):
        condicao_ativo = "ativo = 1"

    op.execute(
        sa.text(
            f"""
            UPDATE templates_laudo
               SET status_template = CASE
                   WHEN {condicao_ativo} THEN 'ativo'
                   ELSE 'rascunho'
               END
            """
        )
    )

    inspetor = sa.inspect(bind)
    colunas = {coluna["name"]: coluna for coluna in inspetor.get_columns("templates_laudo")}
    checks = {check.get("name") for check in inspetor.get_check_constraints("templates_laudo")}
    coluna_status = colunas.get("status_template")
    precisa_constraint = "ck_template_laudo_status_template" not in checks
    precisa_not_null = bool(coluna_status and coluna_status.get("nullable", True))
    precisa_limpar_default = bool(coluna_status and coluna_status.get("default") is not None)

    if precisa_constraint or precisa_not_null or precisa_limpar_default:
        with op.batch_alter_table("templates_laudo") as batch_op:
            batch_op.alter_column(
                "status_template",
                existing_type=sa.String(length=20),
                nullable=False,
                server_default=None,
            )
            if precisa_constraint:
                batch_op.create_check_constraint(
                    "ck_template_laudo_status_template",
                    "status_template IN ('rascunho', 'em_teste', 'ativo', 'legado', 'arquivado')",
                )


def downgrade() -> None:
    bind = op.get_bind()
    inspetor = sa.inspect(bind)
    colunas = {coluna["name"] for coluna in inspetor.get_columns("templates_laudo")}
    checks = {check.get("name") for check in inspetor.get_check_constraints("templates_laudo")}

    if "status_template" not in colunas:
        return

    with op.batch_alter_table("templates_laudo") as batch_op:
        if "ck_template_laudo_status_template" in checks:
            batch_op.drop_constraint("ck_template_laudo_status_template", type_="check")
        batch_op.drop_column("status_template")
