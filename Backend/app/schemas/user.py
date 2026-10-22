from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    retry_attempts: int = 3
    delivery_timeout: int = 15
    email_alerts: bool = True
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserProfileUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    retry_attempts: Optional[int] = Field(None, ge=1, le=10)
    delivery_timeout: Optional[int] = Field(None, ge=1, le=60)
    email_alerts: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, description="New password must be at least 6 characters")


class DeleteAccountRequest(BaseModel):
    password: str


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128, description="Name or label for the API Key")


class ApiKeyOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    created_at: datetime
    last_used_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ApiKeyCreatedResponse(ApiKeyOut):
    key: str  # Plaintext key only provided once upon creation


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
