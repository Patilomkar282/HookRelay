import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_auth_full_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register new user
        reg_payload = {"email": "dev@hookrelay.io", "password": "securepassword123"}
        reg_resp = await client.post("/auth/register", json=reg_payload)
        assert reg_resp.status_code == 201, reg_resp.text
        reg_data = reg_resp.json()
        assert "access_token" in reg_data
        assert reg_data["user"]["email"] == "dev@hookrelay.io"
        token = reg_data["access_token"]

        # 2. Duplicate registration returns 400
        dup_resp = await client.post("/auth/register", json=reg_payload)
        assert dup_resp.status_code == 400

        # 3. Log in with correct password
        login_resp = await client.post("/auth/login", json=reg_payload)
        assert login_resp.status_code == 200
        assert "access_token" in login_resp.json()

        # 4. Wrong password returns 401
        wrong_pw_resp = await client.post(
            "/auth/login",
            json={"email": "dev@hookrelay.io", "password": "wrongpassword!"},
        )
        assert wrong_pw_resp.status_code == 401
        assert "Invalid email or password" in wrong_pw_resp.json()["detail"]

        # 5. Access /auth/me with valid Bearer token
        me_resp = await client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me_resp.status_code == 200
        assert me_resp.json()["email"] == "dev@hookrelay.io"

        # 6. Access /auth/me with missing token returns 401
        no_token_resp = await client.get("/auth/me")
        assert no_token_resp.status_code == 401

        # 7. Access /auth/me with invalid token returns 401
        bad_token_resp = await client.get(
            "/auth/me",
            headers={"Authorization": "Bearer invalid.token.value"},
        )
        assert bad_token_resp.status_code == 401
