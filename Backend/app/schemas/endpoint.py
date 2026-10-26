from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class EndpointCreate(BaseModel):
    name: Optional[str] = Field(None, max_length=128, description="Friendly name / label for the mailbox")
    description: Optional[str] = Field(None, description="Optional description or team notes")
    target_url: str = Field(..., description="Destination URL to forward webhooks to")
    provider_type: str = Field("custom", description="Provider type e.g. custom, github, stripe, razorpay, shopify, twilio, etc.")
    custom_signature_header: Optional[str] = Field(None, max_length=128, description="Optional custom HTTP header for HMAC signature")
    signing_secret: Optional[str] = Field(None, description="Optional existing signing secret. If omitted, a secure whsec_... is auto-generated")


class EndpointUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    target_url: Optional[str] = None
    provider_type: Optional[str] = None
    custom_signature_header: Optional[str] = None
    is_active: Optional[bool] = None


class EndpointOut(BaseModel):
    id: str
    user_id: str
    slug: str
    name: Optional[str] = None
    description: Optional[str] = None
    target_url: str
    signing_secret: Optional[str] = None
    provider_type: str
    custom_signature_header: Optional[str] = None
    is_active: bool
    created_at: datetime
    events_count: Optional[int] = 0

    # Circuit Breaker state
    circuit_state: str = "closed"
    consecutive_failures: int = 0
    open_count: int = 0
    circuit_open_until: Optional[datetime] = None

    # Feature 3: Rules version
    rules_version: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)

