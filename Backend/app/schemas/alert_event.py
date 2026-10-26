from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict


class AlertEventOut(BaseModel):
    id: int
    rule_id: str
    kind: str
    summary: Dict[str, Any] = {}
    status: str
    attempts: int
    next_try_at: Optional[datetime] = None
    error: Optional[str] = None
    created_at: datetime
    rule_type: Optional[str] = None
    channel_name: Optional[str] = None
    channel_type: Optional[str] = None
    mailbox_name: Optional[str] = None
    endpoint_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AlertEventsPaginated(BaseModel):
    items: List[AlertEventOut]
    total: int
    page: int
    limit: int
