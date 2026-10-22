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


@pytest.mark.asyncio
async def test_user_settings_and_api_keys():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Register user
        reg_resp = await client.post(
            "/auth/register",
            json={"email": "settings_user@hookrelay.io", "password": "mypassword123"},
        )
        assert reg_resp.status_code == 201
        token = reg_resp.json()["access_token"]
        auth_headers = {"Authorization": f"Bearer {token}"}

        # 1. Update profile, email & delivery defaults
        patch_resp = await client.patch(
            "/auth/profile",
            json={
                "email": "updated_settings_user@hookrelay.io",
                "full_name": "Senior Webhook Engineer",
                "retry_attempts": 5,
                "delivery_timeout": 30,
                "email_alerts": False,
            },
            headers=auth_headers,
        )
        assert patch_resp.status_code == 200
        updated = patch_resp.json()
        assert updated["email"] == "updated_settings_user@hookrelay.io"
        assert updated["full_name"] == "Senior Webhook Engineer"
        assert updated["retry_attempts"] == 5
        assert updated["delivery_timeout"] == 30
        assert updated["email_alerts"] is False

        # 2. Change password - test fail on wrong password
        bad_pwd_resp = await client.post(
            "/auth/change-password",
            json={"current_password": "wrong_password", "new_password": "brandnewpassword123"},
            headers=auth_headers,
        )
        assert bad_pwd_resp.status_code == 400

        # 3. Change password - succeed
        ok_pwd_resp = await client.post(
            "/auth/change-password",
            json={"current_password": "mypassword123", "new_password": "brandnewpassword123"},
            headers=auth_headers,
        )
        assert ok_pwd_resp.status_code == 200

        # Login with new email and new password
        new_login_resp = await client.post(
            "/auth/login",
            json={"email": "updated_settings_user@hookrelay.io", "password": "brandnewpassword123"},
        )
        assert new_login_resp.status_code == 200

        # 4. API Keys - Create Key
        key_create_resp = await client.post(
            "/auth/api-keys",
            json={"name": "GitHub Actions CI"},
            headers=auth_headers,
        )
        assert key_create_resp.status_code == 201
        key_data = key_create_resp.json()
        raw_key = key_data["key"]
        key_id = key_data["id"]
        assert raw_key.startswith("hr_live_")

        # 5. Authenticate to /auth/me using Bearer API Key!
        api_key_auth_headers = {"Authorization": f"Bearer {raw_key}"}
        me_with_key_resp = await client.get("/auth/me", headers=api_key_auth_headers)
        assert me_with_key_resp.status_code == 200
        assert me_with_key_resp.json()["email"] == "updated_settings_user@hookrelay.io"

        # 5b. Authenticate using X-API-Key header!
        x_api_key_headers = {"X-API-Key": raw_key}
        me_x_key_resp = await client.get("/auth/me", headers=x_api_key_headers)
        assert me_x_key_resp.status_code == 200
        assert me_x_key_resp.json()["email"] == "updated_settings_user@hookrelay.io"

        # 6. List API keys
        list_keys_resp = await client.get("/auth/api-keys", headers=auth_headers)
        assert list_keys_resp.status_code == 200
        keys_list = list_keys_resp.json()
        assert len(keys_list) >= 1
        assert keys_list[0]["id"] == key_id

        # 7. Revoke API key
        del_key_resp = await client.delete(f"/auth/api-keys/{key_id}", headers=auth_headers)
        assert del_key_resp.status_code == 200

        # 8. Verifying revoked API key fails
        revoked_auth_resp = await client.get("/auth/me", headers=api_key_auth_headers)
        assert revoked_auth_resp.status_code == 401

        # 9. Purge events
        purge_resp = await client.post("/auth/danger/purge-events", headers=auth_headers)
        assert purge_resp.status_code == 200

        # 10. Delete account - wrong password fails
        bad_del_resp = await client.post(
            "/auth/danger/delete-account",
            json={"password": "wrongpassword"},
            headers=auth_headers,
        )
        assert bad_del_resp.status_code == 400

        # Delete account - succeeds
        ok_del_resp = await client.post(
            "/auth/danger/delete-account",
            json={"password": "brandnewpassword123"},
            headers=auth_headers,
        )
        assert ok_del_resp.status_code == 200
