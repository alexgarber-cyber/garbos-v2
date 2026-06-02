from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, OwnerMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.activity_type import ActivityType
    from app.models.company import Company
    from app.models.contact import Contact
    from app.models.deal import Deal


class Activity(Base, TimestampMixin, OwnerMixin):
    """A logged interaction (call, email, meeting, ...).

    Triple-linked: stores ``contact_id``, ``company_id``, and ``deal_id`` (all
    nullable). When logged against a contact who has a company, ``company_id`` is
    auto-populated from the contact so "all activity for a company" is a single
    indexed query; an activity on a deal also surfaces on its contact/company.
    """

    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    activity_type_id: Mapped[int] = mapped_column(
        ForeignKey("activity_types.id"), nullable=False, index=True
    )
    contact_id: Mapped[int | None] = mapped_column(
        ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True
    )
    deal_id: Mapped[int | None] = mapped_column(
        ForeignKey("deals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    message_sent: Mapped[str | None] = mapped_column(Text, nullable=True)
    voicemail: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    activity_type: Mapped["ActivityType"] = relationship()
    contact: Mapped["Contact | None"] = relationship()
    company: Mapped["Company | None"] = relationship()
    deal: Mapped["Deal | None"] = relationship()
