from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # Server-side session lives on the row (single-user app). The cookie holds a
    # random token; we store only its hash plus an expiry, and can revoke by
    # clearing these columns.
    session_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    session_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Personal API token for non-browser clients (e.g. the Chrome extension).
    # Raw token is shown once at generation time; only the hash is persisted.
    api_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    api_token_prefix: Mapped[str | None] = mapped_column(String(8), nullable=True)
