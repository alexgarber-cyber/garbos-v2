"""add lifecycle_status and lead_score to companies

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-30

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column(
            "lifecycle_status",
            sa.String(length=50),
            nullable=False,
            server_default="Lead",
        ),
    )
    op.add_column(
        "companies",
        sa.Column("lead_score", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("companies", "lead_score")
    op.drop_column("companies", "lifecycle_status")
