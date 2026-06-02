"""add recurrence fields to sequences

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-01

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "sequences",
        sa.Column(
            "recurrence_type",
            sa.String(),
            nullable=False,
            server_default="never",
        ),
    )
    op.add_column(
        "sequences",
        sa.Column(
            "recurrence_interval",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )
    op.add_column(
        "sequences",
        sa.Column(
            "recurrence_end_date",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("sequences", "recurrence_end_date")
    op.drop_column("sequences", "recurrence_interval")
    op.drop_column("sequences", "recurrence_type")
