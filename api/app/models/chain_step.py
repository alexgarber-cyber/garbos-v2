from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.action_chain import ActionChain
    from app.models.activity_type import ActivityType


class ChainStep(Base, TimestampMixin):
    """A single step within an :class:`ActionChain`.

    No ``OwnerMixin`` — steps inherit ownership from their parent chain.
    Completing a step auto-logs an activity and may complete the chain.
    """

    __tablename__ = "chain_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    chain_id: Mapped[int] = mapped_column(
        ForeignKey("action_chains.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    activity_type_id: Mapped[int] = mapped_column(
        ForeignKey("activity_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    due_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=func.false()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    responsible_party: Mapped[str] = mapped_column(
        String, nullable=False, server_default="me"
    )  # me / them / internal
    # Unused until Block 6 (stage-advancement logic).
    advances_stage_to: Mapped[str | None] = mapped_column(String, nullable=True)

    chain: Mapped["ActionChain"] = relationship(back_populates="steps")
    activity_type: Mapped["ActivityType"] = relationship()
