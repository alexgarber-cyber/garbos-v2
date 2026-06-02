from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, OwnerMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.close_reason import CloseReason
    from app.models.company import Company
    from app.models.contact import Contact
    from app.models.pipeline_stage import PipelineStage


class Deal(Base, TimestampMixin, OwnerMixin):
    """An in-flight opportunity moving through the configurable pipeline.

    Linked to a company + primary contact (both nullable, SET NULL). The current
    ``pipeline_stage_id`` is RESTRICT-guarded so a stage can't be deleted while
    deals reference it. Activities and action chains link back via their own
    nullable ``deal_id``; staleness (days since last activity) is computed in the
    API rather than stored.
    """

    __tablename__ = "deals"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True
    )
    primary_contact_id: Mapped[int | None] = mapped_column(
        ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    pipeline_stage_id: Mapped[int] = mapped_column(
        ForeignKey("pipeline_stages.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    amount: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    expected_close_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    close_reason_id: Mapped[int | None] = mapped_column(
        ForeignKey("close_reasons.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    company: Mapped["Company | None"] = relationship()
    primary_contact: Mapped["Contact | None"] = relationship()
    pipeline_stage: Mapped["PipelineStage"] = relationship()
    close_reason: Mapped["CloseReason | None"] = relationship()
