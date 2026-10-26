from datetime import datetime
from typing import Optional, Literal
from urllib.parse import urlparse
from pydantic import BaseModel, ConfigDict, Field, model_validator


class AlertChannelCreate(BaseModel):
    type: Literal["slack", "email"]
    name: str = Field(..., min_length=1, max_length=128)
    webhook_url: Optional[str] = None

    @model_validator(mode="after")
    def validate_channel_config(self):
        if self.type == "slack":
            if not self.webhook_url or not self.webhook_url.strip():
                raise ValueError("webhook_url is required for Slack channels")
            parsed = urlparse(self.webhook_url.strip())
            if parsed.scheme.lower() != "https":
                raise ValueError("Slack webhook URL must use HTTPS scheme")
            # Strict hostname validation: exactly hooks.slack.com
            netloc = (parsed.netloc or "").split(":")[0].lower()
            if netloc != "hooks.slack.com":
                raise ValueError("Slack webhook URL must have hostname hooks.slack.com")
        elif self.type == "email":
            # Email goes only to user's registered email; ignore any user-supplied webhook_url
            self.webhook_url = None
        return self


class AlertChannelOut(BaseModel):
    id: str
    user_id: str
    type: str
    name: str
    verified_at: Optional[datetime] = None
    created_at: datetime
    hint: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AlertChannelVerify(BaseModel):
    code: str = Field(..., min_length=4, max_length=16)


class AlertChannelTestResponse(BaseModel):
    success: bool
    error: Optional[str] = None
    needs_verification: bool = False
    message: str
