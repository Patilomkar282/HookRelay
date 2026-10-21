from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class EndpointCreate(BaseModel):
    name: Optional[str] = Field(None, description="Optional friendly label for the endpoint")
    target_url: str = Field(..., description="Destination URL to forward webhooks to")
    provider_type: str = Field("custom", description="Provider type: custom, github, stripe, razorpay")


class EndpointUpdate(BaseModel):
    name: Optional[str] = None
    target_url: Optional[str] = None
    provider_type: Optional[str] = None
    is_active: Optional[bool] = None


class EndpointOut(BaseModel):
    id: str
    user_id: str
    slug: str
    target_url: str
    signing_secret: Optional[str] = None
    provider_type: str
    is_active: bool
    created_at: datetime
    events_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)
