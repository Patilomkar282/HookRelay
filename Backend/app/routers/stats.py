from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.stats import StatsSummaryResponse, StatsTimeseriesResponse
from app.services.stats_service import get_stats_summary, get_stats_timeseries
from app.services.retention_service import purge_expired_events

router = APIRouter(prefix="/stats", tags=["Analytics & Stats"])


@router.get(
    "/summary",
    response_model=StatsSummaryResponse,
    summary="Get aggregated statistics and KPIs for user webhooks",
)
async def get_summary(
    endpoint_id: Optional[str] = Query(None, description="Filter stats by specific endpoint ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve overall webhook delivery metrics including:
    - Success rate percentage
    - p95 latency and average latency
    - Events per hour throughput
    - Status breakdown (delivered, failed, retrying, queued)
    - Top failure reasons
    """
    return await get_stats_summary(
        db=db,
        user_id=current_user.id,
        endpoint_id=endpoint_id,
    )


@router.get(
    "/timeseries",
    response_model=StatsTimeseriesResponse,
    summary="Get hourly timeseries data for charts and graphs",
)
async def get_timeseries(
    endpoint_id: Optional[str] = Query(None, description="Filter timeseries by specific endpoint ID"),
    hours: int = Query(24, ge=6, le=168, description="Number of past hours to bucket (6-168)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve hourly event capture counts, successful deliveries, failed deliveries,
    and p95 latency trends for frontend charts.
    """
    return await get_stats_timeseries(
        db=db,
        user_id=current_user.id,
        endpoint_id=endpoint_id,
        hours=hours,
    )


@router.post(
    "/cleanup",
    status_code=status.HTTP_200_OK,
    summary="Trigger event retention policy cleanup (admin/maintenance)",
)
async def trigger_cleanup(
    retention_days: Optional[int] = Query(None, ge=1, description="Override retention days"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Manually trigger data retention policy cleanup to purge events older than retention_days.
    """
    purged_count = await purge_expired_events(db=db, retention_days=retention_days)
    return {
        "status": "success",
        "purged_count": purged_count,
        "retention_days": retention_days or 30,
    }
