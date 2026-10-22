import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.models.endpoint import Endpoint
from app.models.event import Event
from app.models.delivery import Delivery
from app.services.security_service import validate_target_url
from app.services.rate_limiter import SlidingWindowRateLimiter
from app.services.retention_service import purge_expired_events


@pytest.mark.asyncio
async def test_ssrf_blocking_and_target_url_validation():
    """Verify SSRF protection blocks loopback, private IPs, and cloud metadata services."""
    # 1. Loopback addresses
    with pytest.raises(HTTPException) as exc:
        validate_target_url("http://localhost:8000/webhook", allow_private=False)
    assert exc.value.status_code == 400
    assert "SSRF Protection" in exc.value.detail

    with pytest.raises(HTTPException) as exc:
        validate_target_url("http://127.0.0.1:9000/webhook", allow_private=False)
    assert exc.value.status_code == 400
    assert "SSRF Protection" in exc.value.detail

    # 2. Cloud metadata service
    with pytest.raises(HTTPException) as exc:
        validate_target_url("http://169.254.169.254/latest/meta-data", allow_private=False)
    assert exc.value.status_code == 400
    assert "SSRF Protection" in exc.value.detail

    # 3. Invalid protocols
    with pytest.raises(HTTPException) as exc:
        validate_target_url("ftp://my-server.com/hook", allow_private=False)
    assert exc.value.status_code == 400
    assert "Only http:// and https:// are permitted" in exc.value.detail

    # 4. Valid external URL
    clean = validate_target_url("https://webhook.site/test-uuid", allow_private=False)
    assert clean == "https://webhook.site/test-uuid"


@pytest.mark.asyncio
async def test_rate_limiter_sliding_window():
    """Verify sliding window rate limiter triggers 429 when threshold exceeded."""
    limiter = SlidingWindowRateLimiter(default_limit=3, window_seconds=60)
    key = "test_slug:192.168.1.1"

    # Calls 1, 2, 3 should succeed
    allowed1, rem1, _ = limiter.check_rate_limit(key, limit=3)
    assert allowed1 is True
    assert rem1 == 2

    allowed2, rem2, _ = limiter.check_rate_limit(key, limit=3)
    assert allowed2 is True
    assert rem2 == 1

    allowed3, rem3, _ = limiter.check_rate_limit(key, limit=3)
    assert allowed3 is True
    assert rem3 == 0

    # Call 4 should fail with 429
    with pytest.raises(HTTPException) as exc:
        limiter.enforce_rate_limit(key, limit=3)
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers
    assert exc.value.headers["X-RateLimit-Remaining"] == "0"


@pytest.mark.asyncio
async def test_retention_policy_purges_expired_events(db_session: AsyncSession):
    """Verify purge_expired_events deletes events and deliveries older than retention cutoff."""
    now = datetime.now(timezone.utc)
    old_time = now - timedelta(days=45)

    # 1. Create endpoint
    ep = Endpoint(
        id="ep_retention_test",
        user_id="user_retention",
        slug="slug_retention",
        target_url="https://api.example.com/webhooks",
        signing_secret="whsec_test",
        provider_type="custom",
        is_active=True,
    )
    db_session.add(ep)

    # 2. Add an old event (45 days old)
    old_evt = Event(
        id="evt_old_expired",
        endpoint_id=ep.id,
        headers={"Content-Type": "application/json"},
        body={"data": "old"},
        received_at=old_time,
        signature_valid=True,
    )
    db_session.add(old_evt)

    # Add old delivery
    old_del = Delivery(
        id="del_old_expired",
        event_id=old_evt.id,
        status="delivered",
        attempt_count=1,
        latency_ms=120,
        created_at=old_time,
    )
    db_session.add(old_del)

    # 3. Add a fresh event (today)
    fresh_evt = Event(
        id="evt_fresh_active",
        endpoint_id=ep.id,
        headers={"Content-Type": "application/json"},
        body={"data": "fresh"},
        received_at=now,
        signature_valid=True,
    )
    db_session.add(fresh_evt)

    fresh_del = Delivery(
        id="del_fresh_active",
        event_id=fresh_evt.id,
        status="delivered",
        attempt_count=1,
        latency_ms=95,
        created_at=now,
    )
    db_session.add(fresh_del)
    await db_session.commit()

    # 4. Run purge with 30 days retention
    purged = await purge_expired_events(db_session, retention_days=30)
    assert purged == 1

    # Verify old event is gone, fresh event remains
    from sqlalchemy import select
    res_old = await db_session.execute(select(Event).where(Event.id == "evt_old_expired"))
    assert res_old.scalar_one_or_none() is None

    res_fresh = await db_session.execute(select(Event).where(Event.id == "evt_fresh_active"))
    assert res_fresh.scalar_one_or_none() is not None


@pytest.mark.asyncio
async def test_stats_summary_and_timeseries_endpoints():
    """Verify /stats/summary and /stats/timeseries return calculated SQL aggregates and respect auth."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register User A
        reg_a = await client.post(
            "/auth/register",
            json={"email": "stats_user_a@hookrelay.dev", "password": "password123"},
        )
        token_a = reg_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # 1. Test unauthenticated access returns 401
        unauth = await client.get("/stats/summary")
        assert unauth.status_code == 401

        # 2. Test initial empty stats for User A
        stats_res = await client.get("/stats/summary", headers=headers_a)
        assert stats_res.status_code == 200
        data = stats_res.json()
        assert data["total_events"] == 0
        assert data["total_deliveries"] == 0
        assert data["success_rate_percent"] == 100.0

        # 3. Create endpoint for User A
        ep_res = await client.post(
            "/endpoints",
            headers=headers_a,
            json={"target_url": "https://api.my-stats-app.com/webhooks", "provider_type": "github"},
        )
        assert ep_res.status_code == 201
        slug = ep_res.json()["slug"]
        ep_id = ep_res.json()["id"]

        # Ingest 2 webhooks into this mailbox
        ingest1 = await client.post(f"/h/{slug}", json={"action": "test1"})
        assert ingest1.status_code == 202

        ingest2 = await client.post(f"/h/{slug}", json={"action": "test2"})
        assert ingest2.status_code == 202

        # 4. Check updated summary
        updated_stats = await client.get("/stats/summary", headers=headers_a)
        assert updated_stats.status_code == 200
        updated_data = updated_stats.json()
        assert updated_data["total_events"] >= 2
        assert updated_data["events_per_hour"] > 0

        # 5. Check timeseries endpoint
        ts_res = await client.get(f"/stats/timeseries?endpoint_id={ep_id}&hours=12", headers=headers_a)
        assert ts_res.status_code == 200
        ts_data = ts_res.json()
        assert ts_data["total_buckets"] == 12
        assert len(ts_data["buckets"]) == 12
        assert "timestamp" in ts_data["buckets"][-1]
        assert "total_events" in ts_data["buckets"][-1]

        # 6. Test Multi-Tenant Ownership Isolation (User B cannot see User A's endpoint stats)
        reg_b = await client.post(
            "/auth/register",
            json={"email": "stats_user_b@hookrelay.dev", "password": "password123"},
        )
        token_b = reg_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User B trying to access User A's endpoint stats should get 404
        forbidden_stats = await client.get(f"/stats/summary?endpoint_id={ep_id}", headers=headers_b)
        assert forbidden_stats.status_code == 404
