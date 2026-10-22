import secrets
import hashlib
from typing import Optional, List
from fastapi import APIRouter, Depends, status, Request, Form, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.user import (
    UserCreate,
    UserOut,
    Token,
    UserProfileUpdate,
    ChangePasswordRequest,
    DeleteAccountRequest,
    ApiKeyCreate,
    ApiKeyOut,
    ApiKeyCreatedResponse,
)
from app.services.auth_service import register_user, authenticate_user
from app.core.security import create_access_token, hash_password, verify_password
from app.core.deps import get_current_user
from app.models.user import User
from app.models.api_key import ApiKey
from app.models.endpoint import Endpoint
from app.models.event import Event

router = APIRouter(prefix="/auth", tags=["Authentication & User Settings"])


@router.post(
    "/register",
    response_model=Token,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new user with email and password.
    Returns the created user and a signed JWT access token.
    """
    user = await register_user(db, user_in)
    access_token = create_access_token(subject=user.id, extra_claims={"email": user.email})
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.post(
    "/login",
    response_model=Token,
    summary="Log in and retrieve JWT access token",
)
async def login(
    request: Request,
    db: AsyncSession = Depends(get_db),
    # Optional form fields for Swagger UI OAuth2 Authorize button
    username: Optional[str] = Form(None),
    password: Optional[str] = Form(None),
):
    """
    Authenticate with email/username and password.
    Supports both JSON body (for React frontend) and Form data (for Swagger UI /docs).
    """
    email_val = username
    password_val = password

    # If not form data, try parsing JSON body
    if not email_val or not password_val:
        try:
            body = await request.json()
            email_val = body.get("email") or body.get("username")
            password_val = body.get("password")
        except Exception:
            pass

    if not email_val or not password_val:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await authenticate_user(db, email=email_val, password=password_val)
    access_token = create_access_token(subject=user.id, extra_claims={"email": user.email})
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.get(
    "/me",
    response_model=UserOut,
    summary="Get current authenticated user profile",
)
async def read_users_me(
    current_user: User = Depends(get_current_user),
):
    """
    Returns the authenticated user details.
    Requires Bearer JWT token or API Key in Authorization header.
    """
    return UserOut.model_validate(current_user)


@router.patch(
    "/profile",
    response_model=UserOut,
    summary="Update user profile and delivery preferences",
)
async def update_profile(
    profile_in: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update profile attributes and global delivery defaults."""
    if profile_in.email is not None and str(profile_in.email).strip():
        new_email = str(profile_in.email).strip().lower()
        if new_email != current_user.email:
            existing_stmt = select(User).where(User.email == new_email)
            existing_user = (await db.execute(existing_stmt)).scalar_one_or_none()
            if existing_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This email address is already in use by another account.",
                )
            current_user.email = new_email

    if profile_in.full_name is not None:
        current_user.full_name = profile_in.full_name.strip() or None
    if profile_in.retry_attempts is not None:
        current_user.retry_attempts = profile_in.retry_attempts
    if profile_in.delivery_timeout is not None:
        current_user.delivery_timeout = profile_in.delivery_timeout
    if profile_in.email_alerts is not None:
        current_user.email_alerts = profile_in.email_alerts

    await db.commit()
    await db.refresh(current_user)
    return UserOut.model_validate(current_user)


@router.post(
    "/change-password",
    summary="Change account password",
)
async def change_password(
    pwd_in: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify current password and set a newly hashed password."""
    if not verify_password(pwd_in.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    current_user.password_hash = hash_password(pwd_in.new_password)
    await db.commit()
    return {"message": "Password changed successfully"}


# ============================================================================
# API KEY MANAGEMENT
# ============================================================================

@router.get(
    "/api-keys",
    response_model=List[ApiKeyOut],
    summary="List all personal API keys",
)
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List active API keys created by the current user."""
    stmt = (
        select(ApiKey)
        .where(ApiKey.user_id == current_user.id)
        .order_by(ApiKey.created_at.desc())
    )
    result = await db.execute(stmt)
    keys = result.scalars().all()
    return [ApiKeyOut.model_validate(k) for k in keys]


@router.post(
    "/api-keys",
    response_model=ApiKeyCreatedResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new personal API key",
)
async def create_api_key(
    key_in: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a new API key.
    The plaintext secret is returned ONLY ONCE in this response.
    """
    random_secret = secrets.token_urlsafe(32)
    raw_key = f"hr_live_{random_secret}"
    key_prefix = f"hr_live_{random_secret[:6]}..."
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()

    api_key_obj = ApiKey(
        user_id=current_user.id,
        name=key_in.name.strip(),
        key_prefix=key_prefix,
        key_hash=key_hash,
    )
    db.add(api_key_obj)
    await db.commit()
    await db.refresh(api_key_obj)

    return ApiKeyCreatedResponse(
        id=api_key_obj.id,
        name=api_key_obj.name,
        key_prefix=api_key_obj.key_prefix,
        created_at=api_key_obj.created_at,
        last_used_at=api_key_obj.last_used_at,
        key=raw_key,
    )


@router.delete(
    "/api-keys/{key_id}",
    summary="Revoke an API key",
)
async def delete_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete / revoke an API key."""
    stmt = select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    result = await db.execute(stmt)
    key_obj = result.scalar_one_or_none()

    if not key_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API Key not found",
        )

    await db.delete(key_obj)
    await db.commit()
    return {"message": "API key revoked successfully"}


# ============================================================================
# DANGER ZONE
# ============================================================================

@router.post(
    "/danger/purge-events",
    summary="Purge all webhook events across all user endpoints",
)
async def purge_all_events(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete all captured events and delivery attempts for all endpoints owned by current user."""
    endpoint_ids_subq = select(Endpoint.id).where(Endpoint.user_id == current_user.id)
    del_stmt = delete(Event).where(Event.endpoint_id.in_(endpoint_ids_subq))
    result = await db.execute(del_stmt)
    await db.commit()
    return {
        "message": "All events successfully purged",
        "purged_count": result.rowcount if hasattr(result, "rowcount") else 0,
    }


@router.post(
    "/danger/delete-account",
    summary="Permanently delete user account and all data",
)
async def delete_account(
    del_in: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete the user account, cascading to all endpoints, events, and API keys."""
    if not verify_password(del_in.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password. Account deletion aborted.",
        )

    await db.delete(current_user)
    await db.commit()
    return {"message": "Account deleted successfully"}
