"""add personal api token to users

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-25

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("api_token_hash", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("api_token_prefix", sa.String(8), nullable=True))
    op.create_index("ix_users_api_token_hash", "users", ["api_token_hash"])


def downgrade() -> None:
    op.drop_index("ix_users_api_token_hash", table_name="users")
    op.drop_column("users", "api_token_prefix")
    op.drop_column("users", "api_token_hash")
