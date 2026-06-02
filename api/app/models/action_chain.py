from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, OwnerMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.chain_step import ChainStep
    from app.models.company import Company
    from app.models.contact import Contact
    from app.models.deal import Deal
    from app.models.sequence import Sequence


class ActionChain(Base, TimestampMixin, OwnerMixin):
    """A sequence of action steps — the single task primitive.

    A boss task ("Prep board deck") is a one-step chain; a meeting follow-up is
    a multi-step chain. Dual-linked to contact + company (same pattern as
    ``Activity``): ``company_id`` is auto-populated from the contact's company
    when not given explicitly.
    """

    __tablename__ = "action_chains"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String, nullable=False, server_default="active"
    )  # active / completed / cancelled
    contact_id: Mapped[int | None] = mapped_column(
        ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sequence_id: Mapped[int | None] = mapped_column(
        ForeignKey("sequences.id", ondelete="SET NULL"), nullable=True, index=True
    )
    deal_id: Mapped[int | None] = mapped_column(
        ForeignKey("deals.id", ondelete="SET NULL"), nullable=True, index=True
    )
    close_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    contact: Mapped["Contact | None"] = relationship()
    company: Mapped["Company | None"] = relationship()
    sequence: Mapped["Sequence | None"] = relationship()
    deal: Mapped["Deal | None"] = relationship()
    steps: Mapped[list["ChainStep"]] = relationship(
        back_populates="chain",
        cascade="all, delete-orphan",
        order_by="ChainStep.step_order",
    )
