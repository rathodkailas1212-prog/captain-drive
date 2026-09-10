"""Iteration 6 — MSG91 real SMS OTP integration tests.

Split into two groups:
  * Dev-mode tests: hit the LIVE preview backend via HTTP (ZIPRIDE_ENV=development
    is default → OTP `1234` bypass is active, no MSG91 calls).
  * Prod-mode tests: use FastAPI TestClient in-process with `IS_PROD` monkey-
    patched to True and MSG91 HTTP calls mocked via `respx`.
"""
import os
import sys
import uuid
import pytest
import requests
import httpx
import respx

# Make backend importable for in-process prod tests
sys.path.insert(0, "/app/backend")

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://captain-driver-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


# ============================================================================
# DEV-MODE (live HTTP against preview backend)
# ============================================================================
@pytest.fixture(scope="module")
def sess():
    return requests.Session()


class TestDevSendOtp:
    """send-otp in dev mode — should NEVER hit MSG91, always return dev bypass."""

    def test_send_otp_valid_indian_phone_dev_bypass(self, sess):
        r = sess.post(f"{API}/auth/send-otp", json={"phone": "9876543210", "role": "customer"})
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        # Dev-mode message MUST indicate bypass so main agent knows MSG91 wasn't called
        assert "dev" in body["message"].lower() or "1234" in body["message"], body

    def test_send_otp_invalid_too_short(self, sess):
        r = sess.post(f"{API}/auth/send-otp", json={"phone": "12345", "role": "customer"})
        assert r.status_code == 400
        assert "Invalid Indian mobile number" in r.json()["detail"]

    def test_send_otp_invalid_starts_with_5(self, sess):
        # Indian mobile must start with 6-9
        r = sess.post(f"{API}/auth/send-otp", json={"phone": "5876543210", "role": "customer"})
        assert r.status_code == 400
        assert "Invalid Indian mobile number" in r.json()["detail"]

    def test_send_otp_invalid_non_digits(self, sess):
        r = sess.post(f"{API}/auth/send-otp", json={"phone": "abcdefghij", "role": "customer"})
        assert r.status_code == 400

    def test_send_otp_admin_skips_msg91(self, sess):
        # Admin phone doesn't need to be valid indian — it's short-circuited
        r = sess.post(f"{API}/auth/send-otp", json={"phone": "9999999999", "role": "admin"})
        assert r.status_code == 200
        assert "admin" in r.json()["message"].lower()


class TestDevVerifyOtp:
    """verify-otp in dev mode — accepts 1234 only."""

    def test_verify_1234_success(self, sess):
        phone = f"98{uuid.uuid4().int % 100000000:08d}"
        r = sess.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "1234", "role": "customer"})
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["user"]["role"] == "customer"
        assert body["token"]
        # Contract stability: response shape unchanged
        assert set(body.keys()) >= {"success", "user", "token"}

    def test_verify_wrong_otp_400(self, sess):
        phone = f"98{uuid.uuid4().int % 100000000:08d}"
        r = sess.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "9999", "role": "customer"})
        assert r.status_code == 400
        assert "Invalid OTP" in r.json()["detail"]

    def test_admin_login_ok(self, sess):
        r = sess.post(f"{API}/auth/verify-otp", json={"phone": "9999999999", "otp": "1234", "role": "admin"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "admin"

    def test_admin_login_wrong_phone_forbidden(self, sess):
        r = sess.post(f"{API}/auth/verify-otp", json={"phone": "9000000000", "otp": "1234", "role": "admin"})
        assert r.status_code == 403


class TestDevPhoneNormalization:
    """Spec #5: `9876543210`, `+919876543210`, `91-9876-543-210` → same user.

    NOTE: backend currently persists raw payload.phone; the normalization only
    happens for the MSG91-facing string. So the same underlying user record is
    NOT reused across these formats — this is flagged for main agent.
    """

    def test_all_three_formats_accepted_by_send_otp(self, sess):
        for p in ["9876500001", "+919876500001", "91-9876-500-001"]:
            r = sess.post(f"{API}/auth/send-otp", json={"phone": p, "role": "customer"})
            assert r.status_code == 200, f"format {p!r} rejected: {r.text}"

    def test_all_three_formats_resolve_to_same_user(self, sess):
        """Login with three formats — expect same user id. Currently fails."""
        ids = []
        for p in ["9876500002", "+919876500002", "91-9876-500-002"]:
            r = sess.post(f"{API}/auth/verify-otp", json={"phone": p, "otp": "1234", "role": "customer"})
            assert r.status_code == 200, f"{p}: {r.text}"
            ids.append(r.json()["user"]["id"])
        assert len(set(ids)) == 1, (
            f"Phone-normalization regression: three formats produced different user ids: {ids}. "
            "Backend stores payload.phone raw; only MSG91 string is normalized. Fix: normalize before DB lookup."
        )


# ============================================================================
# PROD-MODE (in-process, respx-mocked MSG91)
# ============================================================================
@pytest.fixture
def prod_client(monkeypatch):
    """Import server, force prod mode + fake keys, return TestClient.

    Uses ASGITransport so the app is fully in-process (no port collision with
    the supervisor-managed backend still running in dev-mode)."""
    import server  # /app/backend/server.py

    monkeypatch.setattr(server, "IS_PROD", True, raising=True)
    monkeypatch.setattr(server, "MSG91_AUTH_KEY", "TEST_KEY_XYZ", raising=True)
    monkeypatch.setattr(server, "MSG91_OTP_TEMPLATE_ID", "TEST_TPL_123", raising=True)

    from fastapi.testclient import TestClient
    return TestClient(server.app)


@pytest.fixture
def prod_client_unconfigured(monkeypatch):
    import server
    monkeypatch.setattr(server, "IS_PROD", True, raising=True)
    monkeypatch.setattr(server, "MSG91_AUTH_KEY", "", raising=True)
    monkeypatch.setattr(server, "MSG91_OTP_TEMPLATE_ID", "", raising=True)
    from fastapi.testclient import TestClient
    return TestClient(server.app)


class TestProdUnconfigured:
    """Spec #8 — prod without keys must NOT silently succeed."""

    def test_send_otp_500_when_keys_missing(self, prod_client_unconfigured):
        r = prod_client_unconfigured.post(
            "/api/auth/send-otp", json={"phone": "9876543210", "role": "customer"}
        )
        assert r.status_code == 500
        assert "MSG91 not configured" in r.json()["detail"]


class TestProdMsg91Integration:
    """Specs #9-#12 — real MSG91 calls (mocked)."""

    def test_send_otp_success_calls_msg91_with_correct_params(self, prod_client):
        with respx.mock(assert_all_called=True) as mock:
            route = mock.post("https://control.msg91.com/api/v5/otp").mock(
                return_value=httpx.Response(200, json={"type": "success", "message": "OTP sent"})
            )
            r = prod_client.post(
                "/api/auth/send-otp", json={"phone": "+91-9876-543-210", "role": "customer"}
            )
            assert r.status_code == 200, r.text
            assert r.json()["success"] is True

            call = route.calls[0]
            params = dict(call.request.url.params)
            assert params["template_id"] == "TEST_TPL_123"
            assert params["mobile"] == "919876543210"   # normalized 91XXXXXXXXXX
            assert params["authkey"] == "TEST_KEY_XYZ"  # authkey in QUERY for send
            assert params["otp_length"] == "4"
            assert params["otp_expiry"] == "10"

    def test_verify_otp_1234_rejected_in_prod(self, prod_client):
        """Spec #9 — `1234` MUST NOT bypass in prod for non-admin roles."""
        with respx.mock(assert_all_called=True) as mock:
            verify_route = mock.get("https://control.msg91.com/api/v5/otp/verify").mock(
                return_value=httpx.Response(200, json={"type": "error", "message": "OTP not match"})
            )
            r = prod_client.post(
                "/api/auth/verify-otp",
                json={"phone": "9876543210", "otp": "1234", "role": "customer"},
            )
            assert r.status_code == 400
            assert "Invalid or expired OTP" in r.json()["detail"]

            # Assert MSG91 verify was actually called with correct auth header + params
            call = verify_route.calls[0]
            assert call.request.headers.get("authkey") == "TEST_KEY_XYZ"  # header for verify
            params = dict(call.request.url.params)
            assert params["mobile"] == "919876543210"
            assert params["otp"] == "1234"

    def test_msg91_non_success_payload_returns_400(self, prod_client):
        """Spec #10."""
        with respx.mock() as mock:
            mock.get("https://control.msg91.com/api/v5/otp/verify").mock(
                return_value=httpx.Response(200, json={"type": "error", "message": "expired"})
            )
            r = prod_client.post(
                "/api/auth/verify-otp",
                json={"phone": "9876543210", "otp": "5678", "role": "customer"},
            )
            assert r.status_code == 400
            assert "Invalid or expired OTP" in r.json()["detail"]

    def test_msg91_5xx_returns_503_after_3_retries(self, prod_client):
        """Spec #11 — retry+backoff, max 3 attempts."""
        with respx.mock() as mock:
            route = mock.post("https://control.msg91.com/api/v5/otp").mock(
                return_value=httpx.Response(500, json={"message": "boom"})
            )
            r = prod_client.post(
                "/api/auth/send-otp", json={"phone": "9876543210", "role": "customer"}
            )
            assert r.status_code == 503
            assert "temporarily unavailable" in r.json()["detail"].lower()
            assert route.call_count == 3, f"Expected 3 retries, got {route.call_count}"

    def test_msg91_timeout_returns_503_after_3_retries(self, prod_client):
        """Spec #11 — network timeout also retried."""
        with respx.mock() as mock:
            route = mock.post("https://control.msg91.com/api/v5/otp").mock(
                side_effect=httpx.ReadTimeout("timeout")
            )
            r = prod_client.post(
                "/api/auth/send-otp", json={"phone": "9876543210", "role": "customer"}
            )
            assert r.status_code == 503
            assert route.call_count == 3

    def test_msg91_4xx_returns_502_no_retry(self, prod_client):
        """Spec #12."""
        with respx.mock() as mock:
            route = mock.post("https://control.msg91.com/api/v5/otp").mock(
                return_value=httpx.Response(400, json={"message": "bad template"})
            )
            r = prod_client.post(
                "/api/auth/send-otp", json={"phone": "9876543210", "role": "customer"}
            )
            assert r.status_code == 502
            assert "OTP provider rejected the request" in r.json()["detail"]
            assert route.call_count == 1, f"4xx must not retry, got {route.call_count} calls"


class TestProdAdminSkipsMsg91:
    """Spec #7 — admin path skips MSG91 entirely, even in production."""

    def test_admin_send_otp_no_msg91_call(self, prod_client):
        with respx.mock(assert_all_called=False) as mock:
            send = mock.post("https://control.msg91.com/api/v5/otp")
            verify = mock.get("https://control.msg91.com/api/v5/otp/verify")
            r = prod_client.post(
                "/api/auth/send-otp", json={"phone": "9999999999", "role": "admin"}
            )
            assert r.status_code == 200
            assert send.call_count == 0
            assert verify.call_count == 0

    def test_admin_verify_otp_no_msg91_call(self, prod_client):
        with respx.mock(assert_all_called=False) as mock:
            send = mock.post("https://control.msg91.com/api/v5/otp")
            verify = mock.get("https://control.msg91.com/api/v5/otp/verify")
            r = prod_client.post(
                "/api/auth/verify-otp",
                json={"phone": "9999999999", "otp": "1234", "role": "admin"},
            )
            assert r.status_code == 200
            assert r.json()["user"]["role"] == "admin"
            assert send.call_count == 0
            assert verify.call_count == 0

    def test_admin_wrong_phone_403_no_msg91(self, prod_client):
        with respx.mock(assert_all_called=False) as mock:
            verify = mock.get("https://control.msg91.com/api/v5/otp/verify")
            r = prod_client.post(
                "/api/auth/verify-otp",
                json={"phone": "9000000000", "otp": "1234", "role": "admin"},
            )
            assert r.status_code == 403
            assert verify.call_count == 0
