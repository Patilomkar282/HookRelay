import uuid
from datetime import datetime, timezone
from unittest.mock import patch
import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.config import settings
from app.core import crypto
from app.models.user import User
from app.models.endpoint import Endpoint
from app.models.alert import AlertChannel, AlertRule
from app.services import alerting
from app.core.security import create_access_token


@pytest.fixture
def auth_headers_user_a():
    token = create_access_token(subject="user_a_123")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_user_b():
    token = create_access_token(subject="user_b_456")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def reset_rate_limits():
    alerting._test_rate_limits.clear()
    settings.FEATURE_ALERTS = True
    yield
    alerting._test_rate_limits.clear()
    settings.FEATURE_ALERTS = True


@pytest.mark.asyncio
async def test_slack_wrong_host_rejected_with_422(db_session, auth_headers_user_a):
    """Verify that Slack webhook URLs with wrong schemes or hostnames are rejected with 422."""
    user = User(id="user_a_123", email="user_a@example.com", password_hash="hash")
    db_session.add(user)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Hostname is a subdomain bypass attempt: hooks.slack.com.evil.com
        res = await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={
                "type": "slack",
                "name": "Bypass Slack",
                "webhook_url": "https://hooks.slack.com.evil.com/services/T1/B1/X1",
            },
        )
        assert res.status_code == 422

        # 2. Insecure HTTP scheme
        res2 = await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={
                "type": "slack",
                "name": "Insecure Slack",
                "webhook_url": "http://hooks.slack.com/services/T1/B1/X1",
            },
        )
        assert res2.status_code == 422

        # 3. Completely arbitrary domain
        res3 = await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={
                "type": "slack",
                "name": "Other Host",
                "webhook_url": "https://discord.com/api/webhooks/123/456",
            },
        )
        assert res3.status_code == 422


@pytest.mark.asyncio
async def test_slack_valid_url_succeeds_and_never_returns_secret(db_session, auth_headers_user_a):
    """Verify that a valid Slack channel is created, and secrets are NEVER returned."""
    user = User(id="user_a_123", email="user_a@example.com", password_hash="hash")
    db_session.add(user)
    await db_session.commit()

    raw_secret_url = "https://hooks.slack.com/services/T12345/B67890/SECRET9999"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={
                "type": "slack",
                "name": "Production Alerts",
                "webhook_url": raw_secret_url,
            },
        )
        assert res.status_code == 201
        data = res.json()

        # Secrets MUST NOT leak in response
        assert "webhook_url" not in data
        assert "config" not in data
        assert "config_encrypted" not in data
        assert raw_secret_url not in str(data)

        # Masked hint is returned
        assert data["name"] == "Production Alerts"
        assert data["type"] == "slack"
        assert data["hint"] == "****9999"
        assert data["verified_at"] is None


@pytest.mark.asyncio
async def test_email_channel_uses_user_email_only(db_session, auth_headers_user_a):
    """Verify that email channel ignores user-supplied address and strictly uses user's registered email."""
    user = User(id="user_a_123", email="registered_owner@company.com", password_hash="hash")
    db_session.add(user)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={
                "type": "email",
                "name": "Owner Email",
                "webhook_url": "https://attacker-controlled.com",
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["type"] == "email"
        assert data["hint"] == "****@company.com"

        # Check DB directly to ensure registered_owner@company.com was stored
        channel = await db_session.get(AlertChannel, data["id"])
        decrypted = crypto.decrypt_json(channel.config_encrypted)
        assert decrypted["email"] == "registered_owner@company.com"


@pytest.mark.asyncio
async def test_get_alert_channels_shows_only_masked_hints(db_session, auth_headers_user_a):
    """Verify GET /alert-channels returns list with only masked hints and zero leaked secrets."""
    user = User(id="user_a_123", email="user_a@example.com", password_hash="hash")
    db_session.add(user)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Create one slack and one email channel
        await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={"type": "slack", "name": "Slack Ch", "webhook_url": "https://hooks.slack.com/services/T/B/X4321"},
        )
        await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={"type": "email", "name": "Email Ch"},
        )

        res = await client.get("/alert-channels", headers=auth_headers_user_a)
        assert res.status_code == 200
        channels = res.json()
        assert len(channels) == 2
        for ch in channels:
            assert "webhook_url" not in ch
            assert "config" not in ch
            assert ch["hint"].startswith("****")


@pytest.mark.asyncio
async def test_multi_tenancy_user_b_gets_404_on_user_a_channel(
    db_session, auth_headers_user_a, auth_headers_user_b
):
    """Verify strict multi-tenancy: User B receives 404 when attempting to test or delete User A's channel."""
    user_a = User(id="user_a_123", email="user_a@example.com", password_hash="hash")
    user_b = User(id="user_b_456", email="user_b@example.com", password_hash="hash")
    db_session.add_all([user_a, user_b])
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={"type": "slack", "name": "User A Channel", "webhook_url": "https://hooks.slack.com/services/T/B/X1111"},
        )
        channel_id = create_res.json()["id"]

        # User B tries to test User A's channel -> 404
        test_res = await client.post(
            f"/alert-channels/{channel_id}/test",
            headers=auth_headers_user_b,
        )
        assert test_res.status_code == 404

        # User B tries to delete User A's channel -> 404
        del_res = await client.delete(
            f"/alert-channels/{channel_id}",
            headers=auth_headers_user_b,
        )
        assert del_res.status_code == 404


@pytest.mark.asyncio
async def test_test_route_slack_success_verifies_channel(db_session, auth_headers_user_a):
    """Verify that a successful test on a Slack channel sets verified_at."""
    user = User(id="user_a_123", email="user_a@example.com", password_hash="hash")
    db_session.add(user)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={"type": "slack", "name": "Slack Alert", "webhook_url": "https://hooks.slack.com/services/T/B/X2222"},
        )
        channel_id = create_res.json()["id"]

        with patch("app.services.alerting.send_slack", return_value=(True, None)) as mock_send:
            res = await client.post(
                f"/alert-channels/{channel_id}/test",
                headers=auth_headers_user_a,
            )
            assert res.status_code == 200
            data = res.json()
            assert data["success"] is True
            assert data["error"] is None
            assert mock_send.called

        # Channel verified_at is now set
        list_res = await client.get("/alert-channels", headers=auth_headers_user_a)
        target = [c for c in list_res.json() if c["id"] == channel_id][0]
        assert target["verified_at"] is not None


@pytest.mark.asyncio
async def test_test_route_failing_sender_returns_error_and_does_not_raise(db_session, auth_headers_user_a):
    """Verify that a failing sender returns an error gracefully without throwing a 500 server crash."""
    user = User(id="user_a_123", email="user_a@example.com", password_hash="hash")
    db_session.add(user)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={"type": "slack", "name": "Slack Alert", "webhook_url": "https://hooks.slack.com/services/T/B/X3333"},
        )
        channel_id = create_res.json()["id"]

        with patch("app.services.alerting.send_slack", return_value=(False, "HTTP 500")):
            res = await client.post(
                f"/alert-channels/{channel_id}/test",
                headers=auth_headers_user_a,
            )
            assert res.status_code == 200
            data = res.json()
            assert data["success"] is False
            assert data["error"] == "HTTP 500"


@pytest.mark.asyncio
async def test_test_route_email_verification_flow(db_session, auth_headers_user_a):
    """Verify email channel verification flow: sending test generates code, and entering code sets verified_at."""
    user = User(id="user_a_123", email="user_a@example.com", password_hash="hash")
    db_session.add(user)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={"type": "email", "name": "Admin Email"},
        )
        channel_id = create_res.json()["id"]

        with patch("app.services.alerting.send_email", return_value=(True, None)):
            test_res = await client.post(
                f"/alert-channels/{channel_id}/test",
                headers=auth_headers_user_a,
            )
            assert test_res.status_code == 200
            assert test_res.json()["needs_verification"] is True

        # Read verification code from encrypted config
        channel = await db_session.get(AlertChannel, channel_id)
        cfg = crypto.decrypt_json(channel.config_encrypted)
        code = cfg["verification_code"]
        assert len(code) == 6

        # Submit wrong code -> 400 Bad Request
        wrong_res = await client.post(
            f"/alert-channels/{channel_id}/verify",
            headers=auth_headers_user_a,
            json={"code": "000000"},
        )
        assert wrong_res.status_code == 400

        # Submit correct code -> 200 OK, verified_at is set
        verify_res = await client.post(
            f"/alert-channels/{channel_id}/verify",
            headers=auth_headers_user_a,
            json={"code": code},
        )
        assert verify_res.status_code == 200
        assert verify_res.json()["verified_at"] is not None


@pytest.mark.asyncio
async def test_delete_channel_removes_associated_rules(db_session, auth_headers_user_a):
    """Verify that deleting an alert channel automatically deletes its associated alert rules."""
    user = User(id="user_a_123", email="user_a@example.com", password_hash="hash")
    ep = Endpoint(id=str(uuid.uuid4()), user_id=user.id, slug="ep_test_del", target_url="http://t.com", is_active=True)
    channel = AlertChannel(
        id=str(uuid.uuid4()),
        user_id=user.id,
        type="slack",
        name="Channel To Delete",
        config_encrypted=crypto.encrypt_json({"webhook_url": "https://hooks.slack.com/services/T/B/X"}),
    )
    rule = AlertRule(
        id=str(uuid.uuid4()),
        user_id=user.id,
        endpoint_id=ep.id,
        channel_id=channel.id,
        type="consecutive_failures",
        params={"threshold": 5},
    )
    db_session.add_all([user, ep, channel, rule])
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        del_res = await client.delete(
            f"/alert-channels/{channel.id}",
            headers=auth_headers_user_a,
        )
        assert del_res.status_code == 204

    # Both channel and rule must be gone
    assert await db_session.get(AlertChannel, channel.id) is None
    assert await db_session.get(AlertRule, rule.id) is None


@pytest.mark.asyncio
async def test_feature_alerts_disabled_returns_404(db_session, auth_headers_user_a):
    """Verify that with FEATURE_ALERTS=False all alert channel endpoints return 404 Not Found."""
    settings.FEATURE_ALERTS = False

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res1 = await client.get("/alert-channels", headers=auth_headers_user_a)
        assert res1.status_code == 404

        res2 = await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={"type": "slack", "name": "Disabled", "webhook_url": "https://hooks.slack.com/services/T/B/X"},
        )
        assert res2.status_code == 404


@pytest.mark.asyncio
async def test_rate_limit_exceeded_on_test_route(db_session, auth_headers_user_a):
    """Verify that exceeding 5 test alert calls per minute returns 429 Too Many Requests."""
    user = User(id="user_a_123", email="user_a@example.com", password_hash="hash")
    db_session.add(user)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_res = await client.post(
            "/alert-channels",
            headers=auth_headers_user_a,
            json={"type": "slack", "name": "Rate Limit Test", "webhook_url": "https://hooks.slack.com/services/T/B/X"},
        )
        channel_id = create_res.json()["id"]

        with patch("app.services.alerting.send_slack", return_value=(True, None)):
            for i in range(5):
                r = await client.post(f"/alert-channels/{channel_id}/test", headers=auth_headers_user_a)
                assert r.status_code == 200

            # 6th attempt should be blocked by rate limiter
            r_blocked = await client.post(f"/alert-channels/{channel_id}/test", headers=auth_headers_user_a)
            assert r_blocked.status_code == 429
            assert "Rate limit exceeded" in r_blocked.json()["detail"]
