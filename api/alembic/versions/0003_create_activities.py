"""create activity_types and activities tables

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-30

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SYSTEM_ACTIVITY_TYPES = [
    "Call",
    "Email",
    "LinkedIn Connection Request",
    "LinkedIn DM",
    "LinkedIn InMail",
    "Text",
    "Meeting",
    "Video Message",
    "Marketing Sent",
    "Conference/Event",
    "Inbound",
    "Other",
]


def upgrade() -> None:
    activity_types = op.create_table(
        "activity_types",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column(
            "is_system",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("name", name="uq_activity_types_name"),
    )

    op.bulk_insert(
        activity_types,
        [{"name": name, "is_system": True} for name in SYSTEM_ACTIVITY_TYPES],
    )

    op.create_table(
        "activities",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "activity_type_id",
            sa.Integer(),
            sa.ForeignKey("activity_types.id"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            sa.Integer(),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "company_id",
            sa.Integer(),
            sa.ForeignKey("companies.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("voicemail", sa.Boolean(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "owner_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_activities_activity_type_id", "activities", ["activity_type_id"], unique=False
    )
    op.create_index("ix_activities_contact_id", "activities", ["contact_id"], unique=False)
    op.create_index("ix_activities_company_id", "activities", ["company_id"], unique=False)
    op.create_index("ix_activities_owner_id", "activities", ["owner_id"], unique=False)
    op.create_index("ix_activities_occurred_at", "activities", ["occurred_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_activities_occurred_at", table_name="activities")
    op.drop_index("ix_activities_owner_id", table_name="activities")
    op.drop_index("ix_activities_company_id", table_name="activities")
    op.drop_index("ix_activities_contact_id", table_name="activities")
    op.drop_index("ix_activities_activity_type_id", table_name="activities")
    op.drop_table("activities")
    op.drop_table("activity_types")
