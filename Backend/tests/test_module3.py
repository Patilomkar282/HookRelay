import hmac
import hashlib
import json
from unittest.mock import patch, AsyncMock
import httpx
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.database import AsyncSessionLocal
from app.services.delivery_service import (
    forward_single_delivery,
    fetch_and_process_due_deliveries,
)


@pytest.mark.asyncio
async def test_module3_signature_verification():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg = await client.post(
            "/auth/register",
            json={"email": "sig_tester@hookrelay.dev", "password": "password123"},
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create endpoint with GitHub provider
        ep_res = await client.post(
            "/endpoints",
            headers=headers,
            json={"target_url": "https://api.my-app.com/webhooks", "provider_type": "github"},
        )
        ep = ep_res.json()
        slug = ep["slug"]
        secret = ep["signing_secret"]

        payload_bytes = json.dumps({"action": "opened", "issue": {"id": 123}}).encode()

        # 1. Compute valid GitHub HMAC-SHA256
        valid_digest = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()
        valid_sig_header = f"sha256={valid_digest}"

        res_valid = await client.post(
            f"/h/{slug}",
            content=payload_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": valid_sig_header,
                "X-GitHub-Delivery": "gh_deliv_valid_001",
            },
        )
        assert res_valid.status_code == 202
        evt_valid_id = res_valid.json()["event_id"]

        # Check signature_valid on event
        detail_valid = await client.get(f"/events/{evt_valid_id}", headers=headers)
        assert detail_valid.status_code == 200
        assert detail_valid.json()["signature_valid"] is True

        # 2. Test wrong / tampered signature -> signature_valid must be False
        res_invalid = await client.post(
            f"/h/{slug}",
            content=payload_bytes,
            headers={
                "Content-Type": "application/json",
                "X-Hub-Signature-256": "sha256=invalid_tampered_signature_hex",
                "X-GitHub-Delivery": "gh_deliv_invalid_002",
            },
        )
        assert res_invalid.status_code == 202
        evt_invalid_id = res_invalid.json()["event_id"]

        detail_invalid = await client.get(f"/events/{evt_invalid_id}", headers=headers)
        assert detail_invalid.status_code == 200
        assert detail_invalid.json()["signature_valid"] is False

        # 3. Test generic provider signature (X-Signature-SHA256)
        ep_generic_res = await client.post(
            "/endpoints",
            headers=headers,
            json={"target_url": "https://api.generic.com/hooks", "provider_type": "custom"},
        )
        ep_gen = ep_generic_res.json()
        gen_slug = ep_gen["slug"]
        gen_secret = ep_gen["signing_secret"]

        gen_payload = b'{"hello": "generic"}'
        gen_digest = hmac.new(gen_secret.encode(), gen_payload, hashlib.sha256).hexdigest()

        res_gen = await client.post(
            f"/h/{gen_slug}",
            content=gen_payload,
            headers={
                "Content-Type": "application/json",
                "X-Signature-SHA256": gen_digest,
            },
        )
        assert res_gen.status_code == 202
        gen_evt_id = res_gen.json()["event_id"]

        detail_gen = await client.get(f"/events/{gen_evt_id}", headers=headers)
        assert detail_gen.json()["signature_valid"] is True


@pytest.mark.asyncio
async def test_module3_idempotency_ignores_repeated_event():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg = await client.post(
            "/auth/register",
            json={"email": "idemp_test@hookrelay.dev", "password": "password123"},
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        ep = (await client.post(
            "/endpoints",
            headers=headers,
            json={"target_url": "https://api.target.com", "provider_type": "custom"},
        )).json()
        slug = ep["slug"]
        ep_id = ep["id"]

        # First delivery with provider event ID
        body = {"id": "evt_provider_unique_999", "action": "checkout"}
        r1 = await client.post(f"/h/{slug}", json=body)
        assert r1.status_code == 202
        evt_id = r1.json()["event_id"]

        # Repeated delivery with identical event ID
        r2 = await client.post(f"/h/{slug}", json=body)
        assert r2.status_code == 202
        assert r2.json()["event_id"] == evt_id

        # Total events for this endpoint must be exactly 1
        ep_events = (await client.get(f"/endpoints/{ep_id}/events", headers=headers)).json()
        assert ep_events["total"] == 1


@pytest.mark.asyncio
async def test_module3_delivery_failure_retry_and_exhaustion(db_session):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        reg = await client.post(
            "/auth/register",
            json={"email": "delivery_test@hookrelay.dev", "password": "password123"},
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        ep = (await client.post(
            "/endpoints",
            headers=headers,
            json={"target_url": "http://127.0.0.1:54321/offline-server", "provider_type": "custom"},
        )).json()
        slug = ep["slug"]

        # Ingest event
        ingest_res = await client.post(f"/h/{slug}", json={"type": "payment_failure"})
        assert ingest_res.status_code == 202
        event_id = ingest_res.json()["event_id"]

        # Check initial delivery row was created
        del_res = await client.get(f"/events/{event_id}/deliveries", headers=headers)
        assert del_res.status_code == 200
        deliveries = del_res.json()
        assert len(deliveries) >= 1
        d0 = deliveries[0]
        assert d0["status"] == "pending"
        assert d0["attempt_count"] == 0

        # Simulate forward with offline server (mocking connection failure via send_webhook_http)
        with patch("app.services.delivery_service.send_webhook_http", side_effect=httpx.ConnectError("Connection refused")):
            # Attempt 1 -> retrying
            d1 = await forward_single_delivery(db_session, d0["id"], fast_retry_mode=True)
            assert d1 is not None
            assert d1.last_status_code is None
            assert d1.attempt_count == 1
            assert d1.status == "retrying"
            assert d1.next_attempt_at is not None
            assert "Connection refused" in d1.last_error

            # Simulate repeated attempts until max (5 attempts)
            for _ in range(4):
                d_next = await forward_single_delivery(db_session, d0["id"], fast_retry_mode=True)

            # After 5 attempts, transitions to failed
            assert d_next is not None
            assert d_next.status == "failed"
            assert d_next.next_attempt_at is None
            assert d_next.attempt_count == 5


@pytest.mark.asyncio
async def test_module3_replay_and_deliveries_query():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register User A
        reg_a = await client.post(
            "/auth/register",
            json={"email": "alice_rep@hookrelay.dev", "password": "password123"},
        )
        token_a = reg_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # Register User B
        reg_b = await client.post(
            "/auth/register",
            json={"email": "bob_rep@hookrelay.dev", "password": "password123"},
        )
        token_b = reg_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # User A creates endpoint
        ep = (await client.post(
            "/endpoints",
            headers=headers_a,
            json={"target_url": "https://api.my-app.com/replay-test", "provider_type": "custom"},
        )).json()
        ep_id = ep["id"]
        slug = ep["slug"]

        # Ingest event
        evt_res = await client.post(f"/h/{slug}", json={"replay": "me"})
        evt_id = evt_res.json()["event_id"]

        # User A queries deliveries
        dels_a = await client.get(f"/events/{evt_id}/deliveries", headers=headers_a)
        assert dels_a.status_code == 200
        assert len(dels_a.json()) == 1

        # User B tries to query User A's deliveries -> 404
        dels_b = await client.get(f"/events/{evt_id}/deliveries", headers=headers_b)
        assert dels_b.status_code == 404

        # User B tries to replay User A's event -> 404
        replay_b = await client.post(f"/events/{evt_id}/replay", headers=headers_b)
        assert replay_b.status_code == 404

        # User B tries bulk replay on User A's endpoint -> 404
        bulk_b = await client.post(f"/endpoints/{ep_id}/replay-failed", headers=headers_b)
        assert bulk_b.status_code == 404

        # User A successfully replays event (mocking successful 200 destination response)
        mock_response = httpx.Response(status_code=200, json={"received": True})
        with patch("app.services.delivery_service.send_webhook_http", return_value=mock_response):
            replay_res = await client.post(f"/events/{evt_id}/replay", headers=headers_a)
            assert replay_res.status_code == 200
            rep_data = replay_res.json()
            assert rep_data["status"] == "delivered"
            assert rep_data["last_status_code"] == 200
            assert rep_data["attempt_count"] == 1
            assert rep_data["last_status_code"] == 200
            assert rep_data["attempt_count"] == 1

        # User A calls bulk replay
        bulk_a = await client.post(f"/endpoints/{ep_id}/replay-failed", headers=headers_a)
        assert bulk_a.status_code == 200
        assert "replayed_count" in bulk_a.json()
