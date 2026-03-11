"""templates_laudo_editor_rico

Revision ID: f1a9e2c4b7d1
Revises: a7c3d9e1f2b4
Create Date: 2026-03-10 17:10:00.000000

"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1a9e2c4b7d1"
down_revision: Union[str, Sequence[str], None] = "a7c3d9e1f2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("templates_laudo", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "modo_editor",
                sa.String(length=20),
                nullable=False,
                server_default="legado_pdf",
            )
        )
        batch_op.add_column(sa.Column("documento_editor_json", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("assets_json", sa.JSON(), nullable=True))
        batch_op.create_check_constraint(
            "ck_template_laudo_modo_editor",
            "modo_editor IN ('legado_pdf', 'editor_rico')",
        )

    op.execute(
        "UPDATE templates_laudo "
        "SET modo_editor = 'legado_pdf' "
        "WHERE modo_editor IS NULL OR TRIM(modo_editor) = ''"
    )

    with op.batch_alter_table("templates_laudo", schema=None) as batch_op:
        batch_op.alter_column("modo_editor", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("templates_laudo", schema=None) as batch_op:
        batch_op.drop_constraint("ck_template_laudo_modo_editor", type_="check")
        batch_op.drop_column("assets_json")
        batch_op.drop_column("documento_editor_json")
        batch_op.drop_column("modo_editor")

