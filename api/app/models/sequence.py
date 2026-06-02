from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, OwnerMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.sequence_step import SequenceStep


class Sequence(Base, TimestampMixin, OwnerMixin):
    """A reusable outreach template.

    A sequence is a template, not an enrollment. Enrolling a contact builds an
    :class:`ActionChain` from this template; that chain IS the enrollment record
    (linked back via ``action_chains.sequence_id``).
    """

    __tablename__ = "sequences"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="active"
    )  # active / inactive

    # Recurrence: when set, completing an enrollment auto-re-enrolls the contact
    # on this cadence (anchored on the completion date) until recurrence_end_date.
    recurrence_type: Mapped[str] = mapped_column(
        String, nullable=False, server_default="never"
    )  # never / daily / weekly / monthly / quarterly / yearly
    recurrence_interval: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1"
    )  # "every N" units of recurrence_type
    recurrence_end_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )  # null = no end

    steps: Mapped[list["SequenceStep"]] = relationship(
        back_populates="sequence",
        cascade="all, delete-orphan",
        order_by="SequenceStep.step_order",
    )
