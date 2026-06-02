from typing import TYPE_CHECKING

from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, OwnerMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.contact import Contact


class Company(Base, TimestampMixin, OwnerMixin):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(255), nullable=True)
    employee_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revenue_range: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hq_city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hq_state: Mapped[str | None] = mapped_column(String(255), nullable=True)
    hq_country: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lifecycle_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    lead_score: Mapped[int | None] = mapped_column(Integer, nullable=True)

    contacts: Mapped[list["Contact"]] = relationship(back_populates="company")
