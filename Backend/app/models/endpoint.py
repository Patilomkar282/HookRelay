import uuid
import secrets
from datetime import datetime, timezone
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


def generate_slug() -> str:
    """Generate a long, random, URL-safe slug for the endpoint mailbox."""
    return secrets.token_urlsafe(16)


class Endpoint(Base):
    __tablename__ = "endpoints"

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
    # Slug is unique and long and random (e.g. /h/abc123...)
    slug: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        index=True,
        default=generate_slug,
        nullable=False,
    )
    target_url: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )
    signing_secret: Mapped[str] = mapped_column(
        String(255),
        nullable=True,
    )
    provider_type: Mapped[str] = mapped_column(
        String(32),
        default="custom",  # 'github', 'stripe', 'razorpay', 'custom'
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    name: Mapped[str] = mapped_column(
        String(128),
        nullable=True,
    )
    description: Mapped[str] = mapped_column(
        Text,
        nullable=True,
    )
    custom_signature_header: Mapped[str] = mapped_column(
        String(128),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="endpoints")
    events: Mapped[list["Event"]] = relationship(
        "Event",
        back_populates="endpoint",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Endpoint id={self.id} slug={self.slug} provider={self.provider_type}>"
