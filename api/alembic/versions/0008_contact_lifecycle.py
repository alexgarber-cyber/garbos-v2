"""add lifecycle_status to contacts; make companies.lifecycle_status nullable and clear it

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-31

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add lifecycle_status to contacts (nullable, default null) — contacts
    #    become the primary lead carrier.
    op.add_column(
        "contacts",
        sa.Column("lifecycle_status", sa.String(length=50), nullable=True),
    )
    # 2. Make companies.lifecycle_status nullable; drop the "Lead" server default.
    op.alter_column(
        "companies",
        "lifecycle_status",
        existing_type=sa.String(length=50),
        nullable=True,
        server_default=None,
    )
    # 3. Clear the auto-assigned status from ALL existing companies so the leads
    #    page starts intentional, not auto-populated.
    op.execute("UPDATE companies SET lifecycle_status = NULL")


def downgrade() -> None:
    op.execute(
        "UPDATE companies SET lifecycle_status = 'Lead' WHERE lifecycle_status IS NULL"
    )
    op.alter_column(
        "companies",
        "lifecycle_status",
        existing_type=sa.String(length=50),
        nullable=False,
        server_default="Lead",
    )
    op.drop_column("contacts", "lifecycle_status")
