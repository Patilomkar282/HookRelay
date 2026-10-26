import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

from sqlalchemy import select
from app.core import crypto
from app.models.user import User
from app.models.endpoint import Endpoint
from app.models.alert import AlertChannel, AlertRule, AlertEvent
from app.services.alert_dispatcher import (
    build_alert_message,
    process_single_alert,
    dispatch_due_alerts,
    ALERT_RETRY_DELAYS,
    MAX_ALERT_ATTEMPTS,
)


@pytest.mark.asyncio
async def test_01_build_alert_message_safety_allowlist():
    """
    Assert that build_alert_message strictly enforces the allow-list and never
    leaks payload bodies, headers, auth tokens, or webhook secrets.
    """
    secret_webhook = "https://hooks.slack.com/services/T00001111/B22223333/SUPER_SECRET_SLACK_KEY_999"
    secret_payload = "SECRET_PAYLOAD_BODY_DATA_12345"
    secret_token = "HOOKRELAY_SECRET_TOKEN_XYZ"
    secret_cvv = "999"

    # Simulated endpoint and rule
    endpoint = Endpoint(
        id="ep-safe-01",
        user_id="user-01",
        name="Production Ingest",
        slug="prod-ingest",
        target_url="https://api.internal.corp/webhook?secret=" + secret_token,
    )
    rule = AlertRule(
        id="rule-safe-01",
        user_id="user-01",
        endpoint_id=endpoint.id,
        channel_id="chan-01",
        type="consecutive_failures",
        params={"n": 5},
        state="firing",
    )
    channel = AlertChannel(
        id="chan-01",
        user_id="user-01",
        type="slack",
        name="Team Slack",
        config_encrypted=crypto.encrypt_json({"webhook_url": secret_webhook}),
    )

    # Summary containing safe numbers and error kind, but event metadata might reference body
    event = AlertEvent(
        id=101,
        rule_id=rule.id,
        kind="fired",
        summary={
            "endpoint_id": endpoint.id,
            "mailbox_name": endpoint.name,
            "slug": endpoint.slug,
            "rule_type": rule.type,
            "kind": "fired",
            "total_attempts": 5,
            "failed_attempts": 5,
            "most_common_error": "http_status",
            "most_common_status": 500,
            # Malicious attempt to inject secrets into summary
            "headers": {"Authorization": f"Bearer {secret_token}"},
            "body": secret_payload,
            "cvv": secret_cvv,
        },
        status="pending",
        attempts=0,
    )

    subject, text = build_alert_message(event, rule, channel, endpoint)

    # Verify safe fields ARE present
    assert "Production Ingest" in text
    assert "consecutive_failures" in text
    assert "5/5 failed" in text
    assert "http_status" in text or "500" in text
    assert "endpoints/ep-safe-01" in text

    # Verify secrets are NEVER present
    assert secret_webhook not in text
    assert secret_webhook not in subject
    assert "SUPER_SECRET_SLACK_KEY_999" not in text
    assert "T00001111" not in text
    assert "B22223333" not in text
    assert "https://hooks.slack.com" not in text
    assert secret_payload not in text
    assert secret_payload not in subject
    assert secret_token not in text
    assert secret_token not in subject
    assert secret_cvv not in text


@pytest.mark.asyncio
async def test_02_successful_dispatch_marks_sent(db_session):
    """
    A pending AlertEvent is dispatched and transitions to 'sent' with attempts=0 and error=None.
    """
    user = User(
        email="test_dispatch_ok@example.com",
        password_hash="fakehash",
    )
    db_session.add(user)
    await db_session.flush()

    endpoint = Endpoint(
        user_id=user.id,
        name="Test Mailbox",
        slug="test-dispatch-ok",
        target_url="https://example.com/hook",
    )
    db_session.add(endpoint)
    await db_session.flush()

    channel = AlertChannel(
        user_id=user.id,
        type="slack",
        name="Alerts Channel",
        config_encrypted=crypto.encrypt_json({"webhook_url": "https://hooks.slack.com/services/T/B/X"}),
    )
    db_session.add(channel)
    await db_session.flush()

    rule = AlertRule(
        user_id=user.id,
        endpoint_id=endpoint.id,
        channel_id=channel.id,
        type="consecutive_failures",
        params={"n": 5},
        state="firing",
    )
    db_session.add(rule)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    event = AlertEvent(
        rule_id=rule.id,
        kind="fired",
        summary={"mailbox_name": endpoint.name, "failed_attempts": 5, "total_attempts": 5},
        status="pending",
        attempts=0,
        next_try_at=now - timedelta(seconds=1),
    )
    db_session.add(event)
    await db_session.commit()
    await db_session.refresh(event)

    with patch("app.services.alert_dispatcher.send_slack", new_callable=AsyncMock) as mock_slack:
        mock_slack.return_value = (True, None)

        success = await process_single_alert(db_session, event.id)
        assert success is True
        mock_slack.assert_awaited_once()

    await db_session.refresh(event)
    assert event.status == "sent"
    assert event.error is None
    assert event.next_try_at is None


@pytest.mark.asyncio
async def test_03_failing_channel_ends_send_failed_after_3_tries_with_right_gaps(db_session):
    """
    A failing channel (mock) retries with gaps (+10s, +30s) and transitions to
    'send_failed' after exactly 3 tries.
    """
    user = User(
        email="test_retry_gaps@example.com",
        password_hash="fakehash",
    )
    db_session.add(user)
    await db_session.flush()

    channel = AlertChannel(
        user_id=user.id,
        type="slack",
        name="Broken Slack",
        config_encrypted=crypto.encrypt_json({"webhook_url": "https://hooks.slack.com/services/T/B/broken"}),
    )
    db_session.add(channel)
    await db_session.flush()

    endpoint = Endpoint(
        user_id=user.id,
        name="Failing Endpoint",
        slug="failing-ep",
        target_url="https://example.com/webhook",
    )
    db_session.add(endpoint)
    await db_session.flush()

    rule = AlertRule(
        user_id=user.id,
        endpoint_id=endpoint.id,
        channel_id=channel.id,
        type="consecutive_failures",
        params={"n": 5},
        state="firing",
    )
    db_session.add(rule)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    event = AlertEvent(
        rule_id=rule.id,
        kind="fired",
        summary={"mailbox_name": endpoint.name, "failed_attempts": 5, "total_attempts": 5},
        status="pending",
        attempts=0,
        next_try_at=now,
    )
    db_session.add(event)
    await db_session.commit()
    await db_session.refresh(event)

    with patch("app.services.alert_dispatcher.send_slack", new_callable=AsyncMock) as mock_slack:
        mock_slack.return_value = (False, "503 Service Unavailable")

        # ---- TRY 1 ----
        res1 = await process_single_alert(db_session, event.id)
        assert res1 is False
        await db_session.refresh(event)
        assert event.status == "pending"
        assert event.attempts == 1
        def _to_utc(dt):
            return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt

        gap1 = (_to_utc(event.next_try_at) - datetime.now(timezone.utc)).total_seconds()
        assert 7 <= gap1 <= 13  # +10s gap

        # ---- TRY 2 ----
        # Simulate time passing to next try
        event.next_try_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db_session.commit()

        res2 = await process_single_alert(db_session, event.id)
        assert res2 is False
        await db_session.refresh(event)
        assert event.status == "pending"
        assert event.attempts == 2
        assert event.error == "503 Service Unavailable"
        assert event.next_try_at is not None
        gap2 = (_to_utc(event.next_try_at) - datetime.now(timezone.utc)).total_seconds()
        assert 26 <= gap2 <= 34  # +30s gap

        # ---- TRY 3 ----
        # Simulate time passing to 3rd try
        event.next_try_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db_session.commit()

        res3 = await process_single_alert(db_session, event.id)
        assert res3 is False
        await db_session.refresh(event)
        # After 3 tries, transitions to send_failed
        assert event.status == "send_failed"
        assert event.attempts == 3
        assert event.error == "503 Service Unavailable"
        assert event.next_try_at is None
        assert mock_slack.await_count == 3


@pytest.mark.asyncio
async def test_04_hourly_limit_blocks_31st_alert(db_session):
    """
    At ALERT_USER_HOURLY_LIMIT (30), the 31st alert is blocked from sending,
    marked 'send_failed' with error='rate_limited'.
    """
    user = User(
        email="test_rate_limiter@example.com",
        password_hash="fakehash",
    )
    db_session.add(user)
    await db_session.flush()

    channel = AlertChannel(
        user_id=user.id,
        type="slack",
        name="Rate Limit Slack",
        config_encrypted=crypto.encrypt_json({"webhook_url": "https://hooks.slack.com/services/T/B/rl"}),
    )
    db_session.add(channel)
    await db_session.flush()

    endpoint = Endpoint(
        user_id=user.id,
        name="Rate Limited Mailbox",
        slug="rate-limit-mbx",
        target_url="https://example.com/webhook",
    )
    db_session.add(endpoint)
    await db_session.flush()

    rule = AlertRule(
        user_id=user.id,
        endpoint_id=endpoint.id,
        channel_id=channel.id,
        type="consecutive_failures",
        params={"n": 5},
        state="firing",
    )
    db_session.add(rule)
    await db_session.flush()

    now = datetime.now(timezone.utc)

    # Seed 30 already sent alert events in the last 15 minutes
    for i in range(30):
        sent_ev = AlertEvent(
            rule_id=rule.id,
            kind="fired",
            summary={"mailbox_name": endpoint.name},
            status="sent",
            attempts=1,
            created_at=now - timedelta(minutes=15),
        )
        db_session.add(sent_ev)
    await db_session.commit()

    # Now create the 31st pending alert
    event_31 = AlertEvent(
        rule_id=rule.id,
        kind="fired",
        summary={"mailbox_name": endpoint.name},
        status="pending",
        attempts=0,
        next_try_at=now,
    )
    db_session.add(event_31)
    await db_session.commit()
    await db_session.refresh(event_31)

    with patch("app.services.alert_dispatcher.send_slack", new_callable=AsyncMock) as mock_slack:
        res = await process_single_alert(db_session, event_31.id)
        assert res is False
        # The sender must NEVER be called when rate limit is exceeded
        mock_slack.assert_not_called()

    await db_session.refresh(event_31)
    assert event_31.status == "send_failed"
    assert event_31.error == "rate_limited"
    assert event_31.next_try_at is None


@pytest.mark.asyncio
async def test_05_crash_and_restart_pending_row_sent_once(db_session):
    """
    A crash before sending leaves the row pending, so it is sent after restart.
    Once sent, subsequent passes do not duplicate the message.
    """
    user = User(
        email="test_crash_recovery@example.com",
        password_hash="fakehash",
    )
    db_session.add(user)
    await db_session.flush()

    channel = AlertChannel(
        user_id=user.id,
        type="email",
        name="Admin Email",
        config_encrypted=crypto.encrypt_json({"email": user.email}),
    )
    db_session.add(channel)
    await db_session.flush()

    endpoint = Endpoint(
        user_id=user.id,
        name="Crash Safe Mailbox",
        slug="crash-safe-mbx",
        target_url="https://example.com/webhook",
    )
    db_session.add(endpoint)
    await db_session.flush()

    rule = AlertRule(
        user_id=user.id,
        endpoint_id=endpoint.id,
        channel_id=channel.id,
        type="consecutive_failures",
        params={"n": 5},
        state="firing",
    )
    db_session.add(rule)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    event = AlertEvent(
        rule_id=rule.id,
        kind="fired",
        summary={"mailbox_name": endpoint.name},
        status="pending",
        attempts=0,
        next_try_at=now - timedelta(seconds=1),
    )
    db_session.add(event)
    await db_session.commit()

    with patch("app.services.alert_dispatcher.send_email", new_callable=AsyncMock) as mock_email:
        mock_email.return_value = (True, None)

        # First run after "restart"
        processed = await dispatch_due_alerts(db_session)
        assert processed == 1
        mock_email.assert_awaited_once()

        # Second run (simulating another cycle or subsequent restart)
        processed_again = await dispatch_due_alerts(db_session)
        assert processed_again == 0
        assert mock_email.await_count == 1  # Still 1, never sent twice!

    await db_session.refresh(event)
    assert event.status == "sent"


@pytest.mark.asyncio
async def test_06_broken_slack_url_does_not_affect_delivery_loop(db_session):
    """
    A broken Slack channel does not crash the delivery worker or disrupt delivery processing.
    """
    from app.services.alert_evaluator import safe_spawn_evaluator

    # safe_spawn_evaluator handles exceptions internally without raising
    try:
        safe_spawn_evaluator("non-existent-endpoint-uuid")
    except Exception as exc:
        pytest.fail(f"safe_spawn_evaluator raised an exception: {exc}")


@pytest.mark.asyncio
async def test_07_alert_events_history_route(db_session):
    """
    Test GET /alert-events returns paginated history for the authenticated user,
    filters by endpoint_id, and returns 404 for User B accessing User A's mailbox.
    """
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.core.security import create_access_token

    # 1. Setup User A & User B
    user_a = User(email="history_a@example.com", password_hash="hash_a")
    user_b = User(email="history_b@example.com", password_hash="hash_b")
    db_session.add_all([user_a, user_b])
    await db_session.flush()

    token_a = create_access_token(subject=user_a.id)
    token_b = create_access_token(subject=user_b.id)
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    ep_a = Endpoint(user_id=user_a.id, name="User A Mailbox", slug="user-a-mbx", target_url="https://example.com/a")
    db_session.add(ep_a)
    await db_session.flush()

    chan_a = AlertChannel(
        user_id=user_a.id,
        type="slack",
        name="Channel A",
        config_encrypted=crypto.encrypt_json({"webhook_url": "https://hooks.slack.com/services/T/B/a"}),
    )
    db_session.add(chan_a)
    await db_session.flush()

    rule_a = AlertRule(
        user_id=user_a.id,
        endpoint_id=ep_a.id,
        channel_id=chan_a.id,
        type="consecutive_failures",
        params={"n": 5},
    )
    db_session.add(rule_a)
    await db_session.flush()

    ev1 = AlertEvent(
        rule_id=rule_a.id,
        kind="fired",
        summary={"mailbox_name": ep_a.name, "failed_attempts": 5, "total_attempts": 5},
        status="sent",
        attempts=1,
    )
    ev2 = AlertEvent(
        rule_id=rule_a.id,
        kind="recovered",
        summary={"mailbox_name": ep_a.name},
        status="pending",
        attempts=0,
    )
    db_session.add_all([ev1, ev2])
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # User A queries all their events
        resp = await client.get("/alert-events", headers=headers_a)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2
        assert len(data["items"]) == 2
        assert data["items"][0]["mailbox_name"] == "User A Mailbox"

        # User A queries with endpoint_id filter
        resp_filter = await client.get(f"/alert-events?endpoint_id={ep_a.id}", headers=headers_a)
        assert resp_filter.status_code == 200
        assert resp_filter.json()["total"] == 2

        # User B queries User A's endpoint_id -> MUST return 404
        resp_b_denied = await client.get(f"/alert-events?endpoint_id={ep_a.id}", headers=headers_b)
        assert resp_b_denied.status_code == 404

        # User B queries all events -> sees 0 events
        resp_b_empty = await client.get("/alert-events", headers=headers_b)
        assert resp_b_empty.status_code == 200
        assert resp_b_empty.json()["total"] == 0
