import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import Event
from app.models.delivery import Delivery
from app.config import settings

logger = logging.getLogger("hookrelay.retention")


async def purge_expired_events(
    db: AsyncSession,
    retention_days: int = None,
) -> int:
    """
    Delete webhook events and associated deliveries older than the retention period.
    Ensures storage does not grow unbounded.
    """
    days = retention_days if retention_days is not None else getattr(settings, "EVENT_RETENTION_DAYS", 30)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    try:
        # 1. Find event IDs older than cutoff
        stmt = select(Event.id).where(Event.received_at < cutoff)
        res = await db.execute(stmt)
        expired_ids = list(res.scalars().all())

        if expired_ids:
            # 2. Delete associated deliveries
            del_stmt = delete(Delivery).where(Delivery.event_id.in_(expired_ids))
            await db.execute(del_stmt)

            # 3. Delete expired events
            event_del_stmt = delete(Event).where(Event.id.in_(expired_ids))
            await db.execute(event_del_stmt)

        # 4. Delete expired delivery attempts older than retention period
        from app.models.delivery_attempt import DeliveryAttempt
        att_del_stmt = delete(DeliveryAttempt).where(DeliveryAttempt.attempted_at < cutoff)
        await db.execute(att_del_stmt)

        # 5. Delete expired alert events older than retention period
        from app.models.alert import AlertEvent
        alert_del_stmt = delete(AlertEvent).where(AlertEvent.created_at < cutoff)
        await db.execute(alert_del_stmt)

        await db.commit()
        logger.info("Purged %d expired events older than %d days (cutoff: %s)", len(expired_ids), days, cutoff)
        return len(expired_ids)
    except Exception as exc:
        await db.rollback()
        logger.error("Failed to purge expired events: %s", exc)
        return 0
