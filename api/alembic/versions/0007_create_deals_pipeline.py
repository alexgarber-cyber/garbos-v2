"""create deals pipeline (pipeline_stages, close_reasons, deals) and link activities/chains

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-30

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SEED_STAGES = [
    {"name": "Qualifying", "display_order": 1, "is_terminal": False},
    {"name": "NDA", "display_order": 2, "is_terminal": False},
    {"name": "Financial Review", "display_order": 3, "is_terminal": False},
    {"name": "Term Sheet", "display_order": 4, "is_terminal": False},
    {"name": "Due Diligence", "display_order": 5, "is_terminal": False},
    {"name": "Funding", "display_order": 6, "is_terminal": False},
    {"name": "Closed Won", "display_order": 7, "is_terminal": True},
    {"name": "Closed Lost", "display_order": 8, "is_terminal": True},
]

SEED_CLOSE_REASONS = [
    "Lost to competitor",
    "No budget",
    "Timing not right",
    "No response",
    "Other",
]


def upgrade() -> None:
    pipeline_stages = op.create_table(
        "pipeline_stages",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_terminal", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("is_system", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("name", name="uq_pipeline_stages_name"),
    )
    op.bulk_insert(
        pipeline_stages,
        [{**stage, "is_system": True} for stage in SEED_STAGES],
    )

    close_reasons = op.create_table(
        "close_reasons",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("is_system", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("name", name="uq_close_reasons_name"),
    )
    op.bulk_insert(
        close_reasons,
        [{"name": name, "is_system": True} for name in SEED_CLOSE_REASONS],
    )

    op.create_table(
        "deals",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column(
            "company_id",
            sa.Integer(),
            sa.ForeignKey("companies.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "primary_contact_id",
            sa.Integer(),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "pipeline_stage_id",
            sa.Integer(),
            sa.ForeignKey("pipeline_stages.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(), nullable=True),
        sa.Column("expected_close_date", sa.Date(), nullable=True),
        sa.Column(
            "close_reason_id",
            sa.Integer(),
            sa.ForeignKey("close_reasons.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("notes", sa.Text(), nullable=True),
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
    op.create_index("ix_deals_company_id", "deals", ["company_id"], unique=False)
    op.create_index(
        "ix_deals_primary_contact_id", "deals", ["primary_contact_id"], unique=False
    )
    op.create_index(
        "ix_deals_pipeline_stage_id", "deals", ["pipeline_stage_id"], unique=False
    )
    op.create_index("ix_deals_owner_id", "deals", ["owner_id"], unique=False)

    # Link activities and action chains to deals (triple-link / deal-linked chains).
    op.add_column(
        "activities",
        sa.Column(
            "deal_id",
            sa.Integer(),
            sa.ForeignKey("deals.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_activities_deal_id", "activities", ["deal_id"], unique=False)

    op.add_column(
        "action_chains",
        sa.Column(
            "deal_id",
            sa.Integer(),
            sa.ForeignKey("deals.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_action_chains_deal_id", "action_chains", ["deal_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_action_chains_deal_id", table_name="action_chains")
    op.drop_column("action_chains", "deal_id")
    op.drop_index("ix_activities_deal_id", table_name="activities")
    op.drop_column("activities", "deal_id")

    op.drop_index("ix_deals_owner_id", table_name="deals")
    op.drop_index("ix_deals_pipeline_stage_id", table_name="deals")
    op.drop_index("ix_deals_primary_contact_id", table_name="deals")
    op.drop_index("ix_deals_company_id", table_name="deals")
    op.drop_table("deals")

    op.drop_table("close_reasons")
    op.drop_table("pipeline_stages")
