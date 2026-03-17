"""mesa_anexos_dedicados

Revision ID: b4d2e8f6a1c3
Revises: f1a9e2c4b7d1
Create Date: 2026-03-11 20:10:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b4d2e8f6a1c3"
down_revision: Union[str, Sequence[str], None] = "f1a9e2c4b7d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "anexos_mesa",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("laudo_id", sa.Integer(), nullable=False),
        sa.Column("mensagem_id", sa.Integer(), nullable=False),
        sa.Column("enviado_por_id", sa.Integer(), nullable=True),
        sa.Column("nome_original", sa.String(length=160), nullable=False),
        sa.Column("nome_arquivo", sa.String(length=220), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("categoria", sa.String(length=20), nullable=False),
        sa.Column("tamanho_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("caminho_arquivo", sa.String(length=600), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("categoria IN ('imagem', 'documento')", name="ck_anexo_mesa_categoria_valida"),
        sa.CheckConstraint("tamanho_bytes >= 0", name="ck_anexo_mesa_tamanho_nao_negativo"),
        sa.ForeignKeyConstraint(["enviado_por_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["laudo_id"], ["laudos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["mensagem_id"], ["mensagens_laudo.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_anexo_mesa_enviado_por", "anexos_mesa", ["enviado_por_id"], unique=False)
    op.create_index("ix_anexo_mesa_laudo_criado", "anexos_mesa", ["laudo_id", "criado_em"], unique=False)
    op.create_index("ix_anexo_mesa_mensagem", "anexos_mesa", ["mensagem_id"], unique=False)
    op.create_index(op.f("ix_anexos_mesa_id"), "anexos_mesa", ["id"], unique=False)
    op.create_index(op.f("ix_anexos_mesa_laudo_id"), "anexos_mesa", ["laudo_id"], unique=False)
    op.create_index(op.f("ix_anexos_mesa_mensagem_id"), "anexos_mesa", ["mensagem_id"], unique=False)

    with op.batch_alter_table("anexos_mesa", schema=None) as batch_op:
        batch_op.alter_column("tamanho_bytes", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_anexos_mesa_mensagem_id"), table_name="anexos_mesa")
    op.drop_index(op.f("ix_anexos_mesa_laudo_id"), table_name="anexos_mesa")
    op.drop_index(op.f("ix_anexos_mesa_id"), table_name="anexos_mesa")
    op.drop_index("ix_anexo_mesa_mensagem", table_name="anexos_mesa")
    op.drop_index("ix_anexo_mesa_laudo_criado", table_name="anexos_mesa")
    op.drop_index("ix_anexo_mesa_enviado_por", table_name="anexos_mesa")
    op.drop_table("anexos_mesa")
