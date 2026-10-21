from datetime import datetime
from typing import Any, Dict, Optional, List
from pydantic import BaseModel, ConfigDict


class EventListItem(BaseModel):
    id: str
    endpoint_id: str
    received_at: datetime
    signature_valid: bool
    idempotency_key: Optional[str] = None
    headers_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class EventOut(BaseModel):
    id: str
    endpoint_id: str
    headers: Dict[str, Any]
    body: Any
    received_at: datetime
    signature_valid: bool
    idempotency_key: Optional[str] = None
    delivery_status: Optional[str] = None
    delivery_status_code: Optional[int] = None
    delivery_latency_ms: Optional[int] = None
    delivery_attempts: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)


class PaginatedEvents(BaseModel):
    items: List[EventOut]
    total: int
    limit: int
    offset: int


class IngestResponse(BaseModel):
    status: str = "accepted"
    event_id: str
    received_at: datetime
