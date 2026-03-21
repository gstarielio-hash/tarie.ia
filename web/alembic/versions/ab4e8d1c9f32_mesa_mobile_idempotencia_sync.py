"""idempotencia mobile da mesa avaliadora

Revision ID: ab4e8d1c9f32
Revises: fc2a6b9d4e11
Create Date: 2026-03-21 13:20:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "ab4e8d1c9f32"
down_revision = "fc2a6b9d4e11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspetor = sa.inspect(bind)
    colunas = {coluna["name"] for coluna in inspetor.get_columns("mensagens_laudo")}
    indices = {indice["name"] for indice in inspetor.get_indexes("mensagens_laudo")}
    constraints = {
        constraint["name"]
        for constraint in inspetor.get_unique_constraints("mensagens_laudo")
    }

    with op.batch_alter_table("mensagens_laudo") as batch_op:
        if "client_message_id" not in colunas:
            batch_op.add_column(
                sa.Column("client_message_id", sa.String(length=64), nullable=True),
            )
        if "ix_mensagem_laudo_client_message" not in indices:
            batch_op.create_index(
                "ix_mensagem_laudo_client_message",
                ["laudo_id", "client_message_id"],
                unique=False,
            )
        if "uq_mensagem_laudo_cliente_idempotencia" not in constraints:
            batch_op.create_unique_constraint(
                "uq_mensagem_laudo_cliente_idempotencia",
                ["laudo_id", "remetente_id", "client_message_id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspetor = sa.inspect(bind)
    colunas = {coluna["name"] for coluna in inspetor.get_columns("mensagens_laudo")}
    indices = {indice["name"] for indice in inspetor.get_indexes("mensagens_laudo")}
    constraints = {
        constraint["name"]
        for constraint in inspetor.get_unique_constraints("mensagens_laudo")
    }

    with op.batch_alter_table("mensagens_laudo") as batch_op:
        if "uq_mensagem_laudo_cliente_idempotencia" in constraints:
            batch_op.drop_constraint(
                "uq_mensagem_laudo_cliente_idempotencia",
                type_="unique",
            )
        if "ix_mensagem_laudo_client_message" in indices:
            batch_op.drop_index("ix_mensagem_laudo_client_message")
        if "client_message_id" in colunas:
            batch_op.drop_column("client_message_id")
