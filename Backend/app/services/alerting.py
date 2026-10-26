import time
import secrets
from datetime import datetime, timezone
from typing import Optional, Tuple, Dict, Any, List
import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core import crypto
from app.models.user import User
from app.models.alert import AlertChannel, AlertRule
from app.schemas.alert_channel import (
    AlertChannelCreate,
    AlertChannelOut,
    AlertChannelTestResponse,
)

# In-memory user test rate limiter: user_id -> list of timestamps
_test_rate_limits: Dict[str, List[float]] = {}
TEST_RATE_LIMIT_PER_MINUTE = 5


def check_test_rate_limit(user_id: str) -> None:
    """Enforce rate limit of 5 test alerts per minute per user."""
    now = time.time()
    cutoff = now - 60.0
    history = _test_rate_limits.get(user_id, [])
    # Keep only timestamps in the last 60s
    valid_history = [t for t in history if t > cutoff]
    if len(valid_history) >= TEST_RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded: maximum 5 test alerts per minute per user",
        )
    valid_history.append(now)
    _test_rate_limits[user_id] = valid_history


async def send_slack(url: str, text: str) -> Tuple[bool, Optional[str]]:
    """
    Send outbound message to Slack webhook with 5s timeout and follow_redirects=False.
    Never raises an exception, always returns (success: bool, error_message: str | None).
    """
    try:
        async with httpx.AsyncClient(timeout=5, follow_redirects=False) as c:
            r = await c.post(url, json={"text": text})
        if r.status_code == 200:
            return True, None
        return False, f"HTTP {r.status_code}"
    except httpx.HTTPError as e:
        return False, type(e).__name__
    except Exception as e:
        return False, str(e)


async def send_email(to_email: str, subject: str, text: str) -> Tuple[bool, Optional[str]]:
    """
    Send outbound email via provider HTTPS API (Resend / Brevo) with 5s timeout and follow_redirects=False.
    Falls back gracefully to development log if EMAIL_API_KEY is unset.
    Never raises an exception, always returns (success: bool, error_message: str | None).
    """
    normalized_to = to_email.strip().lower()

    if not settings.EMAIL_API_KEY:
        # Development fallback when no external email API key is configured
        print(f"[HookRelay Email] To: {normalized_to} | Subject: {subject} | Body: {text}")
        return True, None

    try:
        async with httpx.AsyncClient(timeout=5, follow_redirects=False) as c:
            r = await c.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.EMAIL_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": settings.EMAIL_FROM or "alerts@hookrelay.dev",
                    "to": [normalized_to],
                    "subject": subject,
                    "text": text,
                },
            )
        if 200 <= r.status_code < 300:
            return True, None

        # Return detailed provider error message if available
        try:
            err_data = r.json()
            if isinstance(err_data, dict) and "message" in err_data:
                return False, err_data["message"]
        except Exception:
            pass

        return False, f"HTTP {r.status_code}"
    except httpx.HTTPError as e:
        return False, type(e).__name__
    except Exception as e:
        return False, str(e)


def channel_to_out(channel: AlertChannel) -> AlertChannelOut:
    """Format AlertChannel into AlertChannelOut exposing only a masked hint and NEVER secrets."""
    hint_val = "****"
    try:
        cfg = crypto.decrypt_json(channel.config_encrypted)
        if channel.type == "slack":
            hint_val = crypto.hint(cfg.get("webhook_url", ""))
        elif channel.type == "email":
            email_addr = cfg.get("email", "")
            if "@" in email_addr:
                parts = email_addr.split("@")
                hint_val = f"****@{parts[1]}"
            else:
                hint_val = crypto.hint(email_addr)
    except Exception:
        hint_val = "****"

    return AlertChannelOut(
        id=channel.id,
        user_id=channel.user_id,
        type=channel.type,
        name=channel.name,
        verified_at=channel.verified_at,
        created_at=channel.created_at,
        hint=hint_val,
    )


async def create_alert_channel(
    db: AsyncSession,
    user: User,
    channel_in: AlertChannelCreate,
) -> AlertChannelOut:
    """Create a new alert channel, encrypting the sensitive destination config with Fernet."""
    if channel_in.type == "slack":
        config = {"webhook_url": channel_in.webhook_url.strip()}
    else:
        # Strict security constraint: email goes ONLY to the logged-in user's email
        config = {"email": user.email.strip().lower()}

    encrypted_config = crypto.encrypt_json(config)

    channel = AlertChannel(
        user_id=user.id,
        type=channel_in.type,
        name=channel_in.name,
        config_encrypted=encrypted_config,
        verified_at=None,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return channel_to_out(channel)


async def get_user_alert_channels(
    db: AsyncSession,
    user_id: str,
) -> List[AlertChannelOut]:
    """Retrieve all alert channels owned by user, returning masked hints only."""
    stmt = (
        select(AlertChannel)
        .where(AlertChannel.user_id == user_id)
        .order_by(AlertChannel.created_at.desc())
    )
    result = await db.execute(stmt)
    channels = result.scalars().all()
    return [channel_to_out(c) for c in channels]


async def get_alert_channel_by_id(
    db: AsyncSession,
    user_id: str,
    channel_id: str,
) -> AlertChannel:
    """Retrieve an alert channel ensuring multi-tenant ownership check (returns 404 if not found)."""
    stmt = (
        select(AlertChannel)
        .where(
            AlertChannel.id == channel_id,
            AlertChannel.user_id == user_id,
        )
    )
    result = await db.execute(stmt)
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert channel not found",
        )
    return channel


async def test_alert_channel(
    db: AsyncSession,
    user: User,
    channel_id: str,
) -> AlertChannelTestResponse:
    """Send a test alert message. Enforces 5/min rate limit and ownership."""
    check_test_rate_limit(user.id)
    channel = await get_alert_channel_by_id(db, user.id, channel_id)

    cfg = crypto.decrypt_json(channel.config_encrypted)

    if channel.type == "slack":
        url = cfg.get("webhook_url", "")
        success, err = await send_slack(url, "HookRelay test message: Slack alerts are configured correctly!")
        if success and not channel.verified_at:
            channel.verified_at = datetime.now(timezone.utc)
            await db.commit()
        return AlertChannelTestResponse(
            success=success,
            error=err,
            needs_verification=False,
            message="Test message sent to Slack successfully" if success else f"Failed to send Slack test: {err}",
        )

    elif channel.type == "email":
        code = f"{secrets.randbelow(900000) + 100000}"  # 6-digit verification code
        cfg["verification_code"] = code
        cfg["code_generated_at"] = datetime.now(timezone.utc).isoformat()
        channel.config_encrypted = crypto.encrypt_json(cfg)
        await db.commit()

        success, err = await send_email(
            to_email=user.email.strip().lower(),
            subject="HookRelay Test & Verification Code",
            text=f"HookRelay test message. Your email alert verification code is: {code}",
        )
        return AlertChannelTestResponse(
            success=success,
            error=err,
            needs_verification=True,
            message=f"Verification code sent to {user.email}. Please enter the code to verify." if success else f"Failed to send verification email: {err}",
        )

    return AlertChannelTestResponse(
        success=False,
        error="Unsupported channel type",
        message="Unknown channel type",
    )


async def verify_alert_channel(
    db: AsyncSession,
    user: User,
    channel_id: str,
    code: str,
) -> AlertChannelOut:
    """Verify an email channel using the short confirmation code sent in the test message."""
    channel = await get_alert_channel_by_id(db, user.id, channel_id)
    cfg = crypto.decrypt_json(channel.config_encrypted)

    stored_code = cfg.get("verification_code")
    if not stored_code or stored_code.strip() != code.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code",
        )

    channel.verified_at = datetime.now(timezone.utc)
    cfg.pop("verification_code", None)
    cfg.pop("code_generated_at", None)
    channel.config_encrypted = crypto.encrypt_json(cfg)
    await db.commit()
    await db.refresh(channel)
    return channel_to_out(channel)


async def delete_alert_channel(
    db: AsyncSession,
    user_id: str,
    channel_id: str,
) -> None:
    """Delete an alert channel with ownership check. Cascades to delete its rules."""
    channel = await get_alert_channel_by_id(db, user_id, channel_id)
    await db.delete(channel)
    await db.commit()
