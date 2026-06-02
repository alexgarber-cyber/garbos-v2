"""create action_chains and chain_steps tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-30

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "action_chains",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column(
            "status",
            sa.String(),
            server_default="active",
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
        sa.Column("close_reason", sa.Text(), nullable=True),
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
    op.create_index("ix_action_chains_contact_id", "action_chains", ["contact_id"], unique=False)
    op.create_index("ix_action_chains_company_id", "action_chains", ["company_id"], unique=False)
    op.create_index("ix_action_chains_owner_id", "action_chains", ["owner_id"], unique=False)

    op.create_table(
        "chain_steps",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "chain_id",
            sa.Integer(),
            sa.ForeignKey("action_chains.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column(
            "activity_type_id",
            sa.Integer(),
            sa.ForeignKey("activity_types.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("completed", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responsible_party", sa.String(), server_default="me", nullable=False),
        sa.Column("advances_stage_to", sa.String(), nullable=True),
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
    op.create_index("ix_chain_steps_chain_id", "chain_steps", ["chain_id"], unique=False)
    op.create_index(
        "ix_chain_steps_activity_type_id", "chain_steps", ["activity_type_id"], unique=False
    )
    op.create_index("ix_chain_steps_due_date", "chain_steps", ["due_date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_chain_steps_due_date", table_name="chain_steps")
    op.drop_index("ix_chain_steps_activity_type_id", table_name="chain_steps")
    op.drop_index("ix_chain_steps_chain_id", table_name="chain_steps")
    op.drop_table("chain_steps")
    op.drop_index("ix_action_chains_owner_id", table_name="action_chains")
    op.drop_index("ix_action_chains_company_id", table_name="action_chains")
    op.drop_index("ix_action_chains_contact_id", table_name="action_chains")
    op.drop_table("action_chains")
