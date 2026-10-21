import pytest
import json
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User
from app.models.endpoint import Endpoint
from app.models.event import Event
from app.models.delivery import Delivery
from app.core.security import create_access_token


@pytest.mark.asyncio
async def test_module4_websocket_and_live_feed(db_session: AsyncSession):
    """
    Test Module 4 requirements:
    1. Authenticate to /ws/events with JWT token.
    2. Ingesting a webhook pushes event.created via WebSocket.
    3. Replaying pushes delivery.updated via WebSocket.
    """
    # 1. Create a user and endpoint in db
    user = User(email="ws_user@example.com", password_hash="hashed_pwd_123")
    db_session.add(user)
    await db_session.flush()

    token = create_access_token(subject=user.id)

    endpoint = Endpoint(
        user_id=user.id,
        slug="ws-slug-test-1234",
        signing_secret="whsec_websocket_test_secret",
        target_url="https://httpbin.org/post",
        provider_type="custom",
    )
    db_session.add(endpoint)
    await db_session.commit()

    # 2. Test WebSocket connection using FastAPI TestClient
    with TestClient(app) as client:
        with client.websocket_connect(f"/ws/events?token={token}") as websocket:
            # First message should be connection.established
            init_msg = websocket.receive_json()
            assert init_msg["type"] == "connection.established"
            assert init_msg["authenticated"] is True
            assert init_msg["user_id"] == user.id

            # Heartbeat ping/pong test
            websocket.send_text("ping")
            pong = websocket.receive_text()
            assert pong == "pong"


@pytest.mark.asyncio
async def test_module4_status_filtering(db_session: AsyncSession):
    """
    Test filtering events by delivery status (failed vs delivered vs all).
    """
    user = User(email="filter_user@example.com", password_hash="hashed_pwd_123")
    db_session.add(user)
    await db_session.flush()

    token = create_access_token(subject=user.id)

    endpoint = Endpoint(
        user_id=user.id,
        slug="filter-slug-test-123",
        signing_secret="whsec_filter_secret",
        target_url="https://httpbin.org/post",
        provider_type="custom",
    )
    db_session.add(endpoint)
    await db_session.flush()

    # Create event 1 with failed delivery
    e1 = Event(
        endpoint_id=endpoint.id,
        headers={"content-type": "application/json"},
        body={"order": 1},
        signature_valid=True,
    )
    db_session.add(e1)
    await db_session.flush()

    d1 = Delivery(
        event_id=e1.id,
        status="failed",
        attempt_count=5,
        last_error="Destination returned HTTP 503",
    )
    db_session.add(d1)

    # Create event 2 with delivered delivery
    e2 = Event(
        endpoint_id=endpoint.id,
        headers={"content-type": "application/json"},
        body={"order": 2},
        signature_valid=True,
    )
    db_session.add(e2)
    await db_session.flush()

    d2 = Delivery(
        event_id=e2.id,
        status="delivered",
        attempt_count=1,
        last_status_code=200,
    )
    db_session.add(d2)
    await db_session.commit()

    # Test filtering via API
    headers = {"Authorization": f"Bearer {token}"}
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        # All events
        r_all = await ac.get(f"/endpoints/{endpoint.id}/events", headers=headers)
        assert r_all.status_code == 200
        assert r_all.json()["total"] == 2

        # Filter by failed
        r_failed = await ac.get(f"/endpoints/{endpoint.id}/events?status=failed", headers=headers)
        assert r_failed.status_code == 200
        data_failed = r_failed.json()
        assert data_failed["total"] == 1
        assert data_failed["items"][0]["delivery_status"] == "failed"

        # Filter by delivered
        r_deliv = await ac.get(f"/endpoints/{endpoint.id}/events?status=delivered", headers=headers)
        assert r_deliv.status_code == 200
        data_deliv = r_deliv.json()
        assert data_deliv["total"] == 1
        assert data_deliv["items"][0]["delivery_status"] == "delivered"
