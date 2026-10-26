import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, Dict, Any, List
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core import crypto
from app.database import AsyncSessionLocal
from app.models.alert import AlertEvent, AlertRule, AlertChannel
from app.models.endpoint import Endpoint
from app.services.alerting import send_slack, send_email

logger = logging.getLogger("hookrelay.alert_dispatcher")

# Backoff schedule: +10s after 1st try, +30s after 2nd try, then 2min
ALERT_RETRY_DELAYS = [10, 30, 120]
MAX_ALERT_ATTEMPTS = 3

# Global wake event for instant alert triggering
_wake_event: Optional[asyncio.Event] = None


def get_wake_event() -> asyncio.Event:
    global _wake_event
    if _wake_event is None:
        _wake_event = asyncio.Event()
    return _wake_event


def notify_new_alert_event() -> None:
    """Wake the alert dispatcher immediately when a new pending AlertEvent is created."""
    try:
        ev = get_wake_event()
        ev.set()
    except Exception:
        pass


def build_alert_message(
    event: AlertEvent,
    rule: AlertRule,
    channel: AlertChannel,
    endpoint: Optional[Endpoint] = None,
) -> Tuple[str, str]:
    """
    Construct notification message strictly from an allow-list of safe attributes:
    mailbox name, rule type, numbers, top error kind, and frontend link.
    Headers, request bodies, tokens, and channel URLs are NEVER included.
    Returns (subject, message_text).
    """
    summary = event.summary or {}

    # 1. Mailbox name (from endpoint or safe summary allow-list)
    mailbox_name = "Unknown Mailbox"
    if endpoint and endpoint.name:
        mailbox_name = endpoint.name
    elif endpoint and endpoint.slug:
        mailbox_name = endpoint.slug
    elif "mailbox_name" in summary:
        mailbox_name = str(summary["mailbox_name"])
    elif "slug" in summary:
        mailbox_name = str(summary["slug"])

    endpoint_id = endpoint.id if endpoint else summary.get("endpoint_id", "")
    rule_type = rule.type if rule else summary.get("rule_type", "alert_rule")
    kind = event.kind.lower() if event.kind else "fired"

    # 2. Extract numbers
    total_attempts = summary.get("total_attempts")
    failed_attempts = summary.get("failed_attempts")
    dead_letter_count = summary.get("dead_letter_count")

    # 3. Top error kind
    top_error = summary.get("most_common_error")
    if not top_error and summary.get("most_common_status"):
        top_error = f"HTTP {summary.get('most_common_status')}"
    top_error_str = str(top_error) if top_error else "N/A"

    # 4. Safe links (never contain credentials or payload)
    base_url = settings.FRONTEND_URL.rstrip("/")
    if endpoint_id:
        failed_events_link = f"{base_url}/endpoints/{endpoint_id}?filter=failed"
        mailbox_link = f"{base_url}/endpoints/{endpoint_id}"
    else:
        failed_events_link = f"{base_url}/endpoints"
        mailbox_link = f"{base_url}/endpoints"

    # 5. Formulate strictly typed message content
    if kind == "recovered":
        subject = f"[HookRelay Alert: RECOVERED] {mailbox_name} - {rule_type}"
        text = (
            f"HookRelay Alert: RECOVERED\n"
            f"Mailbox: {mailbox_name}\n"
            f"Rule: {rule_type}\n"
            f"Status: Deliveries have resumed successfully.\n"
            f"View Mailbox: {mailbox_link}"
        )
    elif kind == "summary":
        subject = f"[HookRelay Alert: DEAD LETTER] {mailbox_name}"
        dl_count_str = str(dead_letter_count) if dead_letter_count is not None else "Multiple"
        text = (
            f"HookRelay Alert: DEAD LETTER SUMMARY\n"
            f"Mailbox: {mailbox_name}\n"
            f"Rule: dead_letter\n"
            f"Permanent Failures: {dl_count_str} deliveries failed permanently after all retries.\n"
            f"View Failed Events: {failed_events_link}"
        )
    elif kind == "reminder":
        subject = f"[HookRelay Alert: REMINDER] {mailbox_name} - {rule_type}"
        num_str = f"{failed_attempts}/{total_attempts}" if total_attempts is not None else "Outage ongoing"
        text = (
            f"HookRelay Alert: REMINDER (Still Firing)\n"
            f"Mailbox: {mailbox_name}\n"
            f"Rule: {rule_type}\n"
            f"Failures: {num_str} failed\n"
            f"Top Error: {top_error_str}\n"
            f"View Failed Events: {failed_events_link}"
        )
    else:  # fired
        subject = f"[HookRelay Alert: FIRING] {mailbox_name} - {rule_type}"
        num_str = f"{failed_attempts}/{total_attempts}" if total_attempts is not None else "Outage detected"
        text = (
            f"HookRelay Alert: FIRING\n"
            f"Mailbox: {mailbox_name}\n"
            f"Rule: {rule_type}\n"
            f"Failures: {num_str} failed\n"
            f"Top Error: {top_error_str}\n"
            f"View Failed Events: {failed_events_link}"
        )

    return subject, text


async def process_single_alert(db: AsyncSession, event_id: int) -> bool:
    """
    Process a single pending alert event:
    1. Check hourly rate limit for the owner user (limit: ALERT_USER_HOURLY_LIMIT).
    2. Decrypt destination config from the channel.
    3. Build safe message and dispatch via send_slack or send_email.
    4. Set status='sent' on success, or retry with backoff (+10s, +30s, 2m) up to 3 tries.
    """
    now = datetime.now(timezone.utc)

    # 1. Fetch AlertEvent with eager load
    stmt = (
        select(AlertEvent)
        .options(
            selectinload(AlertEvent.rule).selectinload(AlertRule.channel)
        )
        .where(AlertEvent.id == event_id)
    )
    bind = db.get_bind()
    if bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)

    result = await db.execute(stmt)
    event = result.scalar_one_or_none()
    if not event or event.status != "pending":
        return False

    rule = event.rule
    if not rule:
        event.status = "send_failed"
        event.error = "Associated alert rule not found"
        event.next_try_at = None
        await db.commit()
        return False

    # 2. Hourly rate limit check (count sent alerts for this user in last 60 minutes)
    one_hour_ago = now - timedelta(hours=1)
    limit_stmt = (
        select(func.count(AlertEvent.id))
        .join(AlertRule, AlertEvent.rule_id == AlertRule.id)
        .where(
            AlertRule.user_id == rule.user_id,
            AlertEvent.status == "sent",
            AlertEvent.created_at >= one_hour_ago,
        )
    )
    sent_count = (await db.execute(limit_stmt)).scalar() or 0
    if sent_count >= settings.ALERT_USER_HOURLY_LIMIT:
        event.status = "send_failed"
        event.error = "rate_limited"
        event.next_try_at = None
        await db.commit()
        logger.warning(
            "User %s exceeded hourly alert rate limit (%d sent). Alert %d marked send_failed.",
            rule.user_id,
            sent_count,
            event.id,
        )
        return False

    # 3. Channel resolution & decryption
    channel = rule.channel
    if not channel:
        event.status = "send_failed"
        event.error = "Alert channel not found"
        event.next_try_at = None
        await db.commit()
        return False

    try:
        config = crypto.decrypt_json(channel.config_encrypted)
    except Exception as exc:
        event.status = "send_failed"
        event.error = f"Failed to decrypt channel config: {exc}"
        event.next_try_at = None
        await db.commit()
        return False

    # 4. Fetch endpoint for mailbox name if available
    endpoint = None
    if rule.endpoint_id:
        ep_res = await db.execute(select(Endpoint).where(Endpoint.id == rule.endpoint_id))
        endpoint = ep_res.scalar_one_or_none()

    subject, message_text = build_alert_message(event, rule, channel, endpoint)

    # 5. Dispatch message via channel sender
    success = False
    error_msg = None

    if channel.type == "slack":
        webhook_url = config.get("webhook_url", "")
        success, error_msg = await send_slack(webhook_url, message_text)
    elif channel.type == "email":
        to_email = config.get("email", "")
        success, error_msg = await send_email(to_email, subject, message_text)
    else:
        success = False
        error_msg = f"Unknown channel type: {channel.type}"

    # 6. Atomic state update
    if success:
        event.status = "sent"
        event.error = None
        event.next_try_at = None
        await db.commit()
        logger.info("Alert %d successfully sent via channel %s (%s)", event.id, channel.name, channel.type)
        return True
    else:
        event.attempts += 1
        event.error = error_msg or "Dispatch failed"
        if event.attempts >= MAX_ALERT_ATTEMPTS:
            event.status = "send_failed"
            event.next_try_at = None
            logger.warning("Alert %d failed after %d attempts: %s", event.id, event.attempts, error_msg)
        else:
            delay_sec = ALERT_RETRY_DELAYS[min(event.attempts - 1, len(ALERT_RETRY_DELAYS) - 1)]
            event.next_try_at = now + timedelta(seconds=delay_sec)
            logger.info("Alert %d attempt %d failed: %s. Retrying in %ds", event.id, event.attempts, error_msg, delay_sec)
        await db.commit()
        return False


async def dispatch_due_alerts(db: AsyncSession, batch_size: int = 20) -> int:
    """
    Pick due pending alert events using SELECT ... FOR UPDATE SKIP LOCKED
    and dispatch them.
    """
    now = datetime.now(timezone.utc)
    stmt = (
        select(AlertEvent.id)
        .where(
            AlertEvent.status == "pending",
            AlertEvent.next_try_at <= now,
        )
        .order_by(AlertEvent.next_try_at.asc())
        .limit(batch_size)
    )
    bind = db.get_bind()
    if bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)

    result = await db.execute(stmt)
    due_ids = list(result.scalars().all())

    dispatched = 0
    for aid in due_ids:
        try:
            await process_single_alert(db, aid)
            dispatched += 1
        except Exception as exc:
            logger.error("Error dispatching alert event %d: %s", aid, exc)

    return dispatched


class AlertDispatcher:
    def __init__(self, poll_interval: float = 15.0):
        self.poll_interval = poll_interval
        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    async def run(self) -> None:
        logger.info("HookRelay alert dispatcher started (fallback poll=%.1fs)...", self.poll_interval)
        wake = get_wake_event()
        while not self._stop_event.is_set():
            try:
                async with AsyncSessionLocal() as session:
                    processed = await dispatch_due_alerts(session, batch_size=20)
                    if processed > 0:
                        logger.debug("Dispatched %d alert events", processed)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Unexpected error in alert dispatcher loop: %s", exc)

            try:
                # Wait for wake event OR poll timeout
                await asyncio.wait_for(wake.wait(), timeout=self.poll_interval)
                wake.clear()
            except asyncio.TimeoutError:
                pass

        logger.info("HookRelay alert dispatcher stopped.")

    def start(self) -> None:
        if not self._task or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self.run())

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._stop_event.set()
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


alert_dispatcher = AlertDispatcher(poll_interval=15.0)
