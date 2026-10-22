import json
from typing import Any, Dict, Optional, Tuple
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.endpoint import Endpoint
from app.models.event import Event
from app.models.delivery import Delivery
from app.schemas.event import PaginatedEvents, EventOut
from app.services.endpoint_service import get_user_endpoint_by_id
from app.services.signature_service import verify_webhook_signature

# 2MB max payload size limit
MAX_PAYLOAD_BYTES = 2 * 1024 * 1024


def extract_idempotency_key(headers: Dict[str, Any]) -> Optional[str]:
    """Inspect standard webhook headers for idempotency keys."""
    norm_headers = {k.lower(): v for k, v in headers.items()}
    return (
        norm_headers.get("idempotency-key")
        or norm_headers.get("x-idempotency-key")
        or norm_headers.get("x-github-delivery")
        or norm_headers.get("x-razorpay-event-id")
    )


async def ingest_webhook_event(
    db: AsyncSession,
    slug: str,
    headers: Dict[str, Any],
    body_bytes: bytes,
) -> Event:
    """
    Public ingest handler for POST /h/{slug}.
    Validates size limit, parses body, saves to PostgreSQL, returns event.
    """
    if len(body_bytes) > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Payload exceeds size limit of {MAX_PAYLOAD_BYTES // 1024} KB",
        )

    # 1. Lookup endpoint by slug
    stmt = select(Endpoint).where(Endpoint.slug == slug)
    result = await db.execute(stmt)
    endpoint = result.scalar_one_or_none()

    if not endpoint or not endpoint.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mailbox endpoint not found or inactive",
        )

    # 2. Parse body (JSON if valid, fallback to text/raw dict)
    parsed_body: Any = {}
    if body_bytes:
        try:
            parsed_body = json.loads(body_bytes.decode("utf-8"))
        except Exception:
            parsed_body = {"raw": body_bytes.decode("utf-8", errors="replace")}

    idempotency_key = extract_idempotency_key(headers)
    if not idempotency_key and isinstance(parsed_body, dict):
        idempotency_key = parsed_body.get("id") or parsed_body.get("event_id")
        if idempotency_key:
            idempotency_key = str(idempotency_key)

    if idempotency_key:
        stmt = select(Event).where(
            Event.endpoint_id == endpoint.id,
            Event.idempotency_key == idempotency_key,
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing:
            return existing

    # 3. Verify signature (HMAC-SHA256 for GitHub and generic providers)
    signature_valid = verify_webhook_signature(
        provider_type=endpoint.provider_type,
        signing_secret=endpoint.signing_secret,
        headers=headers,
        body_bytes=body_bytes,
        custom_signature_header=getattr(endpoint, "custom_signature_header", None),
    )

    # 4. Save Event to PostgreSQL
    event = Event(
        endpoint_id=endpoint.id,
        headers=headers,
        body=parsed_body,
        received_at=datetime.now(timezone.utc),
        signature_valid=signature_valid,
        idempotency_key=idempotency_key,
    )
    db.add(event)
    await db.flush()  # obtain event.id

    delivery = Delivery(
        event_id=event.id,
        status="pending",
        attempt_count=0,
        next_attempt_at=datetime.now(timezone.utc),
    )
    db.add(delivery)
    await db.commit()
    await db.refresh(event)

    # 5. Broadcast event.created via WebSocket to endpoint owner in real time
    try:
        from app.services.websocket_manager import ws_manager
        await ws_manager.notify_event_created(
            user_id=str(endpoint.user_id),
            event_data={
                "id": str(event.id),
                "endpoint_id": str(endpoint.id),
                "endpoint_slug": str(endpoint.slug),
                "received_at": event.received_at.isoformat(),
                "signature_valid": bool(event.signature_valid),
                "idempotency_key": event.idempotency_key,
                "headers": event.headers,
                "body": event.body,
                "delivery_status": delivery.status,
                "delivery_status_code": delivery.last_status_code,
                "delivery_latency_ms": delivery.latency_ms,
                "delivery_attempts": delivery.attempt_count,
            },
        )
    except Exception:
        pass

    return event


async def get_events_for_endpoint(
    db: AsyncSession,
    user_id: str,
    endpoint_id: str,
    limit: int = 20,
    offset: int = 0,
    status_filter: Optional[str] = None,
) -> PaginatedEvents:
    """
    List events for an endpoint with pagination, status filtering, and latest delivery info.
    Verifies user ownership of the endpoint; returns 404 if unauthorized.
    """
    # Enforce ownership check on endpoint
    await get_user_endpoint_by_id(db, user_id, endpoint_id)

    # Base query for counting & fetching
    if status_filter:
        count_stmt = (
            select(func.count(func.distinct(Event.id)))
            .join(Delivery, Event.id == Delivery.event_id)
            .where(Event.endpoint_id == endpoint_id, Delivery.status == status_filter)
        )
        events_stmt = (
            select(Event)
            .join(Delivery, Event.id == Delivery.event_id)
            .where(Event.endpoint_id == endpoint_id, Delivery.status == status_filter)
            .distinct()
            .order_by(Event.received_at.desc())
            .limit(limit)
            .offset(offset)
        )
    else:
        count_stmt = select(func.count(Event.id)).where(Event.endpoint_id == endpoint_id)
        events_stmt = (
            select(Event)
            .where(Event.endpoint_id == endpoint_id)
            .order_by(Event.received_at.desc())
            .limit(limit)
            .offset(offset)
        )

    total_result = await db.execute(count_stmt)
    total = total_result.scalar_one()

    events_result = await db.execute(events_stmt)
    events = events_result.scalars().all()

    # Query latest delivery for each event to populate delivery status fields
    event_ids = [e.id for e in events]
    del_map: Dict[str, Delivery] = {}
    if event_ids:
        del_stmt = (
            select(Delivery)
            .where(Delivery.event_id.in_(event_ids))
            .order_by(Delivery.created_at.desc())
        )
        del_res = await db.execute(del_stmt)
        for d in del_res.scalars().all():
            if d.event_id not in del_map:
                del_map[d.event_id] = d

    items = []
    for e in events:
        out = EventOut.model_validate(e)
        d = del_map.get(e.id)
        if d:
            out.delivery_status = d.status
            out.delivery_status_code = d.last_status_code
            out.delivery_latency_ms = d.latency_ms
            out.delivery_attempts = d.attempt_count
        items.append(out)

    return PaginatedEvents(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


async def get_event_detail_by_id(
    db: AsyncSession,
    user_id: str,
    event_id: str,
) -> Event:
    """
    Retrieve one event in full.
    Enforces ownership check: User B gets 404 if event belongs to User A.
    """
    stmt = (
        select(Event)
        .join(Endpoint, Event.endpoint_id == Endpoint.id)
        .where(
            Event.id == event_id,
            Endpoint.user_id == user_id,
        )
    )
    result = await db.execute(stmt)
    event = result.scalar_one_or_none()

    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )
    return event
