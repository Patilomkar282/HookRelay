from datetime import datetime
from typing import Optional, Literal, Dict, Any
from pydantic import BaseModel, ConfigDict, Field, model_validator


class ConsecutiveFailuresParams(BaseModel):
    n: int = Field(default=5, ge=1, le=100)


class FailureRateParams(BaseModel):
    window_minutes: int = Field(default=15, ge=1, le=1440)
    percent: int = Field(default=50, ge=1, le=100)
    min_attempts: int = Field(default=10, ge=1, le=1000)


class DeadLetterParams(BaseModel):
    pass


class AlertRuleCreate(BaseModel):
    endpoint_id: str
    channel_id: str
    type: Literal["consecutive_failures", "failure_rate", "dead_letter"]
    cooldown_minutes: int = Field(default=30, ge=1, le=1440)
    enabled: bool = True
    params: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_params_by_type(self):
        if self.type == "consecutive_failures":
            validated = ConsecutiveFailuresParams(**self.params)
            self.params = validated.model_dump()
        elif self.type == "failure_rate":
            validated = FailureRateParams(**self.params)
            self.params = validated.model_dump()
        elif self.type == "dead_letter":
            self.params = {}
        return self


class AlertRuleUpdate(BaseModel):
    cooldown_minutes: Optional[int] = Field(None, ge=1, le=1440)
    enabled: Optional[bool] = None
    params: Optional[Dict[str, Any]] = None


class AlertRuleOut(BaseModel):
    id: str
    user_id: str
    endpoint_id: str
    channel_id: str
    type: str
    params: Dict[str, Any]
    cooldown_minutes: int
    enabled: bool
    state: str
    state_changed_at: Optional[datetime] = None
    last_notified_at: Optional[datetime] = None
    created_at: datetime
    endpoint_name: Optional[str] = None
    channel_name: Optional[str] = None
    channel_type: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
