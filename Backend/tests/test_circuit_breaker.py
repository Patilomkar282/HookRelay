import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import httpx
from httpx import AsyncClient, ASGITransport
import pytest

from app.main import app
from app.models.endpoint import Endpoint
from app.models.event import Event
from app.models.delivery import Delivery
from app.models.circuit_event import CircuitEvent
from app.services import circuit_breaker
from app.services.delivery_service import (
    forward_single_delivery,
    fetch_and_process_due_deliveries,
)
from tests.conftest import TestingSessionLocal


@pytest.mark.asyncio
async def test_01_trips_at_threshold(db_session):
    """Test 1: Trips at threshold: 9 failures stay closed, 10th makes it open with circuit_open_until in future."""
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user1",
        slug="ep_test_01",
        target_url="http://target.com",
        is_active=True,
    )
    db_session.add(ep)
    await db_session.commit()

    # 9 failures
    for _ in range(9):
        changed = await circuit_breaker.record_result(db_session, ep.id, failed=True, is_probe=False)
        assert changed is None

    await db_session.refresh(ep)
    assert ep.circuit_state == "closed"
    assert ep.consecutive_failures == 9
    assert ep.circuit_open_until is None

    # 10th failure -> transitions to open
    changed = await circuit_breaker.record_result(db_session, ep.id, failed=True, is_probe=False)
    assert changed == "open"

    await db_session.refresh(ep)
    assert ep.circuit_state == "open"
    assert ep.consecutive_failures == 10
    assert ep.circuit_open_until is not None
    assert ep.circuit_open_until > datetime.now(timezone.utc)
    assert ep.open_count == 1


@pytest.mark.asyncio
async def test_02_success_resets_streak(db_session):
    """Test 2: Success resets the streak: 9 failures, 1 success, 9 failures stays closed."""
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user1",
        slug="ep_test_02",
        target_url="http://target.com",
        is_active=True,
    )
    db_session.add(ep)
    await db_session.commit()


    # 9 failures
    for _ in range(9):
        await circuit_breaker.record_result(db_session, ep.id, failed=True, is_probe=False)

    await db_session.refresh(ep)
    assert ep.consecutive_failures == 9

    # 1 success
    await circuit_breaker.record_result(db_session, ep.id, failed=False, is_probe=False)
    await db_session.refresh(ep)
    assert ep.consecutive_failures == 0
    assert ep.circuit_state == "closed"

    # Another 9 failures -> stays closed
    for _ in range(9):
        await circuit_breaker.record_result(db_session, ep.id, failed=True, is_probe=False)

    await db_session.refresh(ep)
    assert ep.circuit_state == "closed"
    assert ep.consecutive_failures == 9


@pytest.mark.asyncio
async def test_03_4xx_handling(db_session):
    """Test 3: 4xx handling: 20 responses of 400 or 404 never open the circuit; 500, 429, 408, and timeout count."""
    assert circuit_breaker.counts_as_failure(400) is False
    assert circuit_breaker.counts_as_failure(401) is False
    assert circuit_breaker.counts_as_failure(404) is False
    assert circuit_breaker.counts_as_failure(422) is False

    # Qualifying failure codes
    assert circuit_breaker.counts_as_failure(None) is True
    assert circuit_breaker.counts_as_failure(500) is True
    assert circuit_breaker.counts_as_failure(502) is True
    assert circuit_breaker.counts_as_failure(429) is True
    assert circuit_breaker.counts_as_failure(408) is True

    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user1",
        slug="ep_test_03",
        target_url="http://target.com",
        is_active=True,
    )
    db_session.add(ep)
    await db_session.commit()

    for code in [400, 404] * 10:
        is_fail = circuit_breaker.counts_as_failure(code)
        assert is_fail is False
        await circuit_breaker.record_result(db_session, ep.id, failed=is_fail, is_probe=False)

    await db_session.refresh(ep)
    assert ep.circuit_state == "closed"
    assert ep.consecutive_failures == 0


@pytest.mark.asyncio
async def test_04_single_probe(db_session):
    """Test 4: Single probe: with cooldown in the past, two concurrent admit calls return exactly one probe and one skip."""
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user1",
        slug="ep_test_04",
        target_url="http://target.com",
        is_active=True,
        circuit_state="open",
        circuit_open_until=datetime.now(timezone.utc) - timedelta(seconds=10),
    )
    db_session.add(ep)
    await db_session.commit()

    async with TestingSessionLocal() as s1, TestingSessionLocal() as s2:
        res1, res2 = await asyncio.gather(
            circuit_breaker.admit(s1, ep.id),
            circuit_breaker.admit(s2, ep.id),
        )
        await s1.commit()
        await s2.commit()

    assert {res1, res2} == {"probe", "skip"}


@pytest.mark.asyncio
async def test_05_probe_success(db_session):
    """Test 5: Probe success: state returns to closed and counters reset."""
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user1",
        slug="ep_test_05",
        target_url="http://target.com",
        is_active=True,
        circuit_state="half_open",
        consecutive_failures=10,
        open_count=1,
        probe_started_at=datetime.now(timezone.utc),
    )
    db_session.add(ep)
    await db_session.commit()

    changed = await circuit_breaker.record_result(db_session, ep.id, failed=False, is_probe=True)
    assert changed == "closed"

    await db_session.refresh(ep)
    assert ep.circuit_state == "closed"
    assert ep.consecutive_failures == 0
    assert ep.open_count == 0
    assert ep.circuit_open_until is None
    assert ep.probe_started_at is None


@pytest.mark.asyncio
async def test_06_probe_failure(db_session):
    """Test 6: Probe failure: state is open again and the new cooldown is longer than the previous one."""
    now = datetime.now(timezone.utc)
    first_open_until = now + timedelta(seconds=120)
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user1",
        slug="ep_test_06",
        target_url="http://target.com",
        is_active=True,
        circuit_state="half_open",
        consecutive_failures=10,
        open_count=1,
        circuit_open_until=first_open_until,
        probe_started_at=now,
    )
    db_session.add(ep)
    await db_session.commit()

    changed = await circuit_breaker.record_result(db_session, ep.id, failed=True, is_probe=True)
    assert changed == "open"

    await db_session.refresh(ep)
    assert ep.circuit_state == "open"
    assert ep.open_count == 2
    assert ep.probe_started_at is None
    # Cooldown doubles (base=120, open_count=1 was 120s, now open_count=2 base * 2^1 = 240s with +/-20% jitter)
    cooldown_delta = (ep.circuit_open_until - now).total_seconds()
    assert cooldown_delta > 150


@pytest.mark.asyncio
async def test_07_stale_probe(db_session):
    """Test 7: Stale probe: probe_started_at 60s in past (> 30s TTL) can be claimed again."""
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user1",
        slug="ep_test_07",
        target_url="http://target.com",
        is_active=True,
        circuit_state="half_open",
        probe_started_at=datetime.now(timezone.utc) - timedelta(seconds=60),
    )
    db_session.add(ep)
    await db_session.commit()

    mode = await circuit_breaker.admit(db_session, ep.id)
    assert mode == "probe"


@pytest.mark.asyncio
async def test_08_stale_result_ignored(db_session):
    """Test 8: Stale result ignored: a normal failure recorded while open changes nothing."""
    open_until = datetime.now(timezone.utc) + timedelta(seconds=120)
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user1",
        slug="ep_test_08",
        target_url="http://target.com",
        is_active=True,
        circuit_state="open",
        consecutive_failures=10,
        open_count=1,
        circuit_open_until=open_until,
    )
    db_session.add(ep)
    await db_session.commit()

    changed = await circuit_breaker.record_result(db_session, ep.id, failed=True, is_probe=False)
    assert changed is None

    await db_session.refresh(ep)
    assert ep.circuit_state == "open"
    assert ep.consecutive_failures == 10
    assert ep.open_count == 1
    # SQLite returns naive datetime, normalize for comparison
    actual_until = ep.circuit_open_until.replace(tzinfo=timezone.utc) if ep.circuit_open_until.tzinfo is None else ep.circuit_open_until
    assert actual_until == open_until


@pytest.mark.asyncio
async def test_09_open_means_no_sends(db_session):
    """Test 9: Open means no sends: worker tick makes zero calls to mock target and attempt_count is unchanged."""
    now = datetime.now(timezone.utc)
    ep = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user1",
        slug="ep_test_09",
        target_url="http://target.com",
        is_active=True,
        circuit_state="open",
        circuit_open_until=now + timedelta(seconds=300),
    )
    evt = Event(
        id=str(uuid.uuid4()),
        endpoint_id=ep.id,
        body={"test": "payload"},
        headers={},
    )
    deliv = Delivery(
        id=str(uuid.uuid4()),
        event_id=evt.id,
        status="pending",
        attempt_count=0,
        next_attempt_at=now - timedelta(seconds=10),
    )
    db_session.add_all([ep, evt, deliv])
    await db_session.commit()

    with patch("app.services.delivery_service.send_webhook_http") as mock_http:
        processed = await fetch_and_process_due_deliveries(db_session, batch_size=10)
        assert processed == 0
        mock_http.assert_not_called()

    await db_session.refresh(deliv)
    assert deliv.status == "pending"
    assert deliv.attempt_count == 0


@pytest.mark.asyncio
async def test_10_no_starvation(db_session):
    """Test 10: No starvation: one open endpoint with 15 due deliveries + one healthy endpoint; healthy is sent in first tick."""
    now = datetime.now(timezone.utc)
    ep_open = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user1",
        slug="ep_starve_open",
        target_url="http://broken.target.com",
        is_active=True,
        circuit_state="open",
        circuit_open_until=now + timedelta(seconds=600),
    )
    db_session.add(ep_open)
    for i in range(15):
        ev = Event(id=str(uuid.uuid4()), endpoint_id=ep_open.id, body={}, headers={})
        d = Delivery(
            id=str(uuid.uuid4()),
            event_id=ev.id,
            status="pending",
            next_attempt_at=now - timedelta(seconds=100 - i),
        )
        db_session.add_all([ev, d])

    ep_healthy = Endpoint(
        id=str(uuid.uuid4()),
        user_id="user1",
        slug="ep_starve_healthy",
        target_url="http://healthy.target.com",
        is_active=True,
        circuit_state="closed",
    )
    ev_h = Event(id=str(uuid.uuid4()), endpoint_id=ep_healthy.id, body={}, headers={})
    d_healthy = Delivery(
        id=str(uuid.uuid4()),
        event_id=ev_h.id,
        status="pending",
        next_attempt_at=now - timedelta(seconds=5),
    )
    db_session.add_all([ep_healthy, ev_h, d_healthy])
    await db_session.commit()

    mock_resp = httpx.Response(status_code=200, json={"ok": True})
    with patch("app.services.delivery_service.send_webhook_http", return_value=mock_resp) as mock_http:
        processed = await fetch_and_process_due_deliveries(db_session, batch_size=5)
        # Healthy delivery MUST be picked and processed
        assert processed == 1
        assert mock_http.call_count == 1
        assert mock_http.call_args[1]["url"] == "http://healthy.target.com"

    await db_session.refresh(d_healthy)
    assert d_healthy.status == "delivered"


@pytest.mark.asyncio
async def test_11_ownership_check_on_circuit_reset():
    """Test 11: Ownership: user B gets 404 on POST /endpoints/{id}/circuit/reset for user A's endpoint."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register User A
        reg_a = await client.post(
            "/auth/register",
            json={"email": "alice_cb_11@hookrelay.dev", "password": "password123"},
        )
        token_a = reg_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Register User B
        reg_b = await client.post(
            "/auth/register",
            json={"email": "bob_cb_11@hookrelay.dev", "password": "password123"},
        )
        token_b = reg_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A creates endpoint
        ep_res = await client.post(
            "/endpoints",
            headers=headers_a,
            json={"target_url": "https://api.my-app.com/webhooks", "provider_type": "custom"},
        )
        ep_id = ep_res.json()["id"]

        # User B attempts to reset User A's circuit -> must return 404
        reset_res = await client.post(f"/endpoints/{ep_id}/circuit/reset", headers=headers_b)
        assert reset_res.status_code == 404


@pytest.mark.asyncio
async def test_12_reset_closes_circuit_and_zeroes_counters():
    """Test 12: Reset closes an open circuit, zeroes the counters and writes a manual_reset row in circuit_events."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        reg = await client.post(
            "/auth/register",
            json={"email": "alice_cb_12@hookrelay.dev", "password": "password123"},
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        ep_res = await client.post(
            "/endpoints",
            headers=headers,
            json={"target_url": "https://api.my-app.com/webhooks", "provider_type": "custom"},
        )
        ep_id = ep_res.json()["id"]

        # Manually set endpoint to open state with 10 failures
        async with TestingSessionLocal() as s:
            now = datetime.now(timezone.utc)
            await s.execute(
                Endpoint.__table__.update()
                .where(Endpoint.id == ep_id)
                .values(
                    circuit_state="open",
                    consecutive_failures=10,
                    open_count=1,
                    circuit_open_until=now + timedelta(seconds=120),
                )
            )
            await s.commit()

        # Call reset route as owner
        reset_res = await client.post(f"/endpoints/{ep_id}/circuit/reset", headers=headers)
        assert reset_res.status_code == 204

        # Verify endpoint is now closed and counters zeroed
        detail_res = await client.get(f"/endpoints/{ep_id}", headers=headers)
        assert detail_res.status_code == 200
        ep_data = detail_res.json()
        assert ep_data["circuit_state"] == "closed"
        assert ep_data["consecutive_failures"] == 0
        assert ep_data["open_count"] == 0
        assert ep_data["circuit_open_until"] is None

        # Verify circuit_events has manual_reset record
        events_res = await client.get(f"/endpoints/{ep_id}/circuit-events", headers=headers)
        assert events_res.status_code == 200
        events_data = events_res.json()
        assert events_data["total"] >= 1
        newest = events_data["items"][0]
        assert newest["reason"] == "manual_reset"
        assert newest["to_state"] == "closed"


@pytest.mark.asyncio
async def test_13_changing_target_url_resets_circuit():
    """Test 13: Changing target_url resets the circuit and records target_changed."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        reg = await client.post(
            "/auth/register",
            json={"email": "alice_cb_13@hookrelay.dev", "password": "password123"},
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        ep_res = await client.post(
            "/endpoints",
            headers=headers,
            json={"target_url": "https://api.old-target.com/webhooks", "provider_type": "custom"},
        )
        ep_id = ep_res.json()["id"]

        # Trip circuit
        async with TestingSessionLocal() as s:
            now = datetime.now(timezone.utc)
            await s.execute(
                Endpoint.__table__.update()
                .where(Endpoint.id == ep_id)
                .values(
                    circuit_state="open",
                    consecutive_failures=10,
                    open_count=1,
                    circuit_open_until=now + timedelta(seconds=120),
                )
            )
            await s.commit()

        # Update target_url via PATCH
        patch_res = await client.patch(
            f"/endpoints/{ep_id}",
            headers=headers,
            json={"target_url": "https://api.new-target.com/webhooks"},
        )
        assert patch_res.status_code == 200
        ep_data = patch_res.json()
        assert ep_data["circuit_state"] == "closed"
        assert ep_data["consecutive_failures"] == 0
        assert ep_data["target_url"] == "https://api.new-target.com/webhooks"

        # Verify target_changed event in audit trail
        events_res = await client.get(f"/endpoints/{ep_id}/circuit-events", headers=headers)
        assert events_res.status_code == 200
        newest = events_res.json()["items"][0]
        assert newest["reason"] == "target_changed"
        assert newest["to_state"] == "closed"


@pytest.mark.asyncio
async def test_14_circuit_events_ordering_and_ownership():
    """Test 14: GET /endpoints/{id}/circuit-events returns newest first and only for the owner."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register User A
        reg_a = await client.post(
            "/auth/register",
            json={"email": "alice_cb_14@hookrelay.dev", "password": "password123"},
        )
        token_a = reg_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Register User B
        reg_b = await client.post(
            "/auth/register",
            json={"email": "bob_cb_14@hookrelay.dev", "password": "password123"},
        )
        token_b = reg_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Create endpoint for User A
        ep_res = await client.post(
            "/endpoints",
            headers=headers_a,
            json={"target_url": "https://api.my-app.com/webhooks", "provider_type": "custom"},
        )
        ep_id = ep_res.json()["id"]

        # Insert multiple circuit events with increasing timestamps
        async with TestingSessionLocal() as s:
            t0 = datetime(2026, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
            t1 = datetime(2026, 1, 1, 10, 5, 0, tzinfo=timezone.utc)
            t2 = datetime(2026, 1, 1, 10, 10, 0, tzinfo=timezone.utc)
            ev0 = CircuitEvent(endpoint_id=ep_id, from_state="closed", to_state="open", reason="threshold_reached", created_at=t0)
            ev1 = CircuitEvent(endpoint_id=ep_id, from_state="open", to_state="half_open", reason="cooldown_elapsed", created_at=t1)
            ev2 = CircuitEvent(endpoint_id=ep_id, from_state="half_open", to_state="closed", reason="probe_succeeded", created_at=t2)
            s.add_all([ev0, ev1, ev2])
            await s.commit()

        # User B queries circuit events -> 404
        b_res = await client.get(f"/endpoints/{ep_id}/circuit-events", headers=headers_b)
        assert b_res.status_code == 404

        # User A queries circuit events -> 200 with newest first
        a_res = await client.get(f"/endpoints/{ep_id}/circuit-events", headers=headers_a)
        assert a_res.status_code == 200
        data = a_res.json()
        assert data["total"] == 3
        items = data["items"]
        assert len(items) == 3
        assert items[0]["reason"] == "probe_succeeded"
        assert items[1]["reason"] == "cooldown_elapsed"
        assert items[2]["reason"] == "threshold_reached"
