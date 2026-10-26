from typing import List
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.alert_channel import (
    AlertChannelCreate,
    AlertChannelOut,
    AlertChannelVerify,
    AlertChannelTestResponse,
)
from app.services import alerting


def check_feature_alerts_enabled():
    """Ensure the alerts feature switch is active; return 404 if disabled."""
    if not settings.FEATURE_ALERTS:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerts feature is disabled",
        )


router = APIRouter(
    prefix="/alert-channels",
    tags=["Alert Channels"],
    dependencies=[Depends(check_feature_alerts_enabled)],
)


@router.post(
    "",
    response_model=AlertChannelOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an alert channel (Slack or Email)",
)
async def create_channel(
    channel_in: AlertChannelCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Register a notification channel.
    - Slack requires an HTTPS URL with hostname hooks.slack.com.
    - Email uses the authenticated user's email address.
    Destination secrets are encrypted with Fernet and never returned in plaintext.
    """
    return await alerting.create_alert_channel(db, current_user, channel_in)


@router.get(
    "",
    response_model=List[AlertChannelOut],
    summary="List alert channels for the current user",
)
async def list_channels(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all alert channels owned by current user. Only masked hints are returned."""
    return await alerting.get_user_alert_channels(db, current_user.id)


@router.post(
    "/{id}/test",
    response_model=AlertChannelTestResponse,
    summary="Send a test message to an alert channel",
)
async def test_channel(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Dispatch a test alert message.
    - Slack: sends test message; marks verified on success.
    - Email: sends confirmation code to user's registered email.
    Rate limited to 5 test alerts per minute per user.
    """
    return await alerting.test_alert_channel(db, current_user, id)


@router.post(
    "/{id}/verify",
    response_model=AlertChannelOut,
    summary="Verify an email alert channel with confirmation code",
)
async def verify_channel(
    id: str,
    verify_in: AlertChannelVerify,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify an email channel using the 6-digit confirmation code received in the test message."""
    return await alerting.verify_alert_channel(db, current_user, id, verify_in.code)


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an alert channel",
)
async def delete_channel(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an alert channel and all its associated alert rules."""
    await alerting.delete_alert_channel(db, current_user.id, id)
