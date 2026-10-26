import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy import (
    String,
    Text,
    Integer,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    BigInteger,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class AlertChannel(Base):
    __tablename__ = "alert_channels"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,  # 'email' or 'slack'
    )
    name: Mapped[str] = mapped_column(
        String(128),
        nullable=False,
    )
    config_encrypted: Mapped[str] = mapped_column(
        Text,
        nullable=False,  # Slack URL or API config encrypted with Fernet
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="alert_channels")
    rules: Mapped[list["AlertRule"]] = relationship(
        "AlertRule",
        back_populates="channel",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<AlertChannel id={self.id} type={self.type} name={self.name}>"


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    endpoint_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("endpoints.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("alert_channels.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[str] = mapped_column(
        String(32),
        nullable=False,  # 'consecutive_failures', 'failure_rate', 'dead_letter'
    )
    params: Mapped[Dict[str, Any]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=dict,
    )
    cooldown_minutes: Mapped[int] = mapped_column(
        Integer,
        default=30,
        nullable=False,
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    state: Mapped[str] = mapped_column(
        String(16),
        default="ok",
        nullable=False,  # 'ok', 'firing'
    )
    state_changed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    last_notified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index("ix_alert_rules_enabled_state", "enabled", "state"),
    )

    # Relationships
    channel: Mapped["AlertChannel"] = relationship("AlertChannel", back_populates="rules")
    events: Mapped[list["AlertEvent"]] = relationship(
        "AlertEvent",
        back_populates="rule",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<AlertRule id={self.id} type={self.type} state={self.state}>"


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    rule_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("alert_rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(
        String(32),
        nullable=False,  # 'fired', 'recovered', 'reminder', 'summary'
    )
    summary: Mapped[Dict[str, Any]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=dict,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="pending",
        nullable=False,  # 'pending', 'sent', 'send_failed'
    )
    attempts: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )
    next_try_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    error: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index(
            "ix_alert_events_pending_next_try",
            "next_try_at",
            postgresql_where=text("status = 'pending'"),
        ),
    )

    # Relationships
    rule: Mapped["AlertRule"] = relationship("AlertRule", back_populates="events")

    def __repr__(self) -> str:
        return f"<AlertEvent id={self.id} rule_id={self.rule_id} kind={self.kind} status={self.status}>"
