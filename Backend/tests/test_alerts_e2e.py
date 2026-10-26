import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.config import settings
from app.core import crypto
from app.core.security import create_access_token
from app.models.user import User
from app.models.endpoint import Endpoint
from app.models.event import Event
from app.models.delivery import Delivery
from app.models.delivery_attempt import DeliveryAttempt
from app.models.alert import AlertChannel, AlertRule, AlertEvent
from app.services.alert_evaluator import evaluate_rules_for_endpoint, check_firing_rules_periodic
from app.services.alert_dispatcher import dispatch_due_alerts, build_alert_message
from app.services.retention_service import purge_expired_events


@pytest.fixture(autouse=True)
def enable_alerts_feature():
    settings.FEATURE_ALERTS = True
    yield
    settings.FEATURE_ALERTS = True


@pytest.mark.asyncio
async def test_01_stopping_target_and_5_failures_gives_exactly_one_alert(db_session):
    """
    Done when criterion 1:
    Stopping the target and sending 5 events gives exactly one alert.
    Subsequent failures while firing create NO duplicate alerts.
    """
    user = User(email="e2e_5fail@example.com", password_hash="fakehash")
    db_session.add(user)
    await db_session.flush()

    channel = AlertChannel(
        user_id=user.id,
        type="slack",
        name="Team Ops Slack",
        config_encrypted=crypto.encrypt_json({"webhook_url": "https://hooks.slack.com/services/T/B/alert1"}),
    )
    db_session.add(channel)
    await db_session.flush()

    endpoint = Endpoint(
        user_id=user.id,
        name="Billing Mailbox",
        slug="billing-mbx",
        target_url="https://billing.internal/webhook",
    )
    db_session.add(endpoint)
    await db_session.flush()

    rule = AlertRule(
        user_id=user.id,
        endpoint_id=endpoint.id,
        channel_id=channel.id,
        type="consecutive_failures",
        params={"n": 5},
        cooldown_minutes=30,
        enabled=True,
        state="ok",
    )
    db_session.add(rule)
    await db_session.commit()

    now = datetime.now(timezone.utc)

    # Simulate 4 consecutive failures
    for i in range(4):
        att = DeliveryAttempt(
            endpoint_id=endpoint.id,
            delivery_id=f"del-fail-{i}",
            success=False,
            status_code=500,
            error_kind="http_status",
            attempted_at=now + timedelta(seconds=i),
        )
        db_session.add(att)
    await db_session.commit()

    # Evaluator after 4 failures: condition NOT met (requires 5)
    ev_ids = await evaluate_rules_for_endpoint(db_session, endpoint.id)
    assert len(ev_ids) == 0
    await db_session.refresh(rule)
    assert rule.state == "ok"

    # 5th consecutive failure
    att5 = DeliveryAttempt(
        endpoint_id=endpoint.id,
        delivery_id="del-fail-5",
        success=False,
        status_code=500,
        error_kind="http_status",
        attempted_at=now + timedelta(seconds=5),
    )
    db_session.add(att5)
    await db_session.commit()

    # Evaluator after 5th failure: rule becomes firing and creates exactly 1 event
    with patch("app.services.alert_dispatcher.send_slack", new_callable=AsyncMock) as mock_slack:
        mock_slack.return_value = (True, None)

        ev_ids = await evaluate_rules_for_endpoint(db_session, endpoint.id)
        assert len(ev_ids) == 1
        await db_session.refresh(rule)
        assert rule.state == "firing"

        # Dispatch the pending alert
        dispatched = await dispatch_due_alerts(db_session)
        assert dispatched == 1
        mock_slack.assert_awaited_once()

    # 6th consecutive failure while firing: MUST NOT create another alert!
    att6 = DeliveryAttempt(
        endpoint_id=endpoint.id,
        delivery_id="del-fail-6",
        success=False,
        status_code=500,
        error_kind="http_status",
        attempted_at=now + timedelta(seconds=6),
    )
    db_session.add(att6)
    await db_session.commit()

    ev_ids_6 = await evaluate_rules_for_endpoint(db_session, endpoint.id)
    assert len(ev_ids_6) == 0  # No duplicate alert created!
    await db_session.refresh(rule)
    assert rule.state == "firing"


@pytest.mark.asyncio
async def test_02_starting_target_and_one_success_gives_exactly_one_recovered(db_session):
    """
    Done when criterion 2:
    Starting the target and sending one event gives exactly one "recovered" message.
    Subsequent successes while ok create NO duplicate events.
    """
    user = User(email="e2e_recovery@example.com", password_hash="fakehash")
    db_session.add(user)
    await db_session.flush()

    channel = AlertChannel(
        user_id=user.id,
        type="slack",
        name="Team Ops Slack",
        config_encrypted=crypto.encrypt_json({"webhook_url": "https://hooks.slack.com/services/T/B/rec"}),
    )
    db_session.add(channel)
    await db_session.flush()

    endpoint = Endpoint(
        user_id=user.id,
        name="Recovery Mailbox",
        slug="recovery-mbx",
        target_url="https://rec.internal/webhook",
    )
    db_session.add(endpoint)
    await db_session.flush()

    # Start rule in firing state
    now = datetime.now(timezone.utc)
    rule = AlertRule(
        user_id=user.id,
        endpoint_id=endpoint.id,
        channel_id=channel.id,
        type="consecutive_failures",
        params={"n": 5},
        cooldown_minutes=30,
        enabled=True,
        state="firing",
        state_changed_at=now - timedelta(minutes=5),
        last_notified_at=now - timedelta(minutes=5),
    )
    db_session.add(rule)
    await db_session.commit()

    # Target recovers! 1 successful attempt recorded
    att_succ = DeliveryAttempt(
        endpoint_id=endpoint.id,
        delivery_id="del-succ-1",
        success=True,
        status_code=200,
        error_kind=None,
        attempted_at=now,
    )
    db_session.add(att_succ)
    await db_session.commit()

    with patch("app.services.alert_dispatcher.send_slack", new_callable=AsyncMock) as mock_slack:
        mock_slack.return_value = (True, None)

        # Evaluator moves rule from firing back to ok
        ev_ids = await evaluate_rules_for_endpoint(db_session, endpoint.id)
        assert len(ev_ids) == 1

        await db_session.refresh(rule)
        assert rule.state == "ok"

        # Dispatch the recovered alert
        dispatched = await dispatch_due_alerts(db_session)
        assert dispatched == 1
        mock_slack.assert_awaited_once()

    # Subsequent successful attempt: rule stays ok, no new events
    att_succ_2 = DeliveryAttempt(
        endpoint_id=endpoint.id,
        delivery_id="del-succ-2",
        success=True,
        status_code=200,
        error_kind=None,
        attempted_at=now + timedelta(seconds=10),
    )
    db_session.add(att_succ_2)
    await db_session.commit()

    ev_ids_2 = await evaluate_rules_for_endpoint(db_session, endpoint.id)
    assert len(ev_ids_2) == 0  # No events


@pytest.mark.asyncio
async def test_03_restarting_backend_while_firing_sends_no_duplicate(db_session):
    """
    Done when criterion 3:
    Restarting the backend while firing sends no duplicate alert.
    """
    user = User(email="e2e_restart@example.com", password_hash="fakehash")
    db_session.add(user)
    await db_session.flush()

    channel = AlertChannel(
        user_id=user.id,
        type="email",
        name="Restart Email",
        config_encrypted=crypto.encrypt_json({"email": user.email}),
    )
    db_session.add(channel)
    await db_session.flush()

    endpoint = Endpoint(
        user_id=user.id,
        name="Restart Mailbox",
        slug="restart-mbx",
        target_url="https://restart.internal/webhook",
    )
    db_session.add(endpoint)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    rule = AlertRule(
        user_id=user.id,
        endpoint_id=endpoint.id,
        channel_id=channel.id,
        type="consecutive_failures",
        params={"n": 5},
        cooldown_minutes=30,
        enabled=True,
        state="firing",
        state_changed_at=now - timedelta(minutes=2),
        last_notified_at=now - timedelta(minutes=2),
    )
    db_session.add(rule)
    await db_session.flush()

    # Already sent event
    event = AlertEvent(
        rule_id=rule.id,
        kind="fired",
        summary={"mailbox_name": endpoint.name},
        status="sent",
        attempts=1,
    )
    db_session.add(event)
    await db_session.commit()

    with patch("app.services.alert_dispatcher.send_email", new_callable=AsyncMock) as mock_email:
        # Simulate backend restart: 60s periodic evaluator checks firing rules
        count = await check_firing_rules_periodic(db_session)
        assert count == 0  # Cooldown not elapsed, no new event created

        # Dispatcher runs
        dispatched = await dispatch_due_alerts(db_session)
        assert dispatched == 0
        mock_email.assert_not_called()


@pytest.mark.asyncio
async def test_04_user_b_cannot_see_or_edit_user_a_channels_rules_history(db_session):
    """
    Done when criterion 4:
    User B cannot see or edit user A's channels, rules or history (all return 404).
    """
    user_a = User(email="user_a_e2e@example.com", password_hash="hash_a")
    user_b = User(email="user_b_e2e@example.com", password_hash="hash_b")
    db_session.add_all([user_a, user_b])
    await db_session.flush()

    token_b = create_access_token(subject=user_b.id)
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User A resources
    ep_a = Endpoint(user_id=user_a.id, name="User A Mailbox", slug="ep-a-e2e", target_url="https://a.com")
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
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. User B tries to test User A's channel -> 404
        r = await client.post(f"/alert-channels/{chan_a.id}/test", headers=headers_b)
        assert r.status_code == 404

        # 2. User B tries to delete User A's channel -> 404
        r = await client.delete(f"/alert-channels/{chan_a.id}", headers=headers_b)
        assert r.status_code == 404

        # 3. User B tries to edit User A's rule -> 404
        r = await client.patch(f"/alert-rules/{rule_a.id}", json={"enabled": False}, headers=headers_b)
        assert r.status_code == 404

        # 4. User B tries to delete User A's rule -> 404
        r = await client.delete(f"/alert-rules/{rule_a.id}", headers=headers_b)
        assert r.status_code == 404

        # 5. User B tries to read User A's mailbox alert history -> 404
        r = await client.get(f"/alert-events?endpoint_id={ep_a.id}", headers=headers_b)
        assert r.status_code == 404

        # 6. User B tries to create rule binding User A's endpoint -> 404
        r = await client.post(
            "/alert-rules",
            json={
                "endpoint_id": ep_a.id,
                "channel_id": chan_a.id,
                "type": "consecutive_failures",
                "params": {"n": 5},
            },
            headers=headers_b,
        )
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_05_no_payload_data_or_secret_appears_in_alert_or_log():
    """
    Done when criterion 5:
    No payload data or secret appears in any alert or log line.
    """
    secret_key = "CONFIDENTIAL_STRIPE_KEY_LIVE_12345"
    secret_payload = "RAW_PAYLOAD_BODY_WITH_CREDIT_CARD_NUMBERS"
    secret_webhook = "https://hooks.slack.com/services/T999/B888/SECRET_SLACK_URL_TOKEN"

    ep = Endpoint(
        id="ep-sec",
        user_id="user-sec",
        name="Secure Ingest",
        slug="sec-ingest",
        target_url="https://api.internal/webhook?token=" + secret_key,
    )
    rule = AlertRule(
        id="rule-sec",
        user_id="user-sec",
        endpoint_id=ep.id,
        channel_id="chan-sec",
        type="consecutive_failures",
        params={"n": 5},
    )
    channel = AlertChannel(
        id="chan-sec",
        user_id="user-sec",
        type="slack",
        name="Slack Sec",
        config_encrypted=crypto.encrypt_json({"webhook_url": secret_webhook}),
    )
    event = AlertEvent(
        id=777,
        rule_id=rule.id,
        kind="fired",
        summary={
            "endpoint_id": ep.id,
            "mailbox_name": ep.name,
            "slug": ep.slug,
            "rule_type": rule.type,
            "total_attempts": 5,
            "failed_attempts": 5,
            "most_common_error": "http_status",
            "body": secret_payload,
        },
    )

    subject, message_text = build_alert_message(event, rule, channel, ep)

    assert secret_key not in subject and secret_key not in message_text
    assert secret_payload not in subject and secret_payload not in message_text
    assert secret_webhook not in subject and secret_webhook not in message_text
    assert "SECRET_SLACK_URL_TOKEN" not in message_text
    assert "CONFIDENTIAL_STRIPE_KEY" not in message_text


@pytest.mark.asyncio
async def test_06_mailbox_with_no_rules_behaves_exactly_as_v1(db_session):
    """
    Done when criterion 6:
    A mailbox with no rules behaves exactly as in v1.
    Ingestion returns 202, delivery is processed, zero alert rows created.
    """
    user = User(email="v1_clean@example.com", password_hash="fakehash")
    db_session.add(user)
    await db_session.flush()

    endpoint = Endpoint(
        user_id=user.id,
        name="Plain v1 Mailbox",
        slug="v1-plain",
        target_url="https://example.com/clean",
    )
    db_session.add(endpoint)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Ingest webhook
        resp = await client.post(
            f"/h/{endpoint.slug}",
            json={"action": "ping"},
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 202
        data = resp.json()
        assert data["status"] == "accepted"

    # Evaluator runs on this endpoint: does nothing because no rules exist
    ev_ids = await evaluate_rules_for_endpoint(db_session, endpoint.id)
    assert len(ev_ids) == 0


@pytest.mark.asyncio
async def test_07_retention_policy_purges_delivery_attempts_and_alert_events(db_session):
    """
    Retention policy cleans up delivery_attempts and alert_events older than RETENTION_DAYS.
    """
    now = datetime.now(timezone.utc)
    old_time = now - timedelta(days=45)

    user = User(email="retention_test@example.com", password_hash="fakehash")
    db_session.add(user)
    await db_session.flush()

    endpoint = Endpoint(user_id=user.id, name="Retention MB", slug="ret-mb", target_url="https://example.com")
    channel = AlertChannel(
        user_id=user.id,
        type="slack",
        name="Slack Ret",
        config_encrypted=crypto.encrypt_json({"webhook_url": "https://hooks.slack.com/services/T/B/ret"}),
    )
    db_session.add_all([endpoint, channel])
    await db_session.flush()

    rule = AlertRule(user_id=user.id, endpoint_id=endpoint.id, channel_id=channel.id, type="consecutive_failures")
    db_session.add(rule)
    await db_session.flush()

    # Create old delivery attempt (45 days old)
    old_att = DeliveryAttempt(
        endpoint_id=endpoint.id,
        delivery_id="del-old",
        success=False,
        attempted_at=old_time,
    )
    # Create recent delivery attempt (1 day old)
    recent_att = DeliveryAttempt(
        endpoint_id=endpoint.id,
        delivery_id="del-recent",
        success=True,
        attempted_at=now - timedelta(days=1),
    )

    # Create old alert event (45 days old)
    old_event = AlertEvent(
        rule_id=rule.id,
        kind="fired",
        status="sent",
        created_at=old_time,
    )
    # Create recent alert event (1 day old)
    recent_event = AlertEvent(
        rule_id=rule.id,
        kind="fired",
        status="sent",
        created_at=now - timedelta(days=1),
    )

    db_session.add_all([old_att, recent_att, old_event, recent_event])
    await db_session.commit()

    # Run retention purge with 30-day retention
    await purge_expired_events(db_session, retention_days=30)

    # Assert old records are deleted, recent records remain
    from sqlalchemy import select
    att_res = (await db_session.execute(select(DeliveryAttempt))).scalars().all()
    assert len(att_res) == 1
    assert att_res[0].delivery_id == "del-recent"

    ev_res = (await db_session.execute(select(AlertEvent))).scalars().all()
    assert len(ev_res) == 1
    assert ev_res[0].id == recent_event.id
