from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class FailureReasonItem(BaseModel):
    reason: str
    status_code: Optional[int] = None
    count: int


class StatsSummaryResponse(BaseModel):
    total_events: int
    total_deliveries: int
    delivered_count: int
    failed_count: int
    retrying_count: int
    queued_count: int
    success_rate_percent: float = Field(..., description="Percentage of successfully delivered webhooks (0-100)")
    p95_latency_ms: float = Field(..., description="95th percentile latency in milliseconds")
    avg_latency_ms: float = Field(..., description="Average delivery latency in milliseconds")
    events_per_hour: float = Field(..., description="Throughput: average events captured per hour over last 24h")
    top_failure_reasons: List[FailureReasonItem] = Field(default_factory=list)


class TimeseriesBucket(BaseModel):
    timestamp: str  # ISO timestamp (e.g. "2026-10-22T04:00:00Z" or "04:00")
    total_events: int
    delivered: int
    failed: int
    avg_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0


class StatsTimeseriesResponse(BaseModel):
    buckets: List[TimeseriesBucket]
    interval: str = "1h"
    total_buckets: int
