"""Adiciona campos de perfil do usuário do chat.

Revision ID: c2e4f9a7d1b3
Revises: f1a9e2c4b7d1
Create Date: 2026-03-11 11:35:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c2e4f9a7d1b3"
down_revision = "f1a9e2c4b7d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("usuarios", schema=None) as batch_op:
        batch_op.add_column(sa.Column("telefone", sa.String(length=30), nullable=True))
        batch_op.add_column(sa.Column("foto_perfil_url", sa.String(length=512), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("usuarios", schema=None) as batch_op:
        batch_op.drop_column("foto_perfil_url")
        batch_op.drop_column("telefone")
