import time
import random
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import httpx
from fastapi import HTTPException, status
from sqlalchemy import select, func, update, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.delivery import Delivery
from app.models.delivery_attempt import DeliveryAttempt
from app.models.event import Event
from app.models.endpoint import Endpoint
from app.models.user import User
from app.services.endpoint_service import get_user_endpoint_by_id
from app.services.security_service import validate_target_url
from app.services import circuit_breaker

# Retry schedule configuration
MAX_DELIVERY_ATTEMPTS = 5

# Default backoff delays in seconds: 1m, 5m, 30m, 2h
BACKOFF_SCHEDULE_SECONDS = [60, 300, 1800, 7200]
TEST_BACKOFF_SCHEDULE_SECONDS = [1, 2, 3, 5]


def calculate_next_retry(attempt_count: int, fast_mode: bool = False) -> datetime:
    """
    Calculate next attempt timestamp using exponential backoff schedule with jitter.
    """
    schedule = TEST_BACKOFF_SCHEDULE_SECONDS if fast_mode else BACKOFF_SCHEDULE_SECONDS
    idx = min(attempt_count - 1, len(schedule) - 1)
    base_delay = schedule[max(0, idx)]
    # Add +/- 15% random jitter to avoid thundering herd
    jitter_factor = random.uniform(0.85, 1.15)
    delay_seconds = max(1, int(base_delay * jitter_factor))
    return datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)


async def get_deliveries_for_event(
    db: AsyncSession,
    user_id: str,
    event_id: str,
) -> List[Delivery]:
    """
    Retrieve all delivery records for a specific event with ownership check.
    Returns 404 if event does not exist or belongs to another user.
    """
    # Enforce ownership through join on Endpoint
    stmt = (
        select(Event)
        .join(Endpoint, Event.endpoint_id == Endpoint.id)
        .where(
            Event.id == event_id,
            Endpoint.user_id == user_id,
        )
    )
    event_result = await db.execute(stmt)
    event = event_result.scalar_one_or_none()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    deliveries_stmt = (
        select(Delivery)
        .where(Delivery.event_id == event_id)
        .order_by(Delivery.created_at.desc())
    )
    del_result = await db.execute(deliveries_stmt)
    return list(del_result.scalars().all())


async def replay_event_delivery(
    db: AsyncSession,
    user_id: str,
    event_id: str,
) -> Delivery:
    """
    Reset a failed or delivered event so the worker dispatches it again immediately.
    Enforces ownership check.
    """
    # Verify ownership
    stmt = (
        select(Event)
        .join(Endpoint, Event.endpoint_id == Endpoint.id)
        .where(
            Event.id == event_id,
            Endpoint.user_id == user_id,
        )
    )
    event = (await db.execute(stmt)).scalar_one_or_none()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Event not found",
        )

    # Find the most recent delivery or create one
    del_stmt = (
        select(Delivery)
        .where(Delivery.event_id == event_id)
        .order_by(Delivery.created_at.desc())
    )
    delivery = (await db.execute(del_stmt)).scalars().first()

    now = datetime.now(timezone.utc)
    if delivery:
        delivery.status = "pending"
        delivery.attempt_count = 0
        delivery.next_attempt_at = now
        delivery.last_error = None
        delivery.last_status_code = None
        delivery.error_kind = None
    else:
        delivery = Delivery(
            event_id=event_id,
            status="pending",
            attempt_count=0,
            next_attempt_at=now,
            error_kind=None,
        )
        db.add(delivery)

    await db.commit()
    await db.refresh(delivery)

    # Broadcast replay delivery status via WebSocket
    try:
        from app.services.websocket_manager import ws_manager
        await ws_manager.notify_delivery_updated(
            user_id=str(user_id),
            delivery_data={
                "id": str(delivery.id),
                "event_id": str(event.id),
                "endpoint_id": str(event.endpoint_id),
                "status": delivery.status,
                "attempt_count": delivery.attempt_count,
                "last_status_code": delivery.last_status_code,
                "last_error": delivery.last_error,
                "latency_ms": delivery.latency_ms,
                "next_attempt_at": delivery.next_attempt_at.isoformat() if delivery.next_attempt_at else None,
                "delivered_at": delivery.delivered_at.isoformat() if delivery.delivered_at else None,
            },
        )
    except Exception:
        pass

    return delivery


async def replay_failed_endpoint_deliveries(
    db: AsyncSession,
    user_id: str,
    endpoint_id: str,
) -> int:
    """
    Bulk replay: Reset all failed deliveries for an endpoint to pending.
    Enforces ownership check.
    """
    await get_user_endpoint_by_id(db, user_id, endpoint_id)

    # Query all failed deliveries belonging to this endpoint
    stmt = (
        select(Delivery)
        .join(Event, Delivery.event_id == Event.id)
        .where(
            Event.endpoint_id == endpoint_id,
            Delivery.status == "failed",
        )
    )
    result = await db.execute(stmt)
    deliveries = result.scalars().all()

    now = datetime.now(timezone.utc)
    count = 0
    for d in deliveries:
        d.status = "pending"
        d.attempt_count = 0
        d.next_attempt_at = now
        d.last_error = None
        d.last_status_code = None
        d.error_kind = None
        count += 1

    await db.commit()
    return count


async def send_webhook_http(
    url: str,
    payload: Any,
    headers: Dict[str, str],
    timeout: float = 10.0,
) -> httpx.Response:
    """Send outbound HTTP request with timeout after SSRF validation."""
    validated_url = validate_target_url(url)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        return await client.post(validated_url, json=payload, headers=headers)


async def forward_single_delivery(
    db: AsyncSession,
    delivery_id: str,
    fast_retry_mode: bool = False,
) -> Optional[Delivery]:
    """
    Execute HTTP forwarding with 10s timeout, update attempt count,
    record status code, latency, and schedule retries on failure.
    """
    # Fetch delivery with event, endpoint, and user settings
    stmt = (
        select(Delivery, Event, Endpoint, User)
        .join(Event, Delivery.event_id == Event.id)
        .join(Endpoint, Event.endpoint_id == Endpoint.id)
        .outerjoin(User, Endpoint.user_id == User.id)
        .where(Delivery.id == delivery_id)
    )
    result = await db.execute(stmt)
    row = result.first()

    if not row:
        return None

    delivery, event, endpoint, user = row

    if not endpoint.is_active:
        # Endpoint was disabled by user; mark as failed
        delivery.status = "failed"
        delivery.last_error = "Target endpoint is paused / inactive"
        delivery.next_attempt_at = None
        await db.commit()
        return delivery

    # Circuit breaker admission check
    mode = await circuit_breaker.admit(db, str(endpoint.id))  # 'send' | 'probe' | 'skip'
    if mode == "skip":
        # Another delivery of the same endpoint already took the probe slot in this batch.
        # Delay next attempt without consuming an attempt count
        delivery.next_attempt_at = datetime.now(timezone.utc) + timedelta(seconds=5)
        await db.commit()
        await db.refresh(delivery)
        return delivery

    # Determine user-configured delivery timeout and retry limits
    timeout_sec = float(user.delivery_timeout) if (user and user.delivery_timeout) else 10.0
    max_retries = int(user.retry_attempts) if (user and user.retry_attempts) else MAX_DELIVERY_ATTEMPTS

    # Prepare forwarding headers
    hop_by_hop = {"host", "content-length", "transfer-encoding", "connection"}
    forward_headers: Dict[str, str] = {
        k: str(v)
        for k, v in event.headers.items()
        if k.lower() not in hop_by_hop
    }
    forward_headers["Content-Type"] = "application/json"
    forward_headers["X-HookRelay-Delivery"] = delivery.id
    forward_headers["X-HookRelay-Event"] = event.id

    # Execute HTTP POST request with user-defined timeout
    start_time = time.perf_counter()
    delivery.attempt_count += 1

    success = False
    error_kind = None
    status_code = None
    latency_ms = None

    try:
        response = await send_webhook_http(
            url=endpoint.target_url,
            payload=event.body,
            headers=forward_headers,
            timeout=timeout_sec,
        )
        latency_ms = int((time.perf_counter() - start_time) * 1000)
        status_code = response.status_code
        delivery.latency_ms = latency_ms
        delivery.last_status_code = status_code

        if 200 <= response.status_code < 300:
            success = True
            delivery.status = "delivered"
            delivery.next_attempt_at = None
            delivery.last_error = None
            delivery.error_kind = None
        else:
            success = False
            error_kind = "http_status"
            delivery.error_kind = "http_status"
            _handle_failure(
                delivery=delivery,
                error_msg=f"Destination returned HTTP {response.status_code}",
                max_retries=max_retries,
                fast_mode=fast_retry_mode,
            )

    except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
        latency_ms = int((time.perf_counter() - start_time) * 1000)
        status_code = None
        success = False
        error_kind = "connection"
        delivery.latency_ms = latency_ms
        delivery.last_status_code = None
        delivery.error_kind = "connection"
        _handle_failure(
            delivery=delivery,
            error_msg=f"Connection failed: {exc}",
            max_retries=max_retries,
            fast_mode=fast_retry_mode,
        )
    except httpx.TimeoutException as exc:
        latency_ms = int((time.perf_counter() - start_time) * 1000)
        status_code = None
        success = False
        error_kind = "timeout"
        delivery.latency_ms = latency_ms
        delivery.last_status_code = None
        delivery.error_kind = "timeout"
        _handle_failure(
            delivery=delivery,
            error_msg=f"Request timed out after {int(timeout_sec)}s: {exc}",
            max_retries=max_retries,
            fast_mode=fast_retry_mode,
        )
    except Exception as exc:
        latency_ms = int((time.perf_counter() - start_time) * 1000)
        status_code = None
        success = False
        error_kind = getattr(exc, "error_kind", "connection")
        delivery.latency_ms = latency_ms
        delivery.last_status_code = None
        delivery.error_kind = error_kind
        _handle_failure(
            delivery=delivery,
            error_msg=f"Delivery error: {exc}",
            max_retries=max_retries,
            fast_mode=fast_retry_mode,
        )

    # Insert delivery_attempts row for alerts, timelines and analytics
    attempt = DeliveryAttempt(
        delivery_id=str(delivery.id),
        endpoint_id=str(endpoint.id),
        attempted_at=datetime.now(timezone.utc),
        success=success,
        status_code=status_code,
        error_kind=error_kind,
        latency_ms=latency_ms,
    )
    db.add(attempt)

    # Record result with circuit breaker and broadcast any state transition
    status_code = delivery.last_status_code
    is_failed = circuit_breaker.counts_as_failure(status_code)
    changed = await circuit_breaker.record_result(
        db,
        str(endpoint.id),
        failed=is_failed,
        is_probe=(mode == "probe"),
    )
    if changed:
        try:
            from app.services.websocket_manager import ws_manager
            await ws_manager.send_to_user(
                str(endpoint.user_id),
                {
                    "type": "circuit_changed",
                    "endpoint_id": str(endpoint.id),
                    "circuit_state": changed,
                },
            )
        except Exception:
            pass

    await db.commit()
    await db.refresh(delivery)

    # Spawn alert rules evaluator in background (evaluates firing, recovery and reminders)
    try:
        from app.services.alert_evaluator import safe_spawn_evaluator, safe_spawn_dead_letter_evaluator
        safe_spawn_evaluator(str(endpoint.id))
        if delivery.status == "failed":
            safe_spawn_dead_letter_evaluator(str(endpoint.id))
    except Exception:
        pass

    # Broadcast delivery update to endpoint owner via WebSocket in real time
    try:
        from app.services.websocket_manager import ws_manager
        await ws_manager.notify_delivery_updated(
            user_id=str(endpoint.user_id),
            delivery_data={
                "id": str(delivery.id),
                "event_id": str(event.id),
                "endpoint_id": str(endpoint.id),
                "status": delivery.status,
                "attempt_count": delivery.attempt_count,
                "last_status_code": delivery.last_status_code,
                "last_error": delivery.last_error,
                "error_kind": delivery.error_kind,
                "latency_ms": delivery.latency_ms,
                "next_attempt_at": delivery.next_attempt_at.isoformat() if delivery.next_attempt_at else None,
                "delivered_at": delivery.delivered_at.isoformat() if delivery.delivered_at else None,
            },
        )
    except Exception:
        pass

    return delivery


def _handle_failure(
    delivery: Delivery,
    error_msg: str,
    max_retries: int = MAX_DELIVERY_ATTEMPTS,
    fast_mode: bool = False,
) -> None:
    """Schedule next retry with backoff, or transition to failed if attempts exhausted."""
    delivery.last_error = error_msg
    if delivery.attempt_count >= max_retries:
        delivery.status = "failed"
        delivery.next_attempt_at = None
    else:
        delivery.status = "retrying"
        delivery.next_attempt_at = calculate_next_retry(
            delivery.attempt_count,
            fast_mode=fast_mode,
        )


async def fetch_and_process_due_deliveries(
    db: AsyncSession,
    batch_size: int = 10,
    fast_mode: bool = False,
) -> int:
    """
    Pick due deliveries using SELECT ... FOR UPDATE SKIP LOCKED
    and dispatch them. Deliveries belonging to paused endpoints are
    filtered out at SQL level to prevent batch starvation.
    """
    now = datetime.now(timezone.utc)
    ttl_seconds = settings.CB_PROBE_TTL_S
    ttl_threshold = now - timedelta(seconds=ttl_seconds)

    circuit_filter = or_(
        Endpoint.circuit_state == "closed",
        and_(
            Endpoint.circuit_state == "open",
            Endpoint.circuit_open_until <= now,
        ),
        and_(
            Endpoint.circuit_state == "half_open",
            Endpoint.probe_started_at < ttl_threshold,
        ),
    )

    stmt = (
        select(Delivery.id)
        .join(Event, Delivery.event_id == Event.id)
        .join(Endpoint, Event.endpoint_id == Endpoint.id)
        .where(
            Delivery.status.in_(["pending", "retrying"]),
            Delivery.next_attempt_at <= now,
            Endpoint.is_active == True,
            circuit_filter,
        )
        .order_by(Delivery.next_attempt_at.asc())
        .limit(batch_size)
    )

    # In PostgreSQL, use FOR UPDATE OF d SKIP LOCKED to allow concurrent workers without contention
    try:
        bind = db.get_bind()
        if bind.dialect.name == "postgresql":
            stmt = stmt.with_for_update(skip_locked=True, of=Delivery)
        else:
            stmt = stmt.with_for_update(skip_locked=True)
    except Exception:
        pass

    result = await db.execute(stmt)
    due_ids = list(result.scalars().all())

    count = 0
    for delivery_id in due_ids:
        await forward_single_delivery(db, delivery_id, fast_retry_mode=fast_mode)
        count += 1

    return count
