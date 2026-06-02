"""create sequences and sequence_steps tables, add action_chains.sequence_id

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-30

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sequences",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(),
            server_default="active",
            nullable=False,
        ),
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
    op.create_index("ix_sequences_owner_id", "sequences", ["owner_id"], unique=False)

    op.create_table(
        "sequence_steps",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "sequence_id",
            sa.Integer(),
            sa.ForeignKey("sequences.id", ondelete="CASCADE"),
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
        sa.Column("delay_days", sa.Integer(), server_default="0", nullable=False),
        sa.Column("message_body", sa.Text(), nullable=True),
        sa.Column("responsible_party", sa.String(), server_default="me", nullable=False),
        sa.Column("note_template", sa.Text(), nullable=True),
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
        "ix_sequence_steps_sequence_id", "sequence_steps", ["sequence_id"], unique=False
    )
    op.create_index(
        "ix_sequence_steps_activity_type_id",
        "sequence_steps",
        ["activity_type_id"],
        unique=False,
    )

    op.add_column(
        "action_chains",
        sa.Column(
            "sequence_id",
            sa.Integer(),
            sa.ForeignKey("sequences.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_action_chains_sequence_id", "action_chains", ["sequence_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_action_chains_sequence_id", table_name="action_chains")
    op.drop_column("action_chains", "sequence_id")
    op.drop_index("ix_sequence_steps_activity_type_id", table_name="sequence_steps")
    op.drop_index("ix_sequence_steps_sequence_id", table_name="sequence_steps")
    op.drop_table("sequence_steps")
    op.drop_index("ix_sequences_owner_id", table_name="sequences")
    op.drop_table("sequences")
