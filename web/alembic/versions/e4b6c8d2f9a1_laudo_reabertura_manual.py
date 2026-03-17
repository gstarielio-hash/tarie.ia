"""Adiciona metadados de encerramento e reabertura do laudo.

Revision ID: e4b6c8d2f9a1
Revises: c2e4f9a7d1b3
Create Date: 2026-03-11 14:20:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "e4b6c8d2f9a1"
down_revision = "c2e4f9a7d1b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("laudos", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("encerrado_pelo_inspetor_em", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(
            sa.Column("reabertura_pendente_em", sa.DateTime(timezone=True), nullable=True)
        )
        batch_op.add_column(sa.Column("reaberto_em", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("laudos", schema=None) as batch_op:
        batch_op.drop_column("reaberto_em")
        batch_op.drop_column("reabertura_pendente_em")
        batch_op.drop_column("encerrado_pelo_inspetor_em")
