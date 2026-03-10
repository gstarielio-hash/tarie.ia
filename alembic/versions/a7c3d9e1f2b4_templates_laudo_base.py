"""templates_laudo_base

Revision ID: a7c3d9e1f2b4
Revises: 99586a8d3d96
Create Date: 2026-03-09 15:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7c3d9e1f2b4"
down_revision: Union[str, Sequence[str], None] = "99586a8d3d96"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "templates_laudo",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("criado_por_id", sa.Integer(), nullable=True),
        sa.Column("nome", sa.String(length=180), nullable=False),
        sa.Column("codigo_template", sa.String(length=80), nullable=False),
        sa.Column("versao", sa.Integer(), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False),
        sa.Column("arquivo_pdf_base", sa.String(length=500), nullable=False),
        sa.Column("mapeamento_campos_json", sa.JSON(), nullable=True),
        sa.Column("estilo_json", sa.JSON(), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, comment="Timestamp UTC de criação"),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True, comment="Timestamp UTC da última atualização"),
        sa.CheckConstraint("versao >= 1", name="ck_template_laudo_versao_positiva"),
        sa.ForeignKeyConstraint(["criado_por_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "empresa_id",
            "codigo_template",
            "versao",
            name="uq_template_laudo_empresa_codigo_versao",
        ),
    )

    with op.batch_alter_table("templates_laudo", schema=None) as batch_op:
        batch_op.create_index("ix_template_laudo_empresa_codigo", ["empresa_id", "codigo_template"], unique=False)
        batch_op.create_index("ix_template_laudo_empresa_ativo", ["empresa_id", "ativo"], unique=False)
        batch_op.create_index(batch_op.f("ix_templates_laudo_id"), ["id"], unique=False)
        batch_op.create_index(batch_op.f("ix_templates_laudo_empresa_id"), ["empresa_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_templates_laudo_criado_por_id"), ["criado_por_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("templates_laudo", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_templates_laudo_criado_por_id"))
        batch_op.drop_index(batch_op.f("ix_templates_laudo_empresa_id"))
        batch_op.drop_index(batch_op.f("ix_templates_laudo_id"))
        batch_op.drop_index("ix_template_laudo_empresa_ativo")
        batch_op.drop_index("ix_template_laudo_empresa_codigo")

    op.drop_table("templates_laudo")
