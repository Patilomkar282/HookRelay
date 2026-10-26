import uuid
from datetime import datetime, timezone
from unittest.mock import patch
import pytest
from pydantic import ValidationError
from cryptography.fernet import Fernet, InvalidToken
from app.config import Settings
from app.core import crypto
from app.models.endpoint import Endpoint
from app.models.event import Event
from app.models.delivery import Delivery
from app.models.delivery_attempt import DeliveryAttempt
from app.models.alert import AlertChannel, AlertRule, AlertEvent
from app.services.delivery_service import forward_single_delivery



# -----------------------------------------------------------------------------
# 1. Settings & Encryption Key Validation Tests
# -----------------------------------------------------------------------------

def test_missing_encryption_key_fails_boot():
    """Verify that Settings validation fails if ENCRYPTION_KEY is missing or empty."""
    with pytest.raises(ValidationError):
        Settings(
            ENCRYPTION_KEY="",
            _env_file=None,
        )


def test_invalid_encryption_key_fails_boot():
    """Verify that Settings validation fails if ENCRYPTION_KEY is not a valid Fernet key."""
    with pytest.raises(ValidationError):
        Settings(
            ENCRYPTION_KEY="invalid-fernet-key-not-base64",
            _env_file=None,
        )


def test_valid_encryption_key_succeeds():
    """Verify that a valid Fernet key passes boot validation."""
    valid_key = Fernet.generate_key().decode()
    cfg = Settings(
        ENCRYPTION_KEY=valid_key,
        _env_file=None,
    )
    assert cfg.ENCRYPTION_KEY == valid_key
    assert cfg.FEATURE_ALERTS is True
    assert cfg.ALERT_USER_HOURLY_LIMIT == 30
    assert cfg.RETENTION_DAYS == 30


# -----------------------------------------------------------------------------
# 2. Crypto Helper (app.core.crypto) Tests
# -----------------------------------------------------------------------------

def test_encrypt_decrypt_roundtrip():
    """Verify decrypt_json(encrypt_json(x)) == x for structured JSON dicts."""
    sample = {
        "webhook_url": "https://hooks.slack.com/services/T00/B00/SECRET12345",
        "channel": "#alerts",
        "retries": 3,
        "nested": {"enabled": True, "tags": ["critical", "prod"]},
    }
    encrypted = crypto.encrypt_json(sample)
    assert isinstance(encrypted, str)
    assert encrypted != ""
    assert "SECRET12345" not in encrypted  # secret is not plaintext

    decrypted = crypto.decrypt_json(encrypted)
    assert decrypted == sample


def test_decrypt_with_wrong_key_fails():
    """Verify decrypting token with a different Fernet key raises an error."""
    sample = {"secret": "super_secret_token"}
    encrypted = crypto.encrypt_json(sample)

    other_key = Fernet.generate_key()
    other_fernet = Fernet(other_key)

    with pytest.raises(InvalidToken):
        other_fernet.decrypt(encrypted.encode())


def test_hint_masking():
    """Verify hint() masks sensitive values while keeping only the last 4 characters."""
    assert crypto.hint("https://hooks.slack.com/services/T000/B000/xyz9876") == "****9876"
    assert crypto.hint("sk_live_1234") == "****1234"
    assert crypto.hint("abc") == "****"
    assert crypto.hint("") == "****"
    assert crypto.hint(None) == "****"


# -----------------------------------------------------------------------------
# 3. Delivery Attempt Logging in Worker Tests
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_worker_successful_attempt_logs_delivery_attempt(db_session):
    """Verify that every successful attempt writes one delivery_attempts row."""
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user_alerts_1",
        slug="ep_alerts_success",
        target_url="http://target.test/webhook",
        is_active=True,
    )
    event = Event(
        id=str(uuid.uuid4()),
        endpoint_id=ep.id,
        headers={"content-type": "application/json"},
        body={"action": "order_created", "amount": 100},
    )
    delivery = Delivery(
        id=str(uuid.uuid4()),
        event_id=event.id,
        status="pending",
        attempt_count=0,
    )
    db_session.add_all([ep, event, delivery])
    await db_session.commit()

    import httpx
    mock_resp = httpx.Response(200, json={"ok": True})

    with patch("app.services.delivery_service.send_webhook_http", return_value=mock_resp):
        res = await forward_single_delivery(db_session, delivery.id)

    assert res.status == "delivered"
    assert res.last_status_code == 200
    assert res.error_kind is None

    # Check delivery_attempts record
    from sqlalchemy import select
    stmt = select(DeliveryAttempt).where(DeliveryAttempt.delivery_id == delivery.id)
    attempts = list((await db_session.execute(stmt)).scalars().all())

    assert len(attempts) == 1
    att = attempts[0]
    assert att.endpoint_id == ep.id
    assert att.delivery_id == delivery.id
    assert att.success is True
    assert att.status_code == 200
    assert att.error_kind is None
    assert att.latency_ms is not None
    assert att.attempted_at is not None



@pytest.mark.asyncio
async def test_worker_http_failure_logs_delivery_attempt(db_session):
    """Verify that an HTTP 500 failure logs a delivery_attempts row with error_kind='http_status'."""
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user_alerts_2",
        slug="ep_alerts_fail500",
        target_url="http://target.test/webhook",
        is_active=True,
    )
    event = Event(
        id=str(uuid.uuid4()),
        endpoint_id=ep.id,
        headers={"content-type": "application/json"},
        body={"action": "test"},
    )
    delivery = Delivery(
        id=str(uuid.uuid4()),
        event_id=event.id,
        status="pending",
        attempt_count=0,
    )
    db_session.add_all([ep, event, delivery])
    await db_session.commit()

    import httpx
    mock_resp = httpx.Response(500, text="Internal Server Error")

    with patch("app.services.delivery_service.send_webhook_http", return_value=mock_resp):
        res = await forward_single_delivery(db_session, delivery.id, fast_retry_mode=True)

    assert res.status == "retrying"
    assert res.last_status_code == 500
    assert res.error_kind == "http_status"

    from sqlalchemy import select
    stmt = select(DeliveryAttempt).where(DeliveryAttempt.delivery_id == delivery.id)
    attempts = list((await db_session.execute(stmt)).scalars().all())

    assert len(attempts) == 1
    att = attempts[0]
    assert att.endpoint_id == ep.id
    assert att.success is False
    assert att.status_code == 500
    assert att.error_kind == "http_status"

@pytest.mark.asyncio
async def test_worker_timeout_logs_delivery_attempt(db_session):
    """Verify that a timeout logs a delivery_attempts row with error_kind='timeout' and status_code=None."""
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user_alerts_3",
        slug="ep_alerts_timeout",
        target_url="http://target.test/webhook",
        is_active=True,
    )
    event = Event(
        id=str(uuid.uuid4()),
        endpoint_id=ep.id,
        headers={"content-type": "application/json"},
        body={"action": "test"},
    )
    delivery = Delivery(
        id=str(uuid.uuid4()),
        event_id=event.id,
        status="pending",
        attempt_count=0,
    )
    db_session.add_all([ep, event, delivery])
    await db_session.commit()

    import httpx
    with patch(
        "app.services.delivery_service.send_webhook_http",
        side_effect=httpx.TimeoutException("Connection timed out"),
    ):
        res = await forward_single_delivery(db_session, delivery.id, fast_retry_mode=True)

    assert res.status == "retrying"
    assert res.last_status_code is None
    assert res.error_kind == "timeout"

    from sqlalchemy import select
    stmt = select(DeliveryAttempt).where(DeliveryAttempt.delivery_id == delivery.id)
    attempts = list((await db_session.execute(stmt)).scalars().all())

    assert len(attempts) == 1
    att = attempts[0]
    assert att.endpoint_id == ep.id
    assert att.success is False
    assert att.status_code is None
    assert att.error_kind == "timeout"


@pytest.mark.asyncio
async def test_inactive_endpoint_does_not_log_delivery_attempt(db_session):
    """Verify that held or inactive endpoint deliveries are not attempts and get no delivery_attempts row."""
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user_alerts_4",
        slug="ep_alerts_inactive",
        target_url="http://target.test/webhook",
        is_active=False,
    )
    event = Event(
        id=str(uuid.uuid4()),
        endpoint_id=ep.id,
        headers={"content-type": "application/json"},
        body={"action": "test"},
    )
    delivery = Delivery(
        id=str(uuid.uuid4()),
        event_id=event.id,
        status="pending",
        attempt_count=0,
    )
    db_session.add_all([ep, event, delivery])
    await db_session.commit()

    res = await forward_single_delivery(db_session, delivery.id)
    assert res.status == "failed"

    from sqlalchemy import select
    stmt = select(DeliveryAttempt).where(DeliveryAttempt.delivery_id == delivery.id)
    attempts = list((await db_session.execute(stmt)).scalars().all())
    assert len(attempts) == 0


# -----------------------------------------------------------------------------
# 4. Alert Tables Data Model Integrity Tests
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_alert_tables_relationships(db_session):
    """Verify creation, relationship integrity and outbox behavior for AlertChannel, AlertRule, AlertEvent."""
    from app.models.user import User

    user = User(
        id=str(uuid.uuid4()),
        email="alert_test_user@example.com",
        password_hash="secret_hash",
    )
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id=user.id,
        slug="ep_alerts_rules_test",
        target_url="http://target.test/webhook",
        is_active=True,
    )
    db_session.add_all([user, ep])
    await db_session.commit()

    # 1. Create AlertChannel
    raw_cfg = {"webhook_url": "https://hooks.slack.com/services/T1/B1/X1"}
    enc_cfg = crypto.encrypt_json(raw_cfg)
    channel = AlertChannel(
        id=str(uuid.uuid4()),
        user_id=user.id,
        type="slack",
        name="Team Slack #alerts",
        config_encrypted=enc_cfg,
    )
    db_session.add(channel)
    await db_session.commit()
    await db_session.refresh(channel)

    assert channel.type == "slack"
    assert channel.name == "Team Slack #alerts"
    assert crypto.decrypt_json(channel.config_encrypted) == raw_cfg

    # 2. Create AlertRule
    rule = AlertRule(
        id=str(uuid.uuid4()),
        user_id=user.id,
        endpoint_id=ep.id,
        channel_id=channel.id,
        type="consecutive_failures",
        params={"threshold": 5},
        cooldown_minutes=30,
        enabled=True,
        state="ok",
    )
    db_session.add(rule)
    await db_session.commit()
    await db_session.refresh(rule)

    assert rule.state == "ok"
    assert rule.enabled is True
    assert rule.params["threshold"] == 5

    # 3. Create AlertEvent (Outbox pattern)
    alert_evt = AlertEvent(
        rule_id=rule.id,
        kind="fired",
        summary={"reason": "5 consecutive failures on endpoint", "last_status": 500},
        status="pending",
        attempts=0,
        next_try_at=datetime.now(timezone.utc),
    )
    db_session.add(alert_evt)
    await db_session.commit()
    await db_session.refresh(alert_evt)

    assert alert_evt.id is not None
    assert alert_evt.status == "pending"
    assert alert_evt.attempts == 0
    assert alert_evt.kind == "fired"
    assert alert_evt.summary["reason"] == "5 consecutive failures on endpoint"
