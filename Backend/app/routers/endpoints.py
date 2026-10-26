from typing import List, Optional
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.endpoint import EndpointCreate, EndpointUpdate, EndpointOut
from app.schemas.event import PaginatedEvents
from app.schemas.delivery import BulkReplayResponse
from app.schemas.circuit_event import PaginatedCircuitEvents
from app.services.endpoint_service import (
    create_endpoint,
    get_user_endpoints,
    get_user_endpoint_by_id,
    update_endpoint,
    delete_endpoint,
    rotate_signing_secret,
    get_endpoint_circuit_events,
)
from app.services.event_service import get_events_for_endpoint
from app.services.delivery_service import replay_failed_endpoint_deliveries
from app.services import circuit_breaker
from app.services.websocket_manager import ws_manager

router = APIRouter(prefix="/endpoints", tags=["Endpoints"])


@router.post(
    "",
    response_model=EndpointOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new webhook mailbox endpoint",
)
async def create_new_endpoint(
    endpoint_in: EndpointCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new endpoint. Automatically generates a unique random slug
    and signing secret for webhook verification.
    """
    endpoint = await create_endpoint(db, current_user.id, endpoint_in)
    return EndpointOut.model_validate(endpoint)


@router.get(
    "",
    response_model=List[EndpointOut],
    summary="List all endpoints for current user",
)
async def list_endpoints(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all webhook mailbox endpoints owned by the authenticated user."""
    endpoints = await get_user_endpoints(db, current_user.id)
    return [EndpointOut.model_validate(ep) for ep in endpoints]


@router.get(
    "/{id}",
    response_model=EndpointOut,
    summary="Get endpoint details by ID",
)
async def get_endpoint(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get single endpoint details. Returns 404 if not found or unauthorized."""
    endpoint = await get_user_endpoint_by_id(db, current_user.id, id)
    return EndpointOut.model_validate(endpoint)


@router.patch(
    "/{id}",
    response_model=EndpointOut,
    summary="Update endpoint configuration",
)
async def patch_endpoint(
    id: str,
    update_in: EndpointUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update destination URL, active status, or provider type."""
    endpoint = await update_endpoint(db, current_user.id, id, update_in)
    return EndpointOut.model_validate(endpoint)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an endpoint",
)
async def remove_endpoint(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete endpoint and cascade delete associated events."""
    await delete_endpoint(db, current_user.id, id)


@router.post(
    "/{id}/rotate-secret",
    response_model=EndpointOut,
    summary="Rotate signing secret",
)
async def rotate_secret(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate the signing secret for an endpoint."""
    endpoint = await rotate_signing_secret(db, current_user.id, id)
    return EndpointOut.model_validate(endpoint)


@router.get(
    "/{id}/events",
    response_model=PaginatedEvents,
    summary="List paginated events for an endpoint",
)
async def list_endpoint_events(
    id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, description="Filter by delivery status: failed, delivered, retrying, pending"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List captured webhook events for the endpoint with pagination and optional delivery status filter."""
    return await get_events_for_endpoint(
        db,
        current_user.id,
        id,
        limit=limit,
        offset=offset,
        status_filter=status,
    )


@router.post(
    "/{id}/replay-failed",
    response_model=BulkReplayResponse,
    summary="Replay all failed deliveries for an endpoint",
)
async def replay_failed_deliveries(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Reset all failed deliveries belonging to this endpoint to pending.
    Enforces ownership check: User B gets 404.
    """
    replayed_count = await replay_failed_endpoint_deliveries(db, current_user.id, id)
    return BulkReplayResponse(
        replayed_count=replayed_count,
        message=f"Successfully replayed {replayed_count} failed deliveries",
    )


@router.post(
    "/{id}/circuit/reset",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reset circuit breaker to closed state",
)
async def reset_circuit(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually resume a paused endpoint circuit breaker.
    Owner only: returns 404 for other users.
    Resets circuit_state to 'closed', clears failure counters, and broadcasts live state update.
    """
    endpoint = await get_user_endpoint_by_id(db, current_user.id, id)
    await circuit_breaker.reset(db, endpoint.id, reason="manual_reset")
    await db.commit()
    try:
        await ws_manager.send_to_user(
            str(current_user.id),
            {
                "type": "circuit_changed",
                "endpoint_id": str(endpoint.id),
                "circuit_state": "closed",
            },
        )
    except Exception:
        pass


@router.get(
    "/{id}/circuit-events",
    response_model=PaginatedCircuitEvents,
    summary="Get paginated circuit events audit trail for an endpoint",
)
async def list_circuit_events(
    id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve audit trail of state transitions for this endpoint.
    Owner only: returns 404 for other users. Newest events returned first.
    """
    return await get_endpoint_circuit_events(
        db=db,
        user_id=current_user.id,
        endpoint_id=id,
        limit=limit,
        offset=offset,
    )


