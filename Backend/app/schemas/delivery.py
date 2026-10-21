from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class DeliveryOut(BaseModel):
    id: str
    event_id: str
    status: str  # 'pending', 'delivered', 'retrying', 'failed'
    attempt_count: int
    next_attempt_at: Optional[datetime] = None
    last_status_code: Optional[int] = None
    last_error: Optional[str] = None
    latency_ms: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReplayResponse(BaseModel):
    status: str
    delivery_id: str
    message: str


class BulkReplayResponse(BaseModel):
    replayed_count: int
    message: str
