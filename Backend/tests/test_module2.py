import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_module2_endpoints_and_event_capture():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # --- 1. Register User A ---
        user_a_res = await client.post(
            "/auth/register",
            json={"email": "alice@hookrelay.dev", "password": "password123"},
        )
        assert user_a_res.status_code == 201
        token_a = user_a_res.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # --- 2. Register User B ---
        user_b_res = await client.post(
            "/auth/register",
            json={"email": "bob@hookrelay.dev", "password": "password123"},
        )
        assert user_b_res.status_code == 201
        token_b = user_b_res.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # --- 3. User A creates an endpoint ---
        create_res = await client.post(
            "/endpoints",
            headers=headers_a,
            json={
                "target_url": "https://api.my-app.internal/webhooks",
                "provider_type": "stripe",
            },
        )
        assert create_res.status_code == 201
        ep_data = create_res.json()
        endpoint_id = ep_data["id"]
        slug = ep_data["slug"]
        secret = ep_data["signing_secret"]
        assert slug is not None
        assert secret.startswith("whsec_")

        # --- 4. User A lists endpoints ---
        list_res = await client.get("/endpoints", headers=headers_a)
        assert list_res.status_code == 200
        assert len(list_res.json()) >= 1

        # --- 5. Public POST /h/{slug} (Simulation of curl / Stripe / Razorpay) ---
        webhook_payload = {
            "id": "evt_test_12345",
            "type": "payment_intent.succeeded",
            "data": {"amount": 2500, "currency": "usd"},
        }
        ingest_res = await client.post(
            f"/h/{slug}",
            json=webhook_payload,
            headers={
                "User-Agent": "Stripe/1.0",
                "Stripe-Signature": "t=1729505400,v1=abc123def456",
                "Idempotency-Key": "idemp_strip_9182",
            },
        )
        assert ingest_res.status_code == 202
        ingest_data = ingest_res.json()
        assert ingest_data["status"] == "accepted"
        event_id = ingest_data["event_id"]
        assert event_id is not None

        # --- 6. User A lists events for their endpoint ---
        events_res = await client.get(
            f"/endpoints/{endpoint_id}/events",
            headers=headers_a,
        )
        assert events_res.status_code == 200
        events_page = events_res.json()
        assert events_page["total"] == 1
        assert events_page["items"][0]["id"] == event_id

        # --- 7. User A fetches the event in full ---
        event_detail_res = await client.get(
            f"/events/{event_id}",
            headers=headers_a,
        )
        assert event_detail_res.status_code == 200
        detail = event_detail_res.json()
        assert detail["id"] == event_id
        assert detail["body"]["type"] == "payment_intent.succeeded"
        assert "stripe-signature" in {k.lower(): v for k, v in detail["headers"].items()}

        # --- 8. User B attempts to access User A's endpoint -> MUST return 404 ---
        user_b_ep_res = await client.get(
            f"/endpoints/{endpoint_id}",
            headers=headers_b,
        )
        assert user_b_ep_res.status_code == 404

        # User B attempts to update User A's endpoint -> MUST return 404
        user_b_patch_res = await client.patch(
            f"/endpoints/{endpoint_id}",
            headers=headers_b,
            json={"target_url": "https://hacker.com"},
        )
        assert user_b_patch_res.status_code == 404

        # User B attempts to delete User A's endpoint -> MUST return 404
        user_b_del_res = await client.delete(
            f"/endpoints/{endpoint_id}",
            headers=headers_b,
        )
        assert user_b_del_res.status_code == 404

        # User B attempts to rotate secret of User A's endpoint -> MUST return 404
        user_b_rot_res = await client.post(
            f"/endpoints/{endpoint_id}/rotate-secret",
            headers=headers_b,
        )
        assert user_b_rot_res.status_code == 404

        # User B attempts to list User A's events -> MUST return 404
        user_b_events_res = await client.get(
            f"/endpoints/{endpoint_id}/events",
            headers=headers_b,
        )
        assert user_b_events_res.status_code == 404

        # User B attempts to view User A's event detail -> MUST return 404
        user_b_event_res = await client.get(
            f"/events/{event_id}",
            headers=headers_b,
        )
        assert user_b_event_res.status_code == 404

        # --- 9. User A rotates secret successfully ---
        rot_res = await client.post(
            f"/endpoints/{endpoint_id}/rotate-secret",
            headers=headers_a,
        )
        assert rot_res.status_code == 200
        new_secret = rot_res.json()["signing_secret"]
        assert new_secret != secret
        assert new_secret.startswith("whsec_")


@pytest.mark.asyncio
async def test_module2_edge_cases_and_limits():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg = await client.post(
            "/auth/register",
            json={"email": "limits@hookrelay.dev", "password": "password123"},
        )
        token = reg.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create endpoint
        ep = await client.post(
            "/endpoints",
            headers=headers,
            json={"target_url": "https://api.limits-test.com", "provider_type": "custom"},
        )
        assert ep.status_code == 201
        ep_data = ep.json()
        slug = ep_data["slug"]
        ep_id = ep_data["id"]

        # 1. Unknown slug -> 404
        bad_slug = await client.post("/h/non-existent-slug-xyz", json={"hello": "world"})
        assert bad_slug.status_code == 404

        # 2. Oversized payload (> 2MB) -> 413
        oversized = "x" * (2 * 1024 * 1024 + 10)
        size_res = await client.post(
            f"/h/{slug}",
            content=oversized.encode("utf-8"),
            headers={"Content-Type": "text/plain"},
        )
        assert size_res.status_code == 413

        # 3. Idempotent webhook delivery
        idem_headers = {"Idempotency-Key": "unique-idemp-123", "Content-Type": "application/json"}
        ingest_1 = await client.post(f"/h/{slug}", json={"item": 1}, headers=idem_headers)
        assert ingest_1.status_code == 202
        evt_1_id = ingest_1.json()["event_id"]

        # Repeat identical idempotency key -> returns 202 and identical event_id
        ingest_2 = await client.post(f"/h/{slug}", json={"item": 1}, headers=idem_headers)
        assert ingest_2.status_code == 202
        assert ingest_2.json()["event_id"] == evt_1_id

        # 4. Ingest second event to test pagination
        ingest_3 = await client.post(f"/h/{slug}", json={"item": 2})
        assert ingest_3.status_code == 202
        evt_2_id = ingest_3.json()["event_id"]

        # Test pagination limit=1
        page1 = await client.get(f"/endpoints/{ep_id}/events?limit=1&offset=0", headers=headers)
        assert page1.status_code == 200
        p1_data = page1.json()
        assert p1_data["total"] == 2
        assert len(p1_data["items"]) == 1
        assert p1_data["items"][0]["id"] == evt_2_id  # latest first

        page2 = await client.get(f"/endpoints/{ep_id}/events?limit=1&offset=1", headers=headers)
        assert page2.status_code == 200
        p2_data = page2.json()
        assert len(p2_data["items"]) == 1
        assert p2_data["items"][0]["id"] == evt_1_id

        # Check endpoints list has events_count
        list_eps = await client.get("/endpoints", headers=headers)
        assert list_eps.status_code == 200
        found = [e for e in list_eps.json() if e["id"] == ep_id][0]
        assert found["events_count"] == 2

        # 5. Inactive endpoint -> 404 on ingest
        patch_res = await client.patch(
            f"/endpoints/{ep_id}",
            headers=headers,
            json={"is_active": False},
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["is_active"] is False

        inactive_ingest = await client.post(f"/h/{slug}", json={"item": 3})
        assert inactive_ingest.status_code == 404

        # 6. Delete endpoint -> 204
        del_res = await client.delete(f"/endpoints/{ep_id}", headers=headers)
        assert del_res.status_code == 204
        get_deleted = await client.get(f"/endpoints/{ep_id}", headers=headers)
        assert get_deleted.status_code == 404


@pytest.mark.asyncio
async def test_custom_mailbox_configuration_and_signature():
    import hmac
    import hashlib
    import base64
    import json

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg_res = await client.post(
            "/auth/register",
            json={"email": "custom_mailbox_user@hookrelay.dev", "password": "password123"},
        )
        token = reg_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Create custom mailbox with user's own name, custom provider, custom header and custom secret
        custom_secret = "custom_secret_key_12345"
        create_res = await client.post(
            "/endpoints",
            headers=headers,
            json={
                "name": "Shopify Orders Production",
                "description": "Captures customer order created webhooks from Shopify store",
                "target_url": "https://api.my-ecommerce.com/orders/webhook",
                "provider_type": "shopify",
                "custom_signature_header": "X-Shopify-Hmac-Sha256",
                "signing_secret": custom_secret,
            },
        )
        assert create_res.status_code == 201
        ep = create_res.json()
        assert ep["name"] == "Shopify Orders Production"
        assert ep["description"] == "Captures customer order created webhooks from Shopify store"
        assert ep["provider_type"] == "shopify"
        assert ep["custom_signature_header"] == "X-Shopify-Hmac-Sha256"
        assert ep["signing_secret"] == custom_secret
        slug = ep["slug"]
        ep_id = ep["id"]

        # Ingest a webhook signed with that custom secret
        payload = {"order_id": 9999, "total": "129.99"}
        raw_body = json.dumps(payload).encode("utf-8")
        computed_b64 = base64.b64encode(
            hmac.new(custom_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
        ).decode("utf-8")

        ingest_res = await client.post(
            f"/h/{slug}",
            content=raw_body,
            headers={
                "Content-Type": "application/json",
                "X-Shopify-Hmac-Sha256": computed_b64,
            },
        )
        assert ingest_res.status_code == 202

        # Check events
        events_res = await client.get(f"/endpoints/{ep_id}/events", headers=headers)
        assert events_res.status_code == 200
        events = events_res.json()["items"]
        assert len(events) == 1
        assert events[0]["signature_valid"] is True

        # Update mailbox name and description
        update_res = await client.patch(
            f"/endpoints/{ep_id}",
            headers=headers,
            json={
                "name": "Shopify Primary Webhook Gateway",
                "description": "Updated team notes: high priority",
            },
        )
        assert update_res.status_code == 200
        updated = update_res.json()
        assert updated["name"] == "Shopify Primary Webhook Gateway"
        assert updated["description"] == "Updated team notes: high priority"


