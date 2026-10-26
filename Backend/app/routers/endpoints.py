from typing import List, Optional
from fastapi import APIRouter, Depends, status, Query, HTTPException
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


# =============================================================================
# Feature 3 (Module R2): Rules & Transformations Routes
# =============================================================================

import secrets
import json
from sqlalchemy import select
from app.config import settings
from app.schemas.rules import (
    EndpointRulesUpdate,
    EndpointRulesOut,
    RulesPreviewRequest,
    RulesPreviewOut,
)
from app.services.rate_limiter import SlidingWindowRateLimiter
from app.services.transform import process as transform_process, MAX_PAYLOAD_BYTES
from app.core.crypto import encrypt_string
from app.models.event import Event

rules_preview_rate_limiter = SlidingWindowRateLimiter(default_limit=10, window_seconds=60)


@router.get(
    "/{id}/rules",
    response_model=EndpointRulesOut,
    summary="Get filter and transformation rules for an endpoint",
)
async def get_endpoint_rules(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the filter, transformation steps and rules_version for this mailbox.
    Owner only: returns 404 for unauthorized access. Flag off returns 404.
    """
    if not getattr(settings, "FEATURE_RULES", True):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rules feature is disabled")

    endpoint = await get_user_endpoint_by_id(db, current_user.id, id)
    return EndpointRulesOut(
        filter=endpoint.filter,
        transform=endpoint.transform,
        steps=endpoint.transform,
        rules_version=endpoint.rules_version or 0,
    )


@router.put(
    "/{id}/rules",
    response_model=EndpointRulesOut,
    summary="Update filter and transformation rules for an endpoint",
)
async def update_endpoint_rules(
    id: str,
    rules_in: EndpointRulesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Validate and save filtering and transformation rules.
    Increments rules_version only when rules actually change.
    When the first transform is saved, securely provisions a forwarding secret.
    """
    if not getattr(settings, "FEATURE_RULES", True):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rules feature is disabled")

    endpoint = await get_user_endpoint_by_id(db, current_user.id, id)

    new_filter = rules_in.filter.model_dump() if rules_in.filter else None
    new_transform = (
        [s.model_dump(exclude_none=True) for s in rules_in.transform]
        if rules_in.transform is not None
        else None
    )

    # Check if rules changed
    rules_changed = (endpoint.filter != new_filter) or (endpoint.transform != new_transform)

    if rules_changed:
        endpoint.filter = new_filter
        endpoint.transform = new_transform
        endpoint.rules_version = (endpoint.rules_version or 0) + 1

        # When first transform is configured, provision forwarding secret if not present
        if new_transform and not endpoint.forward_secret_encrypted:
            raw_secret = secrets.token_hex(32)
            endpoint.forward_secret_encrypted = encrypt_string(raw_secret)

        await db.commit()
        await db.refresh(endpoint)

    return EndpointRulesOut(
        filter=endpoint.filter,
        transform=endpoint.transform,
        steps=endpoint.transform,
        rules_version=endpoint.rules_version or 0,
    )


@router.post(
    "/{id}/rules/preview",
    response_model=RulesPreviewOut,
    summary="Test and preview rules on stored event or sample payload without forwarding",
)
async def preview_endpoint_rules(
    id: str,
    preview_in: RulesPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Test filtering and transformation rules against a stored event or sample JSON.
    Returns matches, outcome action, transformed output and error. Sends nothing.
    Rate limit: 10 per minute per user. Maximum payload: 2 MB.
    """
    if not getattr(settings, "FEATURE_RULES", True):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rules feature is disabled")

    endpoint = await get_user_endpoint_by_id(db, current_user.id, id)

    # 1. Enforce rate limit (10 per minute per user)
    rules_preview_rate_limiter.enforce_rate_limit(f"user_{current_user.id}_preview", limit=10)

    # 2. Extract payload and headers
    if preview_in.event_id:
        stmt = (
            select(Event)
            .where(Event.id == preview_in.event_id, Event.endpoint_id == endpoint.id)
        )
        res = await db.execute(stmt)
        event = res.scalar_one_or_none()
        if not event:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
        headers = event.headers or {}
        body = event.body
    elif preview_in.sample_json is not None:
        headers = preview_in.sample_headers or {}
        body = preview_in.sample_json
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Either event_id or sample_json must be provided for preview",
        )

    # 3. Size check (at most 2 MB)
    if isinstance(body, (bytes, bytearray)):
        body_bytes = bytes(body)
    elif isinstance(body, str):
        body_bytes = body.encode("utf-8")
    else:
        try:
            body_bytes = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid JSON payload: {e}",
            )

    if len(body_bytes) > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Payload size ({len(body_bytes)} bytes) exceeds 2 MB limit",
        )

    # 4. Resolve effective rules (preview rules override saved endpoint rules if supplied)
    if preview_in.rules is not None:
        effective_filter = (
            preview_in.rules.filter.model_dump() if preview_in.rules.filter else None
        )
        effective_transform = (
            [s.model_dump(exclude_none=True) for s in preview_in.rules.transform]
            if preview_in.rules.transform is not None
            else None
        )
    else:
        effective_filter = endpoint.filter
        effective_transform = endpoint.transform

    rules_dict = {
        "filter": effective_filter,
        "transform": effective_transform,
    }

    # 5. Run pure transform engine
    outcome = transform_process(
        rules=rules_dict,
        headers=headers,
        raw_body=body_bytes,
    )

    matches = (outcome.action != "filtered")
    output_obj = None
    if outcome.body_bytes:
        try:
            output_obj = json.loads(outcome.body_bytes.decode("utf-8"))
        except Exception:
            output_obj = outcome.body_bytes.decode("utf-8", errors="replace")

    return RulesPreviewOut(
        matches=matches,
        action=outcome.action,
        output=output_obj,
        error=outcome.error,
    )



