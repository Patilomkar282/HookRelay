from datetime import datetime
from typing import List
from pydantic import BaseModel, ConfigDict


class CircuitEventOut(BaseModel):
    id: int
    endpoint_id: str
    from_state: str
    to_state: str
    reason: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedCircuitEvents(BaseModel):
    items: List[CircuitEventOut]
    total: int
    limit: int
    offset: int
