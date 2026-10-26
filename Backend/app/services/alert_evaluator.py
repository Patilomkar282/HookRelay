import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from collections import Counter
from sqlalchemy import select, update, or_, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.alert import AlertRule, AlertEvent, AlertChannel
from app.models.endpoint import Endpoint
from app.models.delivery import Delivery
from app.models.delivery_attempt import DeliveryAttempt
from app.services.alert_dispatcher import notify_new_alert_event


def _is_success(attempt: Any) -> bool:
    """Helper to extract boolean success status from an object, dict, or bool."""
    if isinstance(attempt, bool):
        return attempt
    if isinstance(attempt, dict):
        return bool(attempt.get("success", False))
    return bool(getattr(attempt, "success", False))


def _get_error_kind(attempt: Any) -> Optional[str]:
    """Helper to extract error_kind from an attempt record."""
    if isinstance(attempt, dict):
        return attempt.get("error_kind")
    return getattr(attempt, "error_kind", None)


def _get_status_code(attempt: Any) -> Optional[int]:
    """Helper to extract status_code from an attempt record."""
    if isinstance(attempt, dict):
        return attempt.get("status_code")
    return getattr(attempt, "status_code", None)


def is_true(
    rule_type: str,
    params: Dict[str, Any],
    attempts: List[Any],
    current_state: str = "ok",
) -> bool:
    """
    Pure evaluation function. Evaluates whether a rule's condition is met.
    Works on plain Python lists and can be unit tested without a database.
    """
    if rule_type == "consecutive_failures":
        if current_state == "firing":
            # Recovers when: the latest attempt succeeded
            if len(attempts) > 0 and _is_success(attempts[0]):
                return False
            return True
        else:
            # Fires when: the last N attempts on the mailbox all failed
            n = int(params.get("n", 5))
            # Rule requires at least N attempts. If fewer than N, not enough data -> False
            if len(attempts) < n:
                return False
            recent = attempts[:n]
            return len(recent) == n and all(not _is_success(a) for a in recent)

    elif rule_type == "failure_rate":
        percent = float(params.get("percent", 50))
        min_attempts = int(params.get("min_attempts", 10))
        total = len(attempts)

        # Silence is not recovery: if traffic is below min_attempts, keep current state
        if total < min_attempts:
            return current_state == "firing"

        failed_count = sum(1 for a in attempts if not _is_success(a))
        rate = (failed_count / total) * 100.0
        return rate > percent

    elif rule_type == "dead_letter":
        # Dead letter is handled via event-driven summaries
        return False

    return False


def build_alert_summary(
    endpoint: Endpoint,
    rule: AlertRule,
    kind: str,
    attempts: List[Any],
    dead_letter_count: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Construct summary JSON content for the alert event outbox.
    Never includes raw payload bodies or secrets.
    """
    total = len(attempts)
    failed = sum(1 for a in attempts if not _is_success(a))

    error_kinds = [_get_error_kind(a) for a in attempts if _get_error_kind(a)]
    status_codes = [_get_status_code(a) for a in attempts if _get_status_code(a)]

    most_common_error = Counter(error_kinds).most_common(1)
    most_common_status = Counter(status_codes).most_common(1)

    error_summary = most_common_error[0][0] if most_common_error else None
    status_summary = most_common_status[0][0] if most_common_status else None

    summary = {
        "endpoint_id": endpoint.id,
        "mailbox_name": endpoint.name or endpoint.slug,
        "slug": endpoint.slug,
        "rule_type": rule.type,
        "kind": kind,
        "total_attempts": total,
        "failed_attempts": failed,
        "most_common_error": error_summary,
        "most_common_status": status_summary,
        "link": f"{settings.FRONTEND_URL}/endpoints",
    }

    if dead_letter_count is not None:
        summary["dead_letter_count"] = dead_letter_count

    return summary


async def evaluate_rules_for_endpoint(
    db: AsyncSession,
    endpoint_id: str,
) -> List[int]:
    """
    Evaluate all enabled alert rules for a specific endpoint.
    Executes atomic state changes and writes to the alert_events outbox.
    Returns list of generated AlertEvent IDs.
    """
    now = datetime.now(timezone.utc)

    # 1. Fetch endpoint
    ep_stmt = select(Endpoint).where(Endpoint.id == endpoint_id)
    ep_res = await db.execute(ep_stmt)
    endpoint = ep_res.scalar_one_or_none()
    if not endpoint:
        return []

    # 2. Fetch active rules for this endpoint
    rules_stmt = (
        select(AlertRule)
        .where(
            AlertRule.endpoint_id == endpoint_id,
            AlertRule.enabled == True,
            AlertRule.type.in_(["consecutive_failures", "failure_rate"]),
        )
    )
    rules_res = await db.execute(rules_stmt)
    rules = rules_res.scalars().all()
    if not rules:
        return []

    created_event_ids: List[int] = []

    for rule in rules:
        # Query relevant attempts from delivery_attempts table
        if rule.type == "consecutive_failures":
            n = int(rule.params.get("n", 5))
            att_stmt = (
                select(DeliveryAttempt)
                .where(DeliveryAttempt.endpoint_id == endpoint_id)
                .order_by(DeliveryAttempt.attempted_at.desc())
                .limit(n)
            )
            att_res = await db.execute(att_stmt)
            attempts = list(att_res.scalars().all())

        elif rule.type == "failure_rate":
            window_minutes = int(rule.params.get("window_minutes", 15))
            cutoff = now - timedelta(minutes=window_minutes)
            att_stmt = (
                select(DeliveryAttempt)
                .where(
                    DeliveryAttempt.endpoint_id == endpoint_id,
                    DeliveryAttempt.attempted_at >= cutoff,
                )
                .order_by(DeliveryAttempt.attempted_at.desc())
            )
            att_res = await db.execute(att_stmt)
            attempts = list(att_res.scalars().all())
        else:
            continue

        rule_is_true = is_true(rule.type, rule.params, attempts, current_state=rule.state)

        # State transition decision:
        # Case 1: ok -> firing (Condition met)
        if rule_is_true and rule.state == "ok":
            stmt = (
                update(AlertRule)
                .where(
                    AlertRule.id == rule.id,
                    AlertRule.state == "ok",
                    AlertRule.enabled == True,
                )
                .values(
                    state="firing",
                    state_changed_at=now,
                    last_notified_at=now,
                )
                .returning(AlertRule.id)
                .execution_options(synchronize_session=False)
            )
            res = await db.execute(stmt)
            updated_id = res.scalar_one_or_none()
            if updated_id:
                summary = build_alert_summary(endpoint, rule, "fired", attempts)
                event = AlertEvent(
                    rule_id=updated_id,
                    kind="fired",
                    summary=summary,
                    status="pending",
                    attempts=0,
                    next_try_at=now,
                )
                db.add(event)
                await db.commit()
                created_event_ids.append(event.id)
                notify_new_alert_event()

        # Case 2: firing -> ok (Recovered)
        elif not rule_is_true and rule.state == "firing":
            stmt = (
                update(AlertRule)
                .where(
                    AlertRule.id == rule.id,
                    AlertRule.state == "firing",
                    AlertRule.enabled == True,
                )
                .values(
                    state="ok",
                    state_changed_at=now,
                    last_notified_at=now,
                )
                .returning(AlertRule.id)
                .execution_options(synchronize_session=False)
            )
            res = await db.execute(stmt)
            updated_id = res.scalar_one_or_none()
            if updated_id:
                summary = build_alert_summary(endpoint, rule, "recovered", attempts)
                event = AlertEvent(
                    rule_id=updated_id,
                    kind="recovered",
                    summary=summary,
                    status="pending",
                    attempts=0,
                    next_try_at=now,
                )
                db.add(event)
                await db.commit()
                created_event_ids.append(event.id)
                notify_new_alert_event()

        # Case 3: firing -> reminder (Still firing, cooldown has elapsed)
        elif rule_is_true and rule.state == "firing":
            cooldown_cutoff = now - timedelta(minutes=rule.cooldown_minutes)
            stmt = (
                update(AlertRule)
                .where(
                    AlertRule.id == rule.id,
                    AlertRule.state == "firing",
                    AlertRule.enabled == True,
                    or_(
                        AlertRule.last_notified_at.is_(None),
                        AlertRule.last_notified_at <= cooldown_cutoff,
                    ),
                )
                .values(
                    last_notified_at=now,
                )
                .returning(AlertRule.id)
                .execution_options(synchronize_session=False)
            )
            res = await db.execute(stmt)
            updated_id = res.scalar_one_or_none()
            if updated_id:
                summary = build_alert_summary(endpoint, rule, "reminder", attempts)
                event = AlertEvent(
                    rule_id=updated_id,
                    kind="reminder",
                    summary=summary,
                    status="pending",
                    attempts=0,
                    next_try_at=now,
                )
                db.add(event)
                await db.commit()
                created_event_ids.append(event.id)
                notify_new_alert_event()

    return created_event_ids


async def evaluate_dead_letter(
    db: AsyncSession,
    endpoint_id: str,
) -> List[int]:
    """
    Evaluate dead_letter alert rules when a delivery exhausts all retries and transitions to 'failed'.
    Creates at most one summary alert per cooldown window.
    """
    now = datetime.now(timezone.utc)

    # 1. Fetch endpoint
    ep_stmt = select(Endpoint).where(Endpoint.id == endpoint_id)
    endpoint = (await db.execute(ep_stmt)).scalar_one_or_none()
    if not endpoint:
        return []

    # 2. Fetch dead_letter rules
    rules_stmt = (
        select(AlertRule)
        .where(
            AlertRule.endpoint_id == endpoint_id,
            AlertRule.enabled == True,
            AlertRule.type == "dead_letter",
        )
    )
    rules = list((await db.execute(rules_stmt)).scalars().all())
    if not rules:
        return []

    created_event_ids = []

    for rule in rules:
        cooldown_cutoff = now - timedelta(minutes=rule.cooldown_minutes)

        # Atomic check-and-update on cooldown
        stmt = (
            update(AlertRule)
            .where(
                AlertRule.id == rule.id,
                AlertRule.enabled == True,
                or_(
                    AlertRule.last_notified_at.is_(None),
                    AlertRule.last_notified_at <= cooldown_cutoff,
                ),
            )
            .values(last_notified_at=now)
            .returning(AlertRule.id)
            .execution_options(synchronize_session=False)
        )
        res = await db.execute(stmt)
        updated_id = res.scalar_one_or_none()

        if updated_id:
            # Count failed deliveries since last notification
            since_time = rule.last_notified_at or (now - timedelta(minutes=rule.cooldown_minutes))
            count_stmt = (
                select(func.count(Delivery.id))
                .join(Endpoint, Delivery.event_id == Endpoint.id, isouter=True)  # deliveries join via events
            )
            # Correct join: deliveries -> events -> endpoints
            from app.models.event import Event
            count_stmt = (
                select(func.count(Delivery.id))
                .join(Event, Delivery.event_id == Event.id)
                .where(
                    Event.endpoint_id == endpoint_id,
                    Delivery.status == "failed",
                    Delivery.updated_at >= since_time,
                )
            )
            dead_letter_count = (await db.execute(count_stmt)).scalar() or 1

            summary = build_alert_summary(
                endpoint=endpoint,
                rule=rule,
                kind="summary",
                attempts=[],
                dead_letter_count=dead_letter_count,
            )
            event = AlertEvent(
                rule_id=updated_id,
                kind="summary",
                summary=summary,
                status="pending",
                attempts=0,
                next_try_at=now,
            )
            db.add(event)
            await db.commit()
            created_event_ids.append(event.id)
            notify_new_alert_event()

    return created_event_ids


async def check_firing_rules_periodic(db: AsyncSession) -> int:
    """
    60-second periodic timer evaluator.
    First checks: SELECT 1 FROM alert_rules WHERE state = 'firing' AND enabled LIMIT 1.
    If nothing is firing, does NO database work.
    If any rules are firing, checks for recovery and reminders.
    """
    # Guard query: does any rule need recovery or reminder evaluation?
    check_stmt = (
        select(AlertRule.id)
        .where(
            AlertRule.state == "firing",
            AlertRule.enabled == True,
        )
        .limit(1)
    )
    has_firing = (await db.execute(check_stmt)).scalar_one_or_none()
    if not has_firing:
        return 0

    # Fetch all endpoints that have firing enabled rules
    ep_stmt = (
        select(AlertRule.endpoint_id)
        .where(
            AlertRule.state == "firing",
            AlertRule.enabled == True,
        )
        .distinct()
    )
    endpoint_ids = list((await db.execute(ep_stmt)).scalars().all())

    total_events = 0
    for ep_id in endpoint_ids:
        events = await evaluate_rules_for_endpoint(db, ep_id)
        total_events += len(events)

    return total_events


def safe_spawn_evaluator(endpoint_id: str) -> None:
    """
    Fire-and-forget helper to evaluate rules in background after delivery attempt.
    Wrapped in try/except so an error can never affect the delivery worker.
    """
    async def _runner():
        from app.database import AsyncSessionLocal
        try:
            async with AsyncSessionLocal() as session:
                await evaluate_rules_for_endpoint(session, endpoint_id)
        except Exception as exc:
            print(f"[Alert Evaluator Warning] Background rule evaluation error: {exc}")

    try:
        asyncio.create_task(_runner())
    except RuntimeError:
        pass


def safe_spawn_dead_letter_evaluator(endpoint_id: str) -> None:
    """
    Fire-and-forget helper to evaluate dead letter rules in background.
    Wrapped in try/except so an error can never affect the delivery worker.
    """
    async def _runner():
        from app.database import AsyncSessionLocal
        try:
            async with AsyncSessionLocal() as session:
                await evaluate_dead_letter(session, endpoint_id)
        except Exception as exc:
            print(f"[Alert Evaluator Warning] Dead letter evaluation error: {exc}")

    try:
        asyncio.create_task(_runner())
    except RuntimeError:
        pass
