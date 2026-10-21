from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.event import EventOut
from app.schemas.delivery import DeliveryOut
from app.services.event_service import get_event_detail_by_id
from app.services.delivery_service import (
    get_deliveries_for_event,
    replay_event_delivery,
    forward_single_delivery,
)

router = APIRouter(prefix="/events", tags=["Events"])


@router.get(
    "/{id}",
    response_model=EventOut,
    summary="Get single event details in full",
)
async def get_event(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch an event in full including raw headers and payload body.
    Enforces ownership check: User B gets 404 if event belongs to User A.
    """
    event = await get_event_detail_by_id(db, current_user.id, id)
    return EventOut.model_validate(event)


@router.get(
    "/{id}/deliveries",
    response_model=List[DeliveryOut],
    summary="List delivery attempts for an event",
)
async def list_event_deliveries(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List all delivery records, statuses, attempt counts, and latencies for an event.
    Enforces ownership check: User B gets 404.
    """
    deliveries = await get_deliveries_for_event(db, current_user.id, id)
    return [DeliveryOut.model_validate(d) for d in deliveries]


@router.post(
    "/{id}/replay",
    response_model=DeliveryOut,
    status_code=status.HTTP_200_OK,
    summary="Replay webhook event delivery",
)
async def replay_event(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Reset a failed event delivery to pending and immediately trigger forwarding.
    Enforces ownership check: User B gets 404.
    """
    delivery = await replay_event_delivery(db, current_user.id, id)
    # Forward immediately so user gets updated delivery status without waiting for next poll
    updated = await forward_single_delivery(db, delivery.id)
    return DeliveryOut.model_validate(updated or delivery)

