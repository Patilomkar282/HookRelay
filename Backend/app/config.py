import re
from typing import List, Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "HookRelay"
    DEBUG: bool = True
    ENVIRONMENT: str = "development"
    API_V1_STR: str = "/api/v1"

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/hookrelay"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def clean_database_url(cls, v: str) -> str:
        if not v:
            return v
        url = str(v).strip()
        # Convert postgres:// or postgresql:// to postgresql+asyncpg://
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

        # Sanitize query parameters for asyncpg compatibility
        if "sslmode=" in url or "channel_binding=" in url:
            # Strip libpq-specific params that cause TypeError in asyncpg
            url = re.sub(r"[?&]channel_binding=[^&]*", "", url)
            url = re.sub(r"[?&]sslmode=[^&]*", "", url)
            url = url.rstrip("&").rstrip("?")
            if "?" not in url:
                url = f"{url}?ssl=require"
            else:
                url = f"{url}&ssl=require"
        return url

    SECRET_KEY: str = "hookrelay_super_secret_jwt_key_2026_dev_secure_token_min32bytes"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Security & Hardening Settings
    ENFORCE_HTTPS: bool = False
    ALLOW_PRIVATE_TARGETS: bool = True  # Allowed in local development for testing local mock servers
    EVENT_RETENTION_DAYS: int = 30
    INGEST_RATE_LIMIT_PER_MINUTE: int = 120

    # Circuit Breaker Configuration
    CB_FAILURE_THRESHOLD: int = 10
    CB_BASE_COOLDOWN_S: int = 120
    CB_MAX_COOLDOWN_S: int = 1800
    CB_PROBE_TTL_S: int = 30   # HTTP timeout (10s) + safety margin

    # Fernet Encryption Key (Required: boot fails if missing or invalid)
    ENCRYPTION_KEY: str

    @field_validator("ENCRYPTION_KEY")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        if not v or not str(v).strip():
            raise ValueError("ENCRYPTION_KEY is required and cannot be empty")
        key_str = str(v).strip()
        from cryptography.fernet import Fernet
        try:
            Fernet(key_str.encode())
        except Exception as e:
            raise ValueError(f"Invalid Fernet ENCRYPTION_KEY: {e}")
        return key_str

    # Email & Alerts
    EMAIL_API_KEY: Optional[str] = None
    EMAIL_FROM: Optional[str] = "alerts@hookrelay.dev"
    FRONTEND_URL: str = "http://localhost:5173"

    # Feature switches
    FEATURE_ALERTS: bool = True
    FEATURE_TUNNEL: bool = True
    FEATURE_RULES: bool = True

    # Alert User Limits & Retention
    ALERT_USER_HOURLY_LIMIT: int = 30
    RETENTION_DAYS: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
