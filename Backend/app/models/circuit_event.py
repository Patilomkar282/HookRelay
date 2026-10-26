from datetime import datetime, timezone
from sqlalchemy import BigInteger, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class CircuitEvent(Base):
    __tablename__ = "circuit_events"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    endpoint_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("endpoints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    from_state: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )
    to_state: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )
    reason: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationship
    endpoint: Mapped["Endpoint"] = relationship("Endpoint", back_populates="circuit_events")

    def __repr__(self) -> str:
        return f"<CircuitEvent endpoint_id={self.endpoint_id} {self.from_state}->{self.to_state} ({self.reason})>"
