import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import (
    String,
    Integer,
    Text,
    DateTime,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Delivery(Base):
    __tablename__ = "deliveries"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    event_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Status: 'pending', 'delivered', 'retrying', 'failed'
    status: Mapped[str] = mapped_column(
        String(32),
        default="pending",
        nullable=False,
        index=True,
    )
    attempt_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    next_attempt_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_status_code: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )
    last_error: Mapped[Optional[str]] = mapped_column(
        Text,
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Composite Index on (status, next_attempt_at) for fast worker polling
    __table_args__ = (
        Index(
            "ix_deliveries_status_next_attempt_at",
            "status",
            "next_attempt_at",
        ),
    )

    # Relationships
    event: Mapped["Event"] = relationship("Event", back_populates="deliveries")
    attempts: Mapped[list["DeliveryAttempt"]] = relationship(
        "DeliveryAttempt",
        back_populates="delivery",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Delivery id={self.id} status={self.status} attempt={self.attempt_count}>"
