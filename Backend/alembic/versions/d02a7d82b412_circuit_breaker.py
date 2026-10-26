"""circuit breaker

Revision ID: d02a7d82b412
Revises: 849bb3f20906
Create Date: 2026-10-25 14:11:08.197536

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd02a7d82b412'
down_revision: Union[str, Sequence[str], None] = '849bb3f20906'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("endpoints", sa.Column("circuit_state", sa.String(10), nullable=False, server_default="closed"))
    op.add_column("endpoints", sa.Column("consecutive_failures", sa.Integer, nullable=False, server_default="0"))
    op.add_column("endpoints", sa.Column("open_count", sa.Integer, nullable=False, server_default="0"))
    op.add_column("endpoints", sa.Column("circuit_open_until", sa.DateTime(timezone=True)))
    op.add_column("endpoints", sa.Column("probe_started_at", sa.DateTime(timezone=True)))
    op.create_check_constraint(
        "ck_endpoints_circuit_state",
        "endpoints",
        "circuit_state IN ('closed','open','half_open')"
    )
    op.create_table(
        "circuit_events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("endpoint_id", sa.String(36), sa.ForeignKey("endpoints.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("from_state", sa.String(10), nullable=False),
        sa.Column("to_state", sa.String(10), nullable=False),
        sa.Column("reason", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("circuit_events")
    op.drop_constraint("ck_endpoints_circuit_state", "endpoints", type_="check")
    op.drop_column("endpoints", "probe_started_at")
    op.drop_column("endpoints", "circuit_open_until")
    op.drop_column("endpoints", "open_count")
    op.drop_column("endpoints", "consecutive_failures")
    op.drop_column("endpoints", "circuit_state")
