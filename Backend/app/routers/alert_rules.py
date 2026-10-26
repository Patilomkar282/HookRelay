from typing import List, Optional
from fastapi import APIRouter, Depends, status, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.endpoint import Endpoint
from app.models.alert import AlertChannel, AlertRule
from app.schemas.alert_rule import AlertRuleCreate, AlertRuleUpdate, AlertRuleOut
from app.routers.alert_channels import check_feature_alerts_enabled

router = APIRouter(
    prefix="/alert-rules",
    tags=["Alert Rules"],
    dependencies=[Depends(check_feature_alerts_enabled)],
)


@router.post(
    "",
    response_model=AlertRuleOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create an alert rule on a mailbox endpoint",
)
async def create_rule(
    rule_in: AlertRuleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Register an alert rule tying an endpoint to a notification channel.
    Verifies that both the endpoint and channel belong to the authenticated user.
    """
    # 1. Verify endpoint ownership
    ep_stmt = select(Endpoint).where(
        Endpoint.id == rule_in.endpoint_id,
        Endpoint.user_id == current_user.id,
    )
    endpoint = (await db.execute(ep_stmt)).scalar_one_or_none()
    if not endpoint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Endpoint not found",
        )

    # 2. Verify channel ownership
    ch_stmt = select(AlertChannel).where(
        AlertChannel.id == rule_in.channel_id,
        AlertChannel.user_id == current_user.id,
    )
    channel = (await db.execute(ch_stmt)).scalar_one_or_none()
    if not channel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert channel not found",
        )

    # 3. Create rule
    rule = AlertRule(
        user_id=current_user.id,
        endpoint_id=rule_in.endpoint_id,
        channel_id=rule_in.channel_id,
        type=rule_in.type,
        params=rule_in.params,
        cooldown_minutes=rule_in.cooldown_minutes,
        enabled=rule_in.enabled,
        state="ok",
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)

    return AlertRuleOut(
        id=rule.id,
        user_id=rule.user_id,
        endpoint_id=rule.endpoint_id,
        channel_id=rule.channel_id,
        type=rule.type,
        params=rule.params,
        cooldown_minutes=rule.cooldown_minutes,
        enabled=rule.enabled,
        state=rule.state,
        state_changed_at=rule.state_changed_at,
        last_notified_at=rule.last_notified_at,
        created_at=rule.created_at,
        endpoint_name=endpoint.name or endpoint.slug,
        channel_name=channel.name,
        channel_type=channel.type,
    )


@router.get(
    "",
    response_model=List[AlertRuleOut],
    summary="List alert rules for the current user",
)
async def list_rules(
    endpoint_id: Optional[str] = Query(None, description="Filter rules by mailbox endpoint ID"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List alert rules owned by current user, optionally filtered by endpoint."""
    stmt = (
        select(AlertRule, Endpoint, AlertChannel)
        .join(Endpoint, AlertRule.endpoint_id == Endpoint.id)
        .join(AlertChannel, AlertRule.channel_id == AlertChannel.id)
        .where(AlertRule.user_id == current_user.id)
        .order_by(AlertRule.created_at.desc())
    )
    if endpoint_id:
        stmt = stmt.where(AlertRule.endpoint_id == endpoint_id)

    result = await db.execute(stmt)
    rows = result.all()

    rules_out = []
    for rule, ep, ch in rows:
        rules_out.append(
            AlertRuleOut(
                id=rule.id,
                user_id=rule.user_id,
                endpoint_id=rule.endpoint_id,
                channel_id=rule.channel_id,
                type=rule.type,
                params=rule.params,
                cooldown_minutes=rule.cooldown_minutes,
                enabled=rule.enabled,
                state=rule.state,
                state_changed_at=rule.state_changed_at,
                last_notified_at=rule.last_notified_at,
                created_at=rule.created_at,
                endpoint_name=ep.name or ep.slug,
                channel_name=ch.name,
                channel_type=ch.type,
            )
        )
    return rules_out


@router.patch(
    "/{id}",
    response_model=AlertRuleOut,
    summary="Update an alert rule",
)
async def update_rule(
    id: str,
    rule_in: AlertRuleUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update cooldown, enabled status, or params for an alert rule."""
    stmt = (
        select(AlertRule, Endpoint, AlertChannel)
        .join(Endpoint, AlertRule.endpoint_id == Endpoint.id)
        .join(AlertChannel, AlertRule.channel_id == AlertChannel.id)
        .where(
            AlertRule.id == id,
            AlertRule.user_id == current_user.id,
        )
    )
    res = await db.execute(stmt)
    row = res.first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert rule not found",
        )

    rule, ep, ch = row

    if rule_in.cooldown_minutes is not None:
        rule.cooldown_minutes = rule_in.cooldown_minutes
    if rule_in.enabled is not None:
        rule.enabled = rule_in.enabled
    if rule_in.params is not None:
        rule.params = {**rule.params, **rule_in.params}

    await db.commit()
    await db.refresh(rule)

    return AlertRuleOut(
        id=rule.id,
        user_id=rule.user_id,
        endpoint_id=rule.endpoint_id,
        channel_id=rule.channel_id,
        type=rule.type,
        params=rule.params,
        cooldown_minutes=rule.cooldown_minutes,
        enabled=rule.enabled,
        state=rule.state,
        state_changed_at=rule.state_changed_at,
        last_notified_at=rule.last_notified_at,
        created_at=rule.created_at,
        endpoint_name=ep.name or ep.slug,
        channel_name=ch.name,
        channel_type=ch.type,
    )


@router.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an alert rule",
)
async def delete_rule(
    id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an alert rule. Associated alert events are removed via cascade."""
    stmt = select(AlertRule).where(
        AlertRule.id == id,
        AlertRule.user_id == current_user.id,
    )
    rule = (await db.execute(stmt)).scalar_one_or_none()
    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert rule not found",
        )

    await db.delete(rule)
    await db.commit()
