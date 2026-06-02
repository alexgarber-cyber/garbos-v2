from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ActivityType(Base):
    """Lookup table of activity kinds (Call, Email, Meeting, ...).

    Built-in types are seeded with ``is_system=True``; users may add custom
    types later. This is a table rather than an enum so custom types become
    available everywhere automatically.
    """

    __tablename__ = "activity_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    is_system: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=func.false()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
