"""Merge heads de reabertura do laudo e anexos da mesa.

Revision ID: c7d1a2e9f4b8
Revises: e4b6c8d2f9a1, b4d2e8f6a1c3
Create Date: 2026-03-11 21:46:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union


revision: str = "c7d1a2e9f4b8"
down_revision: Union[str, Sequence[str], None] = ("e4b6c8d2f9a1", "b4d2e8f6a1c3")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
