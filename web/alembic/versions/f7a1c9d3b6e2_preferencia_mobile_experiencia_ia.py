"""adiciona preferencias de experiencia de ia no mobile

Revision ID: f7a1c9d3b6e2
Revises: f4c8d2e7a9b1
Create Date: 2026-03-18 16:55:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "f7a1c9d3b6e2"
down_revision = "f4c8d2e7a9b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "preferencias_mobile_usuarios",
        sa.Column(
            "experiencia_ia_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("preferencias_mobile_usuarios", "experiencia_ia_json")
