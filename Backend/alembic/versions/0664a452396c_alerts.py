"""alerts

Revision ID: 0664a452396c
Revises: d02a7d82b412
Create Date: 2026-10-25 19:49:46.430112

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '0664a452396c'
down_revision: Union[str, Sequence[str], None] = 'd02a7d82b412'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    return insp.has_table(table_name)


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table(table_name):
        return False
    columns = [c["name"] for c in insp.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    # 1. Add error_kind column to deliveries
    if not _has_column("deliveries", "error_kind"):
        op.add_column("deliveries", sa.Column("error_kind", sa.String(64), nullable=True))

    # 2. Create delivery_attempts table
    if not _has_table("delivery_attempts"):
        op.create_table(
            "delivery_attempts",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("delivery_id", sa.String(36), sa.ForeignKey("deliveries.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("endpoint_id", sa.String(36), sa.ForeignKey("endpoints.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("attempted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("success", sa.Boolean(), nullable=False),
            sa.Column("status_code", sa.Integer(), nullable=True),
            sa.Column("error_kind", sa.String(64), nullable=True),
            sa.Column("latency_ms", sa.Integer(), nullable=True),
        )
        op.create_index(
            "ix_delivery_attempts_endpoint_attempted",
            "delivery_attempts",
            ["endpoint_id", "attempted_at"],
        )

    # 3. Create alert_channels table
    if not _has_table("alert_channels"):
        op.create_table(
            "alert_channels",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("type", sa.String(32), nullable=False),
            sa.Column("name", sa.String(128), nullable=False),
            sa.Column("config_encrypted", sa.Text(), nullable=False),
            sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # 4. Create alert_rules table
    if not _has_table("alert_rules"):
        op.create_table(
            "alert_rules",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("endpoint_id", sa.String(36), sa.ForeignKey("endpoints.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("channel_id", sa.String(36), sa.ForeignKey("alert_channels.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("type", sa.String(32), nullable=False),
            sa.Column("params", postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("cooldown_minutes", sa.Integer(), nullable=False, server_default="30"),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("state", sa.String(16), nullable=False, server_default="ok"),
            sa.Column("state_changed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_notified_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index(
            "ix_alert_rules_enabled_state",
            "alert_rules",
            ["enabled", "state"],
        )

    # 5. Create alert_events table
    if not _has_table("alert_events"):
        op.create_table(
            "alert_events",
            sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
            sa.Column("rule_id", sa.String(36), sa.ForeignKey("alert_rules.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("kind", sa.String(32), nullable=False),
            sa.Column("summary", postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("next_try_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_index(
            "ix_alert_events_pending_next_try",
            "alert_events",
            ["next_try_at"],
            postgresql_where=sa.text("status = 'pending'"),
        )


def downgrade() -> None:
    if _has_table("alert_events"):
        try:
            op.drop_index("ix_alert_events_pending_next_try", table_name="alert_events")
        except Exception:
            pass
        op.drop_table("alert_events")

    if _has_table("alert_rules"):
        try:
            op.drop_index("ix_alert_rules_enabled_state", table_name="alert_rules")
        except Exception:
            pass
        op.drop_table("alert_rules")

    if _has_table("alert_channels"):
        op.drop_table("alert_channels")

    if _has_table("delivery_attempts"):
        try:
            op.drop_index("ix_delivery_attempts_endpoint_attempted", table_name="delivery_attempts")
        except Exception:
            pass
        op.drop_table("delivery_attempts")

    if _has_column("deliveries", "error_kind"):
        op.drop_column("deliveries", "error_kind")
