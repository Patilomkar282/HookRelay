from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.endpoint import Endpoint
from app.models.alert import AlertRule, AlertChannel, AlertEvent
from app.schemas.alert_event import AlertEventsPaginated, AlertEventOut

router = APIRouter(tags=["Alert Events"])


@router.get("/alert-events", response_model=AlertEventsPaginated)
async def list_alert_events(
    endpoint_id: Optional[str] = Query(None, description="Filter by mailbox/endpoint ID"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List alert events history for the authenticated user, newest first.
    Strict multi-tenant security:
    - User only sees events for rules they own.
    - If endpoint_id is provided, returns 404 if the endpoint does not belong to the user.
    """
    if not settings.FEATURE_ALERTS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerts feature is disabled",
        )

    # If filtering by endpoint, verify endpoint ownership first
    if endpoint_id:
        ep_stmt = select(Endpoint).where(
            Endpoint.id == endpoint_id,
            Endpoint.user_id == current_user.id,
        )
        ep = (await db.execute(ep_stmt)).scalar_one_or_none()
        if not ep:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Endpoint not found",
            )

    # Base query joined with rule, channel, and endpoint
    base_query = (
        select(AlertEvent, AlertRule, AlertChannel, Endpoint)
        .join(AlertRule, AlertEvent.rule_id == AlertRule.id)
        .join(AlertChannel, AlertRule.channel_id == AlertChannel.id)
        .outerjoin(Endpoint, AlertRule.endpoint_id == Endpoint.id)
        .where(AlertRule.user_id == current_user.id)
    )

    count_query = (
        select(func.count(AlertEvent.id))
        .join(AlertRule, AlertEvent.rule_id == AlertRule.id)
        .where(AlertRule.user_id == current_user.id)
    )

    if endpoint_id:
        base_query = base_query.where(AlertRule.endpoint_id == endpoint_id)
        count_query = count_query.where(AlertRule.endpoint_id == endpoint_id)

    total = (await db.execute(count_query)).scalar() or 0

    offset = (page - 1) * limit
    paginated_query = (
        base_query
        .order_by(AlertEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(paginated_query)
    rows = result.all()

    items = []
    for event, rule, channel, ep in rows:
        mailbox_label = None
        if ep:
            mailbox_label = ep.name or ep.slug
        elif "mailbox_name" in (event.summary or {}):
            mailbox_label = event.summary["mailbox_name"]

        items.append(
            AlertEventOut(
                id=event.id,
                rule_id=event.rule_id,
                kind=event.kind,
                summary=event.summary or {},
                status=event.status,
                attempts=event.attempts,
                next_try_at=event.next_try_at,
                error=event.error,
                created_at=event.created_at,
                rule_type=rule.type,
                channel_name=channel.name,
                channel_type=channel.type,
                mailbox_name=mailbox_label,
                endpoint_id=rule.endpoint_id,
            )
        )

    return AlertEventsPaginated(
        items=items,
        total=total,
        page=page,
        limit=limit,
    )
