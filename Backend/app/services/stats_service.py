from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status

from app.models.endpoint import Endpoint
from app.models.event import Event
from app.models.delivery import Delivery
from app.schemas.stats import (
    StatsSummaryResponse,
    StatsTimeseriesResponse,
    TimeseriesBucket,
    FailureReasonItem,
)


async def _get_authorized_endpoint_ids(
    db: AsyncSession,
    user_id: str,
    endpoint_id: Optional[str] = None,
) -> List[str]:
    """Retrieve user-owned endpoint IDs or verify specific endpoint ownership."""
    if endpoint_id:
        stmt = select(Endpoint.id).where(
            Endpoint.id == endpoint_id,
            Endpoint.user_id == user_id,
        )
        res = await db.execute(stmt)
        ep = res.scalar_one_or_none()
        if not ep:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Endpoint not found or unauthorized",
            )
        return [ep]

    stmt = select(Endpoint.id).where(Endpoint.user_id == user_id)
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def get_stats_summary(
    db: AsyncSession,
    user_id: str,
    endpoint_id: Optional[str] = None,
) -> StatsSummaryResponse:
    """Calculate key performance indicators and aggregate metrics for the user."""
    ep_ids = await _get_authorized_endpoint_ids(db, user_id, endpoint_id)
    if not ep_ids:
        return StatsSummaryResponse(
            total_events=0,
            total_deliveries=0,
            delivered_count=0,
            failed_count=0,
            retrying_count=0,
            queued_count=0,
            success_rate_percent=100.0,
            p95_latency_ms=0.0,
            avg_latency_ms=0.0,
            events_per_hour=0.0,
            circuits_open=0,
            deliveries_held=0,
            top_failure_reasons=[],
        )

    # 1. Total events count
    events_count_stmt = select(func.count(Event.id)).where(Event.endpoint_id.in_(ep_ids))
    total_events = (await db.execute(events_count_stmt)).scalar_one() or 0

    # 2. Events in last 24 hours (throughput)
    now = datetime.now(timezone.utc)
    twenty_four_hours_ago = now - timedelta(hours=24)
    recent_events_stmt = (
        select(func.count(Event.id))
        .where(
            Event.endpoint_id.in_(ep_ids),
            Event.received_at >= twenty_four_hours_ago,
        )
    )
    recent_events = (await db.execute(recent_events_stmt)).scalar_one() or 0
    events_per_hour = round(recent_events / 24.0, 2)

    # 3. Deliveries counts grouped by status
    status_stmt = (
        select(Delivery.status, func.count(Delivery.id))
        .join(Event, Delivery.event_id == Event.id)
        .where(Event.endpoint_id.in_(ep_ids))
        .group_by(Delivery.status)
    )
    status_res = await db.execute(status_stmt)
    status_counts = dict(status_res.all())

    delivered = status_counts.get("delivered", 0)
    failed = status_counts.get("failed", 0)
    retrying = status_counts.get("retrying", 0)
    queued = status_counts.get("pending", 0)
    total_deliveries = delivered + failed + retrying + queued

    success_rate = (
        round((delivered / (delivered + failed)) * 100.0, 1)
        if (delivered + failed) > 0
        else 100.0
    )

    # 4. Latency analytics (p95 and average)
    latency_stmt = (
        select(Delivery.latency_ms)
        .join(Event, Delivery.event_id == Event.id)
        .where(
            Event.endpoint_id.in_(ep_ids),
            Delivery.latency_ms.isnot(None),
        )
    )
    latency_res = await db.execute(latency_stmt)
    latencies = [int(l) for l in latency_res.scalars().all() if l is not None]

    if latencies:
        latencies.sort()
        idx_p95 = min(int(0.95 * len(latencies)), len(latencies) - 1)
        p95_latency = float(latencies[idx_p95])
        avg_latency = round(float(sum(latencies) / len(latencies)), 1)
    else:
        p95_latency = 0.0
        avg_latency = 0.0

    # 5. Top failure reasons
    failure_stmt = (
        select(
            func.coalesce(Delivery.last_error, "HTTP Error").label("reason"),
            Delivery.last_status_code,
            func.count(Delivery.id).label("count"),
        )
        .join(Event, Delivery.event_id == Event.id)
        .where(
            Event.endpoint_id.in_(ep_ids),
            Delivery.status.in_(["failed", "retrying"]),
        )
        .group_by(Delivery.last_error, Delivery.last_status_code)
        .order_by(func.count(Delivery.id).desc())
        .limit(5)
    )
    failure_res = await db.execute(failure_stmt)
    top_failures = [
        FailureReasonItem(
            reason=str(row[0]),
            status_code=row[1],
            count=int(row[2]),
        )
        for row in failure_res.all()
    ]

    # 6. Circuit breaker stats
    circuits_open_stmt = select(func.count(Endpoint.id)).where(
        Endpoint.id.in_(ep_ids),
        Endpoint.circuit_state == "open",
    )
    circuits_open = (await db.execute(circuits_open_stmt)).scalar_one() or 0

    deliveries_held_stmt = (
        select(func.count(Delivery.id))
        .join(Event, Delivery.event_id == Event.id)
        .join(Endpoint, Event.endpoint_id == Endpoint.id)
        .where(
            Endpoint.id.in_(ep_ids),
            Endpoint.circuit_state == "open",
            Delivery.status.in_(["pending", "retrying"]),
        )
    )
    deliveries_held = (await db.execute(deliveries_held_stmt)).scalar_one() or 0

    return StatsSummaryResponse(
        total_events=total_events,
        total_deliveries=total_deliveries,
        delivered_count=delivered,
        failed_count=failed,
        retrying_count=retrying,
        queued_count=queued,
        success_rate_percent=success_rate,
        p95_latency_ms=p95_latency,
        avg_latency_ms=avg_latency,
        events_per_hour=events_per_hour,
        circuits_open=circuits_open,
        deliveries_held=deliveries_held,
        top_failure_reasons=top_failures,
    )



async def get_stats_timeseries(
    db: AsyncSession,
    user_id: str,
    endpoint_id: Optional[str] = None,
    hours: int = 24,
) -> StatsTimeseriesResponse:
    """Generate hourly timeseries buckets for events, deliveries, and latency trends."""
    ep_ids = await _get_authorized_endpoint_ids(db, user_id, endpoint_id)
    if not ep_ids:
        return StatsTimeseriesResponse(buckets=[], total_buckets=0)

    hours = min(max(hours, 6), 168)  # Clamp between 6 hours and 7 days
    now = datetime.now(timezone.utc)
    current_hour = now.replace(minute=0, second=0, microsecond=0)

    # 1. Fetch events in window
    start_time = current_hour - timedelta(hours=hours - 1)
    events_stmt = (
        select(Event.id, Event.received_at)
        .where(
            Event.endpoint_id.in_(ep_ids),
            Event.received_at >= start_time,
        )
    )
    events_res = await db.execute(events_stmt)
    raw_events = events_res.all()

    # 2. Fetch deliveries in window
    deliveries_stmt = (
        select(Delivery.status, Delivery.created_at, Delivery.latency_ms)
        .join(Event, Delivery.event_id == Event.id)
        .where(
            Event.endpoint_id.in_(ep_ids),
            Delivery.created_at >= start_time,
        )
    )
    deliveries_res = await db.execute(deliveries_stmt)
    raw_deliveries = deliveries_res.all()

    # Bucket into hours
    bucket_map: Dict[str, Dict[str, Any]] = {}
    for h in range(hours):
        bucket_dt = start_time + timedelta(hours=h)
        iso_key = bucket_dt.strftime("%Y-%m-%dT%H:00:00Z")
        bucket_map[iso_key] = {
            "total_events": 0,
            "delivered": 0,
            "failed": 0,
            "latencies": [],
        }

    # Aggregate events
    for _, received_at in raw_events:
        bucket_hour = received_at.replace(minute=0, second=0, microsecond=0)
        key = bucket_hour.strftime("%Y-%m-%dT%H:00:00Z")
        if key in bucket_map:
            bucket_map[key]["total_events"] += 1

    # Aggregate deliveries
    for status_val, created_at, latency in raw_deliveries:
        bucket_hour = created_at.replace(minute=0, second=0, microsecond=0)
        key = bucket_hour.strftime("%Y-%m-%dT%H:00:00Z")
        if key in bucket_map:
            if status_val == "delivered":
                bucket_map[key]["delivered"] += 1
            elif status_val == "failed":
                bucket_map[key]["failed"] += 1
            if latency is not None:
                bucket_map[key]["latencies"].append(int(latency))

    # Build final buckets
    buckets: List[TimeseriesBucket] = []
    for iso_key, data in bucket_map.items():
        lat_list = data["latencies"]
        if lat_list:
            lat_list.sort()
            avg_l = round(sum(lat_list) / len(lat_list), 1)
            p95_l = float(lat_list[min(int(0.95 * len(lat_list)), len(lat_list) - 1)])
        else:
            avg_l = 0.0
            p95_l = 0.0

        buckets.append(
            TimeseriesBucket(
                timestamp=iso_key,
                total_events=data["total_events"],
                delivered=data["delivered"],
                failed=data["failed"],
                avg_latency_ms=avg_l,
                p95_latency_ms=p95_l,
            )
        )

    return StatsTimeseriesResponse(
        buckets=buckets,
        interval="1h",
        total_buckets=len(buckets),
    )
