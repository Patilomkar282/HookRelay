from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    BigInteger,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class DeliveryAttempt(Base):
    __tablename__ = "delivery_attempts"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    delivery_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("deliveries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    endpoint_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("endpoints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
    success: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
    )
    status_code: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )
    error_kind: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
    )
    latency_ms: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    __table_args__ = (
        Index("ix_delivery_attempts_endpoint_attempted", "endpoint_id", "attempted_at"),
    )

    # Relationships
    delivery: Mapped["Delivery"] = relationship("Delivery", back_populates="attempts")

    def __repr__(self) -> str:
        return f"<DeliveryAttempt id={self.id} delivery={self.delivery_id} success={self.success}>"
