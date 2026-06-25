"""email polling: unmatched_emails + email_ignore_list, activity direction/message_id

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-24

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "unmatched_emails",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("message_id", sa.String(998), nullable=False),
        sa.Column("from_address", sa.String(320), nullable=False),
        sa.Column("to_addresses", sa.Text(), nullable=True),
        sa.Column("subject", sa.String(998), nullable=True),
        sa.Column("body_snippet", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("direction", sa.String(16), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
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
        "ix_unmatched_emails_message_id", "unmatched_emails", ["message_id"], unique=True
    )
    op.create_index("ix_unmatched_emails_from_address", "unmatched_emails", ["from_address"])
    op.create_index("ix_unmatched_emails_received_at", "unmatched_emails", ["received_at"])
    op.create_index("ix_unmatched_emails_status", "unmatched_emails", ["status"])
    op.create_index("ix_unmatched_emails_owner_id", "unmatched_emails", ["owner_id"])

    op.create_table(
        "email_ignore_list",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("pattern", sa.String(320), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False, server_default="address"),
        sa.Column("note", sa.Text(), nullable=True),
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
        "ix_email_ignore_list_pattern", "email_ignore_list", ["pattern"], unique=True
    )
    op.create_index("ix_email_ignore_list_owner_id", "email_ignore_list", ["owner_id"])

    op.add_column("activities", sa.Column("direction", sa.String(16), nullable=True))
    op.add_column("activities", sa.Column("message_id", sa.String(998), nullable=True))
    op.create_index(
        "ix_activities_message_id", "activities", ["message_id"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_activities_message_id", table_name="activities")
    op.drop_column("activities", "message_id")
    op.drop_column("activities", "direction")

    op.drop_index("ix_email_ignore_list_owner_id", table_name="email_ignore_list")
    op.drop_index("ix_email_ignore_list_pattern", table_name="email_ignore_list")
    op.drop_table("email_ignore_list")

    op.drop_index("ix_unmatched_emails_owner_id", table_name="unmatched_emails")
    op.drop_index("ix_unmatched_emails_status", table_name="unmatched_emails")
    op.drop_index("ix_unmatched_emails_received_at", table_name="unmatched_emails")
    op.drop_index("ix_unmatched_emails_from_address", table_name="unmatched_emails")
    op.drop_index("ix_unmatched_emails_message_id", table_name="unmatched_emails")
    op.drop_table("unmatched_emails")
