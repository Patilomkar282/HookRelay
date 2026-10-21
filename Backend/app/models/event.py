import uuid
from datetime import datetime, timezone
from typing import Any, Dict
from sqlalchemy import String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    endpoint_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("endpoints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # JSONB for PostgreSQL, generic JSON as fallback
    headers: Mapped[Dict[str, Any]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=dict,
    )
    body: Mapped[Dict[str, Any]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=dict,
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    signature_valid: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    idempotency_key: Mapped[str] = mapped_column(
        String(255),
        nullable=True,
    )

    # Unique on (endpoint_id, idempotency_key) to prevent duplicate processing
    __table_args__ = (
        UniqueConstraint(
            "endpoint_id",
            "idempotency_key",
            name="uq_events_endpoint_idempotency_key",
        ),
    )

    # Relationships
    endpoint: Mapped["Endpoint"] = relationship("Endpoint", back_populates="events")
    deliveries: Mapped[list["Delivery"]] = relationship(
        "Delivery",
        back_populates="event",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Event id={self.id} endpoint_id={self.endpoint_id} received_at={self.received_at}>"
