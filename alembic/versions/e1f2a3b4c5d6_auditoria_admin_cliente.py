"""auditoria admin-cliente

Revision ID: e1f2a3b4c5d6
Revises: d3a1b5c7e9f0
Create Date: 2026-03-12 10:15:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "e1f2a3b4c5d6"
down_revision = "d3a1b5c7e9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auditoria_empresas",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("ator_usuario_id", sa.Integer(), nullable=True),
        sa.Column("alvo_usuario_id", sa.Integer(), nullable=True),
        sa.Column("portal", sa.String(length=30), nullable=False, server_default="cliente"),
        sa.Column("acao", sa.String(length=80), nullable=False),
        sa.Column("resumo", sa.String(length=220), nullable=False),
        sa.Column("detalhe", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.JSON(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["alvo_usuario_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["ator_usuario_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auditoria_empresa_criada", "auditoria_empresas", ["empresa_id", "criado_em"], unique=False)
    op.create_index("ix_auditoria_empresa_portal", "auditoria_empresas", ["empresa_id", "portal"], unique=False)
    op.create_index("ix_auditoria_ator_criada", "auditoria_empresas", ["ator_usuario_id", "criado_em"], unique=False)
    op.create_index(op.f("ix_auditoria_empresas_alvo_usuario_id"), "auditoria_empresas", ["alvo_usuario_id"], unique=False)
    op.create_index(op.f("ix_auditoria_empresas_ator_usuario_id"), "auditoria_empresas", ["ator_usuario_id"], unique=False)
    op.create_index(op.f("ix_auditoria_empresas_empresa_id"), "auditoria_empresas", ["empresa_id"], unique=False)
    op.create_index(op.f("ix_auditoria_empresas_id"), "auditoria_empresas", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_auditoria_empresas_id"), table_name="auditoria_empresas")
    op.drop_index(op.f("ix_auditoria_empresas_empresa_id"), table_name="auditoria_empresas")
    op.drop_index(op.f("ix_auditoria_empresas_ator_usuario_id"), table_name="auditoria_empresas")
    op.drop_index(op.f("ix_auditoria_empresas_alvo_usuario_id"), table_name="auditoria_empresas")
    op.drop_index("ix_auditoria_ator_criada", table_name="auditoria_empresas")
    op.drop_index("ix_auditoria_empresa_portal", table_name="auditoria_empresas")
    op.drop_index("ix_auditoria_empresa_criada", table_name="auditoria_empresas")
    op.drop_table("auditoria_empresas")
