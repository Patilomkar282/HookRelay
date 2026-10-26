"""rules and transforms

Revision ID: e71b29a8f4c3
Revises: 0664a452396c
Create Date: 2026-10-26 22:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e71b29a8f4c3'
down_revision: Union[str, Sequence[str], None] = '0664a452396c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if not insp.has_table(table_name):
        return False
    columns = [c["name"] for c in insp.get_columns(table_name)]
    return column_name in columns


def upgrade() -> None:
    # 1. Add filter, transform, rules_version, forward_secret_encrypted to endpoints
    if not _has_column("endpoints", "filter"):
        op.add_column("endpoints", sa.Column("filter", postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"), nullable=True))
    if not _has_column("endpoints", "transform"):
        op.add_column("endpoints", sa.Column("transform", postgresql.JSONB(astext_type=sa.Text()).with_variant(sa.JSON(), "sqlite"), nullable=True))
    if not _has_column("endpoints", "rules_version"):
        op.add_column("endpoints", sa.Column("rules_version", sa.Integer(), nullable=False, server_default="0"))
    if not _has_column("endpoints", "forward_secret_encrypted"):
        op.add_column("endpoints", sa.Column("forward_secret_encrypted", sa.Text(), nullable=True))

    # 2. Add forward_body, rules_version to deliveries
    if not _has_column("deliveries", "forward_body"):
        op.add_column("deliveries", sa.Column("forward_body", sa.LargeBinary(), nullable=True))
    if not _has_column("deliveries", "rules_version"):
        op.add_column("deliveries", sa.Column("rules_version", sa.Integer(), nullable=True))


def downgrade() -> None:
    if _has_column("deliveries", "rules_version"):
        op.drop_column("deliveries", "rules_version")
    if _has_column("deliveries", "forward_body"):
        op.drop_column("deliveries", "forward_body")
    if _has_column("endpoints", "forward_secret_encrypted"):
        op.drop_column("endpoints", "forward_secret_encrypted")
    if _has_column("endpoints", "rules_version"):
        op.drop_column("endpoints", "rules_version")
    if _has_column("endpoints", "transform"):
        op.drop_column("endpoints", "transform")
    if _has_column("endpoints", "filter"):
        op.drop_column("endpoints", "filter")
