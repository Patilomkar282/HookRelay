import copy
import json
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, func

from app.main import app
from app.config import settings
from app.database import AsyncSessionLocal
from app.models.delivery import Delivery
from app.services.transform import process as transform_process


@pytest.mark.asyncio
async def test_rules_api_full_suite():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Setup User A and User B
        res_a = await client.post("/auth/register", json={"email": "rule_user_a@test.com", "password": "password123"})
        assert res_a.status_code == 201
        token_a = res_a.json()["access_token"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        res_b = await client.post("/auth/register", json={"email": "rule_user_b@test.com", "password": "password123"})
        assert res_b.status_code == 201
        token_b = res_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 2. User A creates an endpoint
        ep_res = await client.post(
            "/endpoints",
            headers=headers_a,
            json={"target_url": "https://api.example.com/webhook", "provider_type": "custom"},
        )
        assert ep_res.status_code == 201
        endpoint_id = ep_res.json()["id"]
        slug = ep_res.json()["slug"]

        # 3. GET /endpoints/{id}/rules initial state
        rules_get_res = await client.get(f"/endpoints/{endpoint_id}/rules", headers=headers_a)
        assert rules_get_res.status_code == 200
        data = rules_get_res.json()
        assert data["rules_version"] == 0
        assert data["filter"] is None
        assert data["transform"] is None

        # 4. Valid rule saves and rules_version rises by 1
        valid_rules = {
            "filter": {
                "match": "all",
                "conditions": [
                    {"field": "body.event", "op": "equals", "value": "payment.captured"},
                    {"field": "body.amount", "op": "gt", "value": 100},
                ],
            },
            "transform": [
                {
                    "op": "project",
                    "map": {
                        "event_name": "event",
                        "charge_amount": "amount",
                    },
                },
                {
                    "op": "set",
                    "path": "source",
                    "value": "HookRelay",
                },
            ],
        }
        save_res = await client.put(f"/endpoints/{endpoint_id}/rules", headers=headers_a, json=valid_rules)
        assert save_res.status_code == 200
        saved_data = save_res.json()
        assert saved_data["rules_version"] == 1
        assert saved_data["filter"]["match"] == "all"
        assert len(saved_data["transform"]) == 2

        # 5. Saving identical rules does NOT change rules_version
        ident_res = await client.put(f"/endpoints/{endpoint_id}/rules", headers=headers_a, json=valid_rules)
        assert ident_res.status_code == 200
        assert ident_res.json()["rules_version"] == 1

        # 6. Test rejected validations:
        # 6a. 21 steps is rejected (max 20)
        too_many_steps = {
            "transform": [{"op": "mask", "path": f"field_{i}"} for i in range(21)]
        }
        res_21 = await client.put(f"/endpoints/{endpoint_id}/rules", headers=headers_a, json=too_many_steps)
        assert res_21.status_code == 422

        # 6b. Bad path is rejected (special characters or double dots)
        bad_path_payload = {
            "transform": [{"op": "mask", "path": "invalid..path"}]
        }
        res_bad_path = await client.put(f"/endpoints/{endpoint_id}/rules", headers=headers_a, json=bad_path_payload)
        assert res_bad_path.status_code == 422

        # 6c. Path exceeding depth 10 is rejected
        deep_path = "a.b.c.d.e.f.g.h.i.j.k"  # 11 segments
        res_deep = await client.put(
            f"/endpoints/{endpoint_id}/rules",
            headers=headers_a,
            json={"transform": [{"op": "mask", "path": deep_path}]},
        )
        assert res_deep.status_code == 422

        # 6d. gt with string value is rejected
        gt_string_payload = {
            "filter": {
                "match": "all",
                "conditions": [{"field": "body.amount", "op": "gt", "value": "invalid_number_string"}],
            }
        }
        res_gt_str = await client.put(f"/endpoints/{endpoint_id}/rules", headers=headers_a, json=gt_string_payload)
        assert res_gt_str.status_code == 422

        # 6e. in with non-list is rejected
        in_str_payload = {
            "filter": {
                "match": "all",
                "conditions": [{"field": "body.status", "op": "in", "value": "not_a_list"}],
            }
        }
        res_in_str = await client.put(f"/endpoints/{endpoint_id}/rules", headers=headers_a, json=in_str_payload)
        assert res_in_str.status_code == 422

        # 7. Ownership checks: User B gets 404 on User A's rules and preview
        res_b_get = await client.get(f"/endpoints/{endpoint_id}/rules", headers=headers_b)
        assert res_b_get.status_code == 404

        res_b_put = await client.put(f"/endpoints/{endpoint_id}/rules", headers=headers_b, json=valid_rules)
        assert res_b_put.status_code == 404

        res_b_prev = await client.post(
            f"/endpoints/{endpoint_id}/rules/preview",
            headers=headers_b,
            json={"sample_json": {"test": 123}},
        )
        assert res_b_prev.status_code == 404

        # 8. Ingest an event and test stored event preview
        ingest_res = await client.post(
            f"/h/{slug}",
            json={"event": "payment.captured", "amount": 250, "secret": "dont_leak"},
            headers={"Content-Type": "application/json"},
        )
        assert ingest_res.status_code == 202
        event_id = ingest_res.json()["event_id"]

        # Check deliveries before preview using client API
        deliv_res_before = await client.get(f"/events/{event_id}/deliveries", headers=headers_a)
        assert deliv_res_before.status_code == 200
        count_before = len(deliv_res_before.json())

        # Preview stored event using saved rules
        preview_res = await client.post(
            f"/endpoints/{endpoint_id}/rules/preview",
            headers=headers_a,
            json={"event_id": event_id},
        )
        assert preview_res.status_code == 200
        p_data = preview_res.json()
        assert p_data["matches"] is True
        assert p_data["action"] == "forward_transformed"
        assert p_data["output"] == {
            "event_name": "payment.captured",
            "charge_amount": 250,
            "source": "HookRelay",
        }
        assert p_data["error"] is None

        # Verify preview gave identical output to pure transform engine
        direct_outcome = transform_process(
            rules=saved_data,
            headers={"Content-Type": "application/json"},
            raw_body=json.dumps({"event": "payment.captured", "amount": 250, "secret": "dont_leak"}),
        )
        assert direct_outcome.action == p_data["action"]
        assert json.loads(direct_outcome.body_bytes.decode()) == p_data["output"]

        # Preview NEVER creates a delivery
        deliv_res_after = await client.get(f"/events/{event_id}/deliveries", headers=headers_a)
        assert deliv_res_after.status_code == 200
        count_after = len(deliv_res_after.json())
        assert count_after == count_before

        # 9. Preview with ad-hoc rules without saving
        adhoc_preview = await client.post(
            f"/endpoints/{endpoint_id}/rules/preview",
            headers=headers_a,
            json={
                "sample_json": {"type": "order.completed", "total": 99},
                "rules": {
                    "filter": {
                        "match": "all",
                        "conditions": [{"field": "body.type", "op": "equals", "value": "order.completed"}],
                    },
                    "transform": [
                        {"op": "set", "path": "status", "value": "processed"}
                    ],
                },
            },
        )
        assert adhoc_preview.status_code == 200
        assert adhoc_preview.json()["matches"] is True
        assert adhoc_preview.json()["output"] == {
            "type": "order.completed",
            "total": 99,
            "status": "processed",
        }

        # 10. Filtered sample preview
        filtered_preview = await client.post(
            f"/endpoints/{endpoint_id}/rules/preview",
            headers=headers_a,
            json={
                "sample_json": {"event": "payment.failed", "amount": 50},  # Fails saved filter
            },
        )
        assert filtered_preview.status_code == 200
        assert filtered_preview.json()["matches"] is False
        assert filtered_preview.json()["action"] == "filtered"
        assert filtered_preview.json()["output"] is None

        # 11. Feature flag off returns 404
        settings.FEATURE_RULES = False
        try:
            off_res = await client.get(f"/endpoints/{endpoint_id}/rules", headers=headers_a)
            assert off_res.status_code == 404
            off_prev = await client.post(
                f"/endpoints/{endpoint_id}/rules/preview",
                headers=headers_a,
                json={"sample_json": {"a": 1}},
            )
            assert off_prev.status_code == 404
        finally:
            settings.FEATURE_RULES = True
