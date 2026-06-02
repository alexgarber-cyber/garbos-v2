from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.activity_type import ActivityType
    from app.models.sequence import Sequence


class SequenceStep(Base, TimestampMixin):
    """A single step within a :class:`Sequence` template.

    No ``OwnerMixin`` — steps inherit ownership from their parent sequence.
    ``delay_days`` is the number of days after the previous step; on enrollment
    the cumulative sum sets each generated chain step's due date (day 0 =
    enrollment day).
    """

    __tablename__ = "sequence_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    sequence_id: Mapped[int] = mapped_column(
        ForeignKey("sequences.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    activity_type_id: Mapped[int] = mapped_column(
        ForeignKey("activity_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    delay_days: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    message_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    responsible_party: Mapped[str] = mapped_column(
        String, nullable=False, server_default="me"
    )  # me / them / internal
    note_template: Mapped[str | None] = mapped_column(Text, nullable=True)

    sequence: Mapped["Sequence"] = relationship(back_populates="steps")
    activity_type: Mapped["ActivityType"] = relationship()
