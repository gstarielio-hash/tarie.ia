"""aprendizados visuais supervisionados de ia

Revision ID: f9c4e2a7b6d1
Revises: f7a1c9d3b6e2
Create Date: 2026-03-19 15:10:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f9c4e2a7b6d1"
down_revision: Union[str, Sequence[str], None] = "f7a1c9d3b6e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "aprendizados_visuais_ia",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("empresa_id", sa.Integer(), nullable=False),
        sa.Column("laudo_id", sa.Integer(), nullable=False),
        sa.Column("mensagem_referencia_id", sa.Integer(), nullable=True),
        sa.Column("criado_por_id", sa.Integer(), nullable=True),
        sa.Column("validado_por_id", sa.Integer(), nullable=True),
        sa.Column("setor_industrial", sa.String(length=100), nullable=False, server_default="geral"),
        sa.Column("resumo", sa.String(length=240), nullable=False),
        sa.Column("descricao_contexto", sa.Text(), nullable=True),
        sa.Column("correcao_inspetor", sa.Text(), nullable=False),
        sa.Column("parecer_mesa", sa.Text(), nullable=True),
        sa.Column("sintese_consolidada", sa.Text(), nullable=True),
        sa.Column("pontos_chave_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("referencias_norma_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("marcacoes_json", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column(
            "status",
            sa.Enum(
                "rascunho_inspetor",
                "validado_mesa",
                "rejeitado_mesa",
                name="statusaprendizadoia",
                native_enum=False,
            ),
            nullable=False,
            server_default="rascunho_inspetor",
        ),
        sa.Column(
            "veredito_inspetor",
            sa.Enum(
                "conforme",
                "nao_conforme",
                "ajuste",
                "duvida",
                name="vereditoaprendizadoia",
                native_enum=False,
            ),
            nullable=False,
            server_default="duvida",
        ),
        sa.Column(
            "veredito_mesa",
            sa.Enum(
                "conforme",
                "nao_conforme",
                "ajuste",
                "duvida",
                name="vereditoaprendizadoia",
                native_enum=False,
            ),
            nullable=True,
        ),
        sa.Column("imagem_url", sa.String(length=600), nullable=True),
        sa.Column("imagem_nome_original", sa.String(length=160), nullable=True),
        sa.Column("imagem_mime_type", sa.String(length=120), nullable=True),
        sa.Column("imagem_sha256", sa.String(length=64), nullable=True),
        sa.Column("caminho_arquivo", sa.String(length=600), nullable=True),
        sa.Column("validado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("atualizado_em", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["criado_por_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["empresa_id"], ["empresas.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["laudo_id"], ["laudos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["mensagem_referencia_id"], ["mensagens_laudo.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["validado_por_id"], ["usuarios.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_aprendizado_visual_empresa_status",
        "aprendizados_visuais_ia",
        ["empresa_id", "status", "validado_em"],
        unique=False,
    )
    op.create_index(
        "ix_aprendizado_visual_laudo_criado",
        "aprendizados_visuais_ia",
        ["laudo_id", "criado_em"],
        unique=False,
    )
    op.create_index(
        "ix_aprendizado_visual_ref_msg",
        "aprendizados_visuais_ia",
        ["mensagem_referencia_id"],
        unique=False,
    )
    op.create_index(
        "ix_aprendizado_visual_setor_status",
        "aprendizados_visuais_ia",
        ["empresa_id", "setor_industrial", "status"],
        unique=False,
    )
    op.create_index("ix_aprendizado_visual_sha", "aprendizados_visuais_ia", ["imagem_sha256"], unique=False)
    op.create_index(op.f("ix_aprendizados_visuais_ia_criado_por_id"), "aprendizados_visuais_ia", ["criado_por_id"], unique=False)
    op.create_index(op.f("ix_aprendizados_visuais_ia_empresa_id"), "aprendizados_visuais_ia", ["empresa_id"], unique=False)
    op.create_index(op.f("ix_aprendizados_visuais_ia_id"), "aprendizados_visuais_ia", ["id"], unique=False)
    op.create_index(op.f("ix_aprendizados_visuais_ia_laudo_id"), "aprendizados_visuais_ia", ["laudo_id"], unique=False)
    op.create_index(op.f("ix_aprendizados_visuais_ia_mensagem_referencia_id"), "aprendizados_visuais_ia", ["mensagem_referencia_id"], unique=False)
    op.create_index(op.f("ix_aprendizados_visuais_ia_validado_por_id"), "aprendizados_visuais_ia", ["validado_por_id"], unique=False)

    with op.batch_alter_table("aprendizados_visuais_ia", schema=None) as batch_op:
        batch_op.alter_column("setor_industrial", server_default=None)
        batch_op.alter_column("pontos_chave_json", server_default=None)
        batch_op.alter_column("referencias_norma_json", server_default=None)
        batch_op.alter_column("marcacoes_json", server_default=None)
        batch_op.alter_column("status", server_default=None)
        batch_op.alter_column("veredito_inspetor", server_default=None)


def downgrade() -> None:
    op.drop_index(op.f("ix_aprendizados_visuais_ia_validado_por_id"), table_name="aprendizados_visuais_ia")
    op.drop_index(op.f("ix_aprendizados_visuais_ia_mensagem_referencia_id"), table_name="aprendizados_visuais_ia")
    op.drop_index(op.f("ix_aprendizados_visuais_ia_laudo_id"), table_name="aprendizados_visuais_ia")
    op.drop_index(op.f("ix_aprendizados_visuais_ia_id"), table_name="aprendizados_visuais_ia")
    op.drop_index(op.f("ix_aprendizados_visuais_ia_empresa_id"), table_name="aprendizados_visuais_ia")
    op.drop_index(op.f("ix_aprendizados_visuais_ia_criado_por_id"), table_name="aprendizados_visuais_ia")
    op.drop_index("ix_aprendizado_visual_sha", table_name="aprendizados_visuais_ia")
    op.drop_index("ix_aprendizado_visual_setor_status", table_name="aprendizados_visuais_ia")
    op.drop_index("ix_aprendizado_visual_ref_msg", table_name="aprendizados_visuais_ia")
    op.drop_index("ix_aprendizado_visual_laudo_criado", table_name="aprendizados_visuais_ia")
    op.drop_index("ix_aprendizado_visual_empresa_status", table_name="aprendizados_visuais_ia")
    op.drop_table("aprendizados_visuais_ia")
