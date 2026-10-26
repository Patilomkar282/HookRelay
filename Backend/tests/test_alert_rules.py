import asyncio
import uuid
from datetime import datetime, timezone, timedelta
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.config import settings
from app.models.user import User
from app.models.endpoint import Endpoint
from app.models.alert import AlertChannel, AlertRule, AlertEvent
from app.models.delivery import Delivery
from app.models.delivery_attempt import DeliveryAttempt
from app.services.alert_evaluator import (
    is_true,
    evaluate_rules_for_endpoint,
    evaluate_dead_letter,
    check_firing_rules_periodic,
)
from app.core.security import create_access_token


@pytest.fixture
def auth_headers_user_a():
    token = create_access_token(subject="user_rules_a")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_user_b():
    token = create_access_token(subject="user_rules_b")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def reset_feature_flag():
    settings.FEATURE_ALERTS = True
    yield
    settings.FEATURE_ALERTS = True


# -----------------------------------------------------------------------------
# 1. Pure Unit Tests for is_true (No Database Required)
# -----------------------------------------------------------------------------

def test_is_true_consecutive_failures_edge_cases():
    """Verify is_true for consecutive_failures under various attempt sequences."""
    params = {"n": 5}

    # Case 1: Fewer than N attempts -> not enough data, returns False
    attempts_fewer = [False, False, False]
    assert is_true("consecutive_failures", params, attempts_fewer) is False

    # Case 2: Exactly N attempts, all failed -> returns True
    attempts_all_failed = [False, False, False, False, False]
    assert is_true("consecutive_failures", params, attempts_all_failed) is True

    # Case 3: Mixed attempts (e.g. 4 failed, 1 success) -> returns False
    attempts_mixed = [False, False, True, False, False]
    assert is_true("consecutive_failures", params, attempts_mixed) is False

    # Case 4: Recent 5 failed, older was success -> returns True (only recent N matter)
    attempts_older_success = [False, False, False, False, False, True, True]
    assert is_true("consecutive_failures", params, attempts_older_success) is True

    # Case 5: Custom N = 3
    assert is_true("consecutive_failures", {"n": 3}, [False, False, False]) is True
    assert is_true("consecutive_failures", {"n": 3}, [False, False]) is False


def test_is_true_failure_rate_edge_cases():
    """Verify is_true for failure_rate: minimum attempts requirement and silence safety."""
    params = {"window_minutes": 15, "percent": 50, "min_attempts": 10}

    # Case 1: Fewer than min_attempts when state is ok -> returns False
    few_attempts = [False] * 5
    assert is_true("failure_rate", params, few_attempts, current_state="ok") is False

    # Case 2: Fewer than min_attempts when state is firing -> stays firing (silence is not recovery)
    assert is_true("failure_rate", params, few_attempts, current_state="firing") is True

    # Case 3: 10 attempts, 6 failed (60% > 50%) -> returns True
    six_of_ten_failed = [False] * 6 + [True] * 4
    assert is_true("failure_rate", params, six_of_ten_failed, current_state="ok") is True

    # Case 4: 10 attempts, 4 failed (40% <= 50%) -> returns False (triggers recovery if firing)
    four_of_ten_failed = [False] * 4 + [True] * 6
    assert is_true("failure_rate", params, four_of_ten_failed, current_state="firing") is False


# -----------------------------------------------------------------------------
# 2. API Routes & Ownership Verification Tests
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_create_rule_ownership_checks(db_session, auth_headers_user_a, auth_headers_user_b):
    """Verify that User A cannot create a rule referencing User B's endpoint or channel (404)."""
    user_a = User(id="user_rules_a", email="usera@test.com", password_hash="hash")
    user_b = User(id="user_rules_b", email="userb@test.com", password_hash="hash")
    ep_b = Endpoint(id=str(uuid.uuid4()), user_id=user_b.id, slug="ep_b", target_url="http://b.com", is_active=True)
    ch_b = AlertChannel(id=str(uuid.uuid4()), user_id=user_b.id, type="email", name="Ch B", config_encrypted="enc")
    db_session.add_all([user_a, user_b, ep_b, ch_b])
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # User A tries to use User B's endpoint -> 404
        res1 = await client.post(
            "/alert-rules",
            headers=auth_headers_user_a,
            json={
                "endpoint_id": ep_b.id,
                "channel_id": ch_b.id,
                "type": "consecutive_failures",
            },
        )
        assert res1.status_code == 404

        # User A creates their own endpoint, but tries to use User B's channel -> 404
        ep_a = Endpoint(id=str(uuid.uuid4()), user_id=user_a.id, slug="ep_a", target_url="http://a.com", is_active=True)
        db_session.add(ep_a)
        await db_session.commit()

        res2 = await client.post(
            "/alert-rules",
            headers=auth_headers_user_a,
            json={
                "endpoint_id": ep_a.id,
                "channel_id": ch_b.id,
                "type": "consecutive_failures",
            },
        )
        assert res2.status_code == 404


@pytest.mark.asyncio
async def test_crud_alert_rules(db_session, auth_headers_user_a):
    """Verify POST, GET, PATCH, and DELETE operations on alert rules."""
    user = User(id="user_rules_a", email="usera@test.com", password_hash="hash")
    ep = Endpoint(id=str(uuid.uuid4()), user_id=user.id, slug="ep_crud", target_url="http://t.com", is_active=True)
    ch = AlertChannel(id=str(uuid.uuid4()), user_id=user.id, type="slack", name="Slack Dev", config_encrypted="enc")
    db_session.add_all([user, ep, ch])
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create rule with default params (n=5)
        create_res = await client.post(
            "/alert-rules",
            headers=auth_headers_user_a,
            json={
                "endpoint_id": ep.id,
                "channel_id": ch.id,
                "type": "consecutive_failures",
            },
        )
        assert create_res.status_code == 201
        rule_data = create_res.json()
        assert rule_data["type"] == "consecutive_failures"
        assert rule_data["params"]["n"] == 5
        assert rule_data["state"] == "ok"
        rule_id = rule_data["id"]

        # 2. List rules
        list_res = await client.get("/alert-rules", headers=auth_headers_user_a)
        assert list_res.status_code == 200
        assert len(list_res.json()) == 1

        # 3. Patch rule
        patch_res = await client.patch(
            f"/alert-rules/{rule_id}",
            headers=auth_headers_user_a,
            json={"cooldown_minutes": 45, "enabled": False},
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["cooldown_minutes"] == 45
        assert patch_res.json()["enabled"] is False

        # 4. Delete rule
        del_res = await client.delete(f"/alert-rules/{rule_id}", headers=auth_headers_user_a)
        assert del_res.status_code == 204
        assert await db_session.get(AlertRule, rule_id) is None


# -----------------------------------------------------------------------------
# 3. State Machine & Atomic Outbox Evaluation Tests
# -----------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_five_failures_moves_rule_to_firing_and_creates_one_event(db_session):
    """Verify: 5 failed attempts move rule to firing and create exactly one pending event."""
    user = User(id="user_test_eval_1", email="eval1@test.com", password_hash="hash")
    ep = Endpoint(id=str(uuid.uuid4()), user_id=user.id, slug="ep_eval_1", target_url="http://t.com", is_active=True)
    ch = AlertChannel(id=str(uuid.uuid4()), user_id=user.id, type="slack", name="Alert Slack", config_encrypted="enc")
    rule = AlertRule(
        id=str(uuid.uuid4()),
        user_id=user.id,
        endpoint_id=ep.id,
        channel_id=ch.id,
        type="consecutive_failures",
        params={"n": 5},
        state="ok",
        enabled=True,
    )
    db_session.add_all([user, ep, ch, rule])
    await db_session.commit()

    # Log 4 failed attempts
    now = datetime.now(timezone.utc)
    for i in range(4):
        att = DeliveryAttempt(
            delivery_id=str(uuid.uuid4()),
            endpoint_id=ep.id,
            attempted_at=now - timedelta(seconds=10 - i),
            success=False,
            status_code=500,
            error_kind="http_status",
        )
        db_session.add(att)
    await db_session.commit()

    # Evaluate after 4 failures -> stays ok, 0 events
    evts1 = await evaluate_rules_for_endpoint(db_session, ep.id)
    assert len(evts1) == 0
    await db_session.refresh(rule)
    assert rule.state == "ok"

    # Log 5th failure
    att5 = DeliveryAttempt(
        delivery_id=str(uuid.uuid4()),
        endpoint_id=ep.id,
        attempted_at=now,
        success=False,
        status_code=500,
        error_kind="http_status",
    )
    db_session.add(att5)
    await db_session.commit()

    # Evaluate after 5 failures -> transitions to firing, exactly 1 event
    evts2 = await evaluate_rules_for_endpoint(db_session, ep.id)
    assert len(evts2) == 1

    await db_session.refresh(rule)
    assert rule.state == "firing"
    assert rule.state_changed_at is not None

    # Check alert event outbox row
    event = await db_session.get(AlertEvent, evts2[0])
    assert event.kind == "fired"
    assert event.status == "pending"
    assert event.summary["failed_attempts"] == 5
    assert event.summary["most_common_status"] == 500


@pytest.mark.asyncio
async def test_success_moves_rule_back_to_ok_and_creates_recovered_event(db_session):
    """Verify: a success moves rule from firing back to ok and creates exactly one recovered event."""
    user = User(id="user_test_eval_2", email="eval2@test.com", password_hash="hash")
    ep = Endpoint(id=str(uuid.uuid4()), user_id=user.id, slug="ep_eval_2", target_url="http://t.com", is_active=True)
    ch = AlertChannel(id=str(uuid.uuid4()), user_id=user.id, type="slack", name="Alert Slack", config_encrypted="enc")
    rule = AlertRule(
        id=str(uuid.uuid4()),
        user_id=user.id,
        endpoint_id=ep.id,
        channel_id=ch.id,
        type="consecutive_failures",
        params={"n": 5},
        state="firing",  # currently in firing state
        enabled=True,
    )
    db_session.add_all([user, ep, ch, rule])
    await db_session.commit()

    # Recent attempt is a SUCCESS
    att_success = DeliveryAttempt(
        delivery_id=str(uuid.uuid4()),
        endpoint_id=ep.id,
        attempted_at=datetime.now(timezone.utc),
        success=True,
        status_code=200,
        error_kind=None,
    )
    db_session.add(att_success)
    await db_session.commit()

    # Evaluate -> transitions to ok, exactly 1 recovered event
    evts = await evaluate_rules_for_endpoint(db_session, ep.id)
    assert len(evts) == 1

    await db_session.refresh(rule)
    assert rule.state == "ok"

    event = await db_session.get(AlertEvent, evts[0])
    assert event.kind == "recovered"
    assert event.status == "pending"


@pytest.mark.asyncio
async def test_restarting_backend_creates_no_duplicate_when_firing(db_session):
    """Verify: re-evaluating when rule is already firing creates NO duplicate events."""
    user = User(id="user_test_eval_3", email="eval3@test.com", password_hash="hash")
    ep = Endpoint(id=str(uuid.uuid4()), user_id=user.id, slug="ep_eval_3", target_url="http://t.com", is_active=True)
    ch = AlertChannel(id=str(uuid.uuid4()), user_id=user.id, type="slack", name="Alert Slack", config_encrypted="enc")
    rule = AlertRule(
        id=str(uuid.uuid4()),
        user_id=user.id,
        endpoint_id=ep.id,
        channel_id=ch.id,
        type="consecutive_failures",
        params={"n": 5},
        state="firing",
        last_notified_at=datetime.now(timezone.utc),  # notified recently (cooldown active)
        enabled=True,
    )
    db_session.add_all([user, ep, ch, rule])

    # 5 failed attempts
    for _ in range(5):
        db_session.add(
            DeliveryAttempt(
                delivery_id=str(uuid.uuid4()),
                endpoint_id=ep.id,
                attempted_at=datetime.now(timezone.utc),
                success=False,
                status_code=500,
            )
        )
    await db_session.commit()

    # Evaluating again while already firing and cooldown has NOT elapsed
    evts = await evaluate_rules_for_endpoint(db_session, ep.id)
    assert len(evts) == 0  # No duplicate alert!


@pytest.mark.asyncio
async def test_disabled_rule_never_fires(db_session):
    """Verify: an alert rule with enabled=False never fires even with 10 failures."""
    user = User(id="user_test_eval_4", email="eval4@test.com", password_hash="hash")
    ep = Endpoint(id=str(uuid.uuid4()), user_id=user.id, slug="ep_eval_4", target_url="http://t.com", is_active=True)
    ch = AlertChannel(id=str(uuid.uuid4()), user_id=user.id, type="slack", name="Alert Slack", config_encrypted="enc")
    rule = AlertRule(
        id=str(uuid.uuid4()),
        user_id=user.id,
        endpoint_id=ep.id,
        channel_id=ch.id,
        type="consecutive_failures",
        params={"n": 5},
        state="ok",
        enabled=False,  # disabled!
    )
    db_session.add_all([user, ep, ch, rule])

    for _ in range(10):
        db_session.add(
            DeliveryAttempt(
                delivery_id=str(uuid.uuid4()),
                endpoint_id=ep.id,
                attempted_at=datetime.now(timezone.utc),
                success=False,
                status_code=500,
            )
        )
    await db_session.commit()

    evts = await evaluate_rules_for_endpoint(db_session, ep.id)
    assert len(evts) == 0
    await db_session.refresh(rule)
    assert rule.state == "ok"


@pytest.mark.asyncio
async def test_two_concurrent_evaluators_create_exactly_one_event(db_session):
    """Verify: two evaluators racing on the same true rule create exactly ONE alert_events row."""
    from tests.conftest import TestingSessionLocal

    user = User(id="user_test_eval_5", email="eval5@test.com", password_hash="hash")
    ep = Endpoint(id=str(uuid.uuid4()), user_id=user.id, slug="ep_eval_5", target_url="http://t.com", is_active=True)
    ch = AlertChannel(id=str(uuid.uuid4()), user_id=user.id, type="slack", name="Alert Slack", config_encrypted="enc")
    rule = AlertRule(
        id=str(uuid.uuid4()),
        user_id=user.id,
        endpoint_id=ep.id,
        channel_id=ch.id,
        type="consecutive_failures",
        params={"n": 5},
        state="ok",
        enabled=True,
    )
    db_session.add_all([user, ep, ch, rule])

    for _ in range(5):
        db_session.add(
            DeliveryAttempt(
                delivery_id=str(uuid.uuid4()),
                endpoint_id=ep.id,
                attempted_at=datetime.now(timezone.utc),
                success=False,
                status_code=500,
            )
        )
    await db_session.commit()

    # Run two evaluations concurrently in separate DB sessions
    async def _eval():
        async with TestingSessionLocal() as session:
            return await evaluate_rules_for_endpoint(session, ep.id)

    res_a, res_b = await asyncio.gather(_eval(), _eval())

    # Exactly one session successfully updated the state and created an event
    total_events = len(res_a) + len(res_b)
    assert total_events == 1
