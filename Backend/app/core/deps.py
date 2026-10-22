import hashlib
from datetime import datetime, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.security import decode_token
from app.models.user import User
from app.models.api_key import ApiKey

# OAuth2 scheme pointing to our login endpoint
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/v1/auth/login",
    auto_error=False,
)


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency that extracts and validates JWT or API key from request, returning authenticated user."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    raw_token = token
    if not raw_token:
        # Check Authorization header directly (handles raw tokens or non-standard schemes)
        auth_hdr = request.headers.get("Authorization") or request.headers.get("authorization")
        if auth_hdr:
            if auth_hdr.lower().startswith("bearer "):
                raw_token = auth_hdr[7:].strip()
            else:
                raw_token = auth_hdr.strip()

        # Check X-API-Key header (standard for webhooks and developer APIs)
        if not raw_token:
            raw_token = request.headers.get("X-API-Key") or request.headers.get("x-api-key")

    if not raw_token:
        raise credentials_exception

    # Support API key authentication via Bearer header or X-API-Key
    if raw_token.startswith("hr_live_"):
        key_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        stmt = select(ApiKey).where(ApiKey.key_hash == key_hash)
        res = await db.execute(stmt)
        api_key_obj = res.scalar_one_or_none()
        if not api_key_obj:
            raise credentials_exception

        # Update last_used_at timestamp
        api_key_obj.last_used_at = datetime.now(timezone.utc)
        await db.commit()

        user_stmt = select(User).where(User.id == api_key_obj.user_id)
        user_res = await db.execute(user_stmt)
        user = user_res.scalar_one_or_none()
        if not user:
            raise credentials_exception
        return user

    # Standard JWT token
    payload = decode_token(raw_token)
    if not payload:
        raise credentials_exception

    user_id: Optional[str] = payload.get("sub")
    if not user_id:
        raise credentials_exception

    # Query user from database
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    return user
