from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PipelineStage(Base):
    """Lookup table of deal pipeline stages (Qualifying, NDA, ... Closed Won/Lost).

    Built-in stages are seeded with ``is_system=True``; users may add, rename,
    and reorder stages. This is a table rather than an enum so the pipeline is
    configurable without code changes. Terminal stages (Closed Won/Lost) carry
    ``is_terminal=True`` and require a close reason when a deal lands there.
    """

    __tablename__ = "pipeline_stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_terminal: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=func.false()
    )
    is_system: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=func.false()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
