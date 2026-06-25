from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, OwnerMixin, TimestampMixin


class UnmatchedEmail(Base, TimestampMixin, OwnerMixin):
    """An inbound/outbound email the poller could not match to a contact.

    Queued for review so the user can one-click add the sender as a contact or
    lead, or ignore them (which adds them to ``email_ignore_list``). ``message_id``
    is the RFC 5322 Message-ID and serves as the idempotency key so repeated polls
    never enqueue the same email twice.
    """

    __tablename__ = "unmatched_emails"

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[str] = mapped_column(String(998), nullable=False, unique=True, index=True)
    from_address: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    to_addresses: Mapped[str | None] = mapped_column(Text, nullable=True)
    subject: Mapped[str | None] = mapped_column(String(998), nullable=True)
    body_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    # "inbound" | "outbound"
    direction: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # "pending" | "added" | "ignored"
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="pending", index=True
    )
