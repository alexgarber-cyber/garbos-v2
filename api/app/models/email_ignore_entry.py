from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, OwnerMixin, TimestampMixin


class EmailIgnoreEntry(Base, TimestampMixin, OwnerMixin):
    """An address or domain whose email is silently skipped by the poller.

    ``pattern`` is either a full address (``jane@acme.com``) or a bare domain
    (``acme.com``), distinguished by ``kind``. Matching emails create no activity
    and no unmatched-queue row.
    """

    __tablename__ = "email_ignore_list"

    id: Mapped[int] = mapped_column(primary_key=True)
    pattern: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    # "address" | "domain"
    kind: Mapped[str] = mapped_column(String(16), nullable=False, server_default="address")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
