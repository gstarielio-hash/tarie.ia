"""preferencias mobile do usuario inspetor

Revision ID: f4c8d2e7a9b1
Revises: e1f2a3b4c5d6
Create Date: 2026-03-18 08:35:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f4c8d2e7a9b1"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "preferencias_mobile_usuarios",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("notificacoes_json", sa.JSON(), nullable=False),
        sa.Column("privacidade_json", sa.JSON(), nullable=False),
        sa.Column("permissoes_json", sa.JSON(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuarios.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("usuario_id", name="uq_preferencias_mobile_usuario"),
    )
    op.create_index("ix_preferencias_mobile_usuario", "preferencias_mobile_usuarios", ["usuario_id"], unique=False)
    op.create_index(op.f("ix_preferencias_mobile_usuarios_id"), "preferencias_mobile_usuarios", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_preferencias_mobile_usuarios_id"), table_name="preferencias_mobile_usuarios")
    op.drop_index("ix_preferencias_mobile_usuario", table_name="preferencias_mobile_usuarios")
    op.drop_table("preferencias_mobile_usuarios")
