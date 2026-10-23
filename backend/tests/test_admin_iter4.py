"""Iteration 4 admin panel + bug-fix backend tests."""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://captain-driver-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
ADMIN_PHONE = "9999999999"


def _login(sess, phone, role):
    sess.post(f"{API}/auth/send-otp", json={"phone": phone, "role": role})
    r = sess.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "1234", "role": role})
    assert r.status_code == 200, r.text
    d = r.json()
    return d["token"], d["user"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _assert_no_id(o):
    if isinstance(o, dict):
        assert "_id" not in o
        for v in o.values():
            _assert_no_id(v)
    elif isinstance(o, list):
        for x in o:
            _assert_no_id(x)


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def admin(s):
    tok, u = _login(s, ADMIN_PHONE, "admin")
    assert u["role"] == "admin"
    return {"token": tok, "user": u, "h": _hdr(tok)}


@pytest.fixture(scope="module")
def customer(s):
    phone = f"98{uuid.uuid4().int % 100000000:08d}"
    tok, u = _login(s, phone, "customer")
    return {"token": tok, "user": u, "h": _hdr(tok), "phone": phone}


@pytest.fixture(scope="module")
def captain(s):
    phone = f"90{uuid.uuid4().int % 100000000:08d}"
    tok, u = _login(s, phone, "captain")
    return {"token": tok, "user": u, "h": _hdr(tok), "phone": phone}


# --------- admin login guards ----------
def test_admin_login_wrong_phone(s):
    s.post(f"{API}/auth/send-otp", json={"phone": "1234567890", "role": "admin"})
    r = s.post(f"{API}/auth/verify-otp", json={"phone": "1234567890", "otp": "1234", "role": "admin"})
    assert r.status_code == 403
    assert "admin" in r.text.lower()


def test_admin_login_ok(admin):
    assert admin["user"]["phone"] == ADMIN_PHONE
    assert admin["token"]


# --------- dashboard ----------
def test_admin_dashboard_ok(s, admin):
    r = s.get(f"{API}/admin/dashboard", headers=admin["h"])
    assert r.status_code == 200, r.text
    d = r.json()
    _assert_no_id(d)
    for k in ("total_customers", "total_captains", "active_captains", "pending_kyc",
              "rides_today", "revenue_today", "commission_today", "open_complaints", "weekly"):
        assert k in d, f"missing {k}"
    assert isinstance(d["weekly"], list)


def test_admin_dashboard_forbidden_for_customer(s, customer):
    r = s.get(f"{API}/admin/dashboard", headers=customer["h"])
    assert r.status_code == 403


# --------- fleet ----------
def test_admin_fleet(s, admin, captain):
    r = s.get(f"{API}/admin/fleet", headers=admin["h"])
    assert r.status_code == 200
    body = r.json()
    _assert_no_id(body)
    caps = body["captains"]
    assert isinstance(caps, list)
    assert any(c["id"] == captain["user"]["id"] for c in caps)
    # each has synthetic lat/lng
    for c in caps:
        assert "lat" in c and "lng" in c


# --------- users list + filters ----------
def test_admin_users_list(s, admin, customer, captain):
    r = s.get(f"{API}/admin/users", headers=admin["h"])
    assert r.status_code == 200
    ids = [u["id"] for u in r.json()["users"]]
    assert customer["user"]["id"] in ids
    assert captain["user"]["id"] in ids


def test_admin_users_filter_pending_kyc(s, admin, captain):
    # fresh captain has no kyc yet
    r = s.get(f"{API}/admin/users", params={"filter": "pending_kyc"}, headers=admin["h"])
    assert r.status_code == 200
    users = r.json()["users"]
    for u in users:
        assert u["role"] == "captain"
        assert not u.get("kyc_verified")


def test_admin_users_search(s, admin, customer):
    r = s.get(f"{API}/admin/users", params={"q": customer["phone"]}, headers=admin["h"])
    assert r.status_code == 200
    users = r.json()["users"]
    assert any(u["id"] == customer["user"]["id"] for u in users)


# --------- KYC approve/reject ----------
def test_admin_kyc_approve(s, admin, captain):
    r = s.post(f"{API}/admin/users/{captain['user']['id']}/kyc",
               json={"approved": True}, headers=admin["h"])
    assert r.status_code == 200
    assert r.json()["user"]["kyc_verified"] is True


def test_admin_kyc_reject_resets_docs(s, admin):
    # create fresh captain with docs
    sess = requests.Session()
    phone = f"90{uuid.uuid4().int % 100000000:08d}"
    tok, u = _login(sess, phone, "captain")
    sess.put(f"{API}/users/profile", json={"aadhaar": "111", "driving_license": "DL", "vehicle_rc": "RC"}, headers=_hdr(tok))
    r = s.post(f"{API}/admin/users/{u['id']}/kyc", json={"approved": False, "reason": "TEST"}, headers=admin["h"])
    assert r.status_code == 200
    u2 = r.json()["user"]
    assert u2["kyc_verified"] is False
    assert u2.get("aadhaar", "") == ""


# --------- block user ----------
def test_admin_block_user_and_kick(s, admin):
    # create a fresh customer to block
    sess = requests.Session()
    phone = f"98{uuid.uuid4().int % 100000000:08d}"
    tok, u = _login(sess, phone, "customer")
    # verify /me works
    r = sess.get(f"{API}/auth/me", headers=_hdr(tok))
    assert r.status_code == 200
    # block
    b = s.post(f"{API}/admin/users/{u['id']}/block",
               json={"blocked": True, "reason": "TEST_abuse"}, headers=admin["h"])
    assert b.status_code == 200
    assert b.json()["user"]["blocked"] is True
    # subsequent /me should 401 (token cleared) or 403 (blocked). Both are acceptable.
    r2 = sess.get(f"{API}/auth/me", headers=_hdr(tok))
    assert r2.status_code in (401, 403)


# --------- fare config ----------
def test_admin_fare_config_get(s, admin):
    r = s.get(f"{API}/admin/fare-config", headers=admin["h"])
    assert r.status_code == 200
    cfg = r.json()["fare_config"]
    assert "ZipBike" in cfg and "ZipDelivery" in cfg


def test_admin_fare_config_update_affects_estimate(s, admin):
    # capture current
    r = s.get(f"{API}/admin/fare-config", headers=admin["h"])
    orig = r.json()["fare_config"]["ZipBike"]
    # update
    new = {"service_type": "ZipBike", "base": 30.0, "per_km": 10.0, "min": 35.0, "commission_pct": 20.0}
    u = s.put(f"{API}/admin/fare-config", json=new, headers=admin["h"])
    assert u.status_code == 200, u.text
    # verify /fare/estimate reflects new: 5km => 30+10*5 = 80
    e = s.post(f"{API}/fare/estimate", json={"distance_km": 5.0, "service_type": "ZipBike"})
    assert e.status_code == 200
    assert e.json()["fare"] == 80.0
    # restore
    restore = {"service_type": "ZipBike", "base": orig["base"], "per_km": orig["per_km"],
               "min": orig["min"], "commission_pct": orig.get("commission_pct", 20.0)}
    s.put(f"{API}/admin/fare-config", json=restore, headers=admin["h"])


# --------- complaints / SOS ----------
def test_admin_complaints_list_and_resolve(s, admin):
    # create a customer + ride + SOS
    sess = requests.Session()
    phone = f"98{uuid.uuid4().int % 100000000:08d}"
    tok, u = _login(sess, phone, "customer")
    ride_payload = {
        "pickup_address": "MG Road", "pickup_lat": 18.73312, "pickup_lng": 76.38616,
        "drop_address": "Morewadi", "drop_lat": 18.72174, "drop_lng": 76.37025,
        "service_type": "ZipBike", "distance_km": 4.0, "fare": 57.0,
    }
    rr = sess.post(f"{API}/rides", json=ride_payload, headers=_hdr(tok))
    assert rr.status_code == 200, rr.text
    ride_id = rr.json()["ride"]["id"]
    so = sess.post(f"{API}/rides/{ride_id}/sos", json={"lat": 18.73312, "lng": 76.38616, "message": "TEST_help_iter4"}, headers=_hdr(tok))
    assert so.status_code == 200
    # admin lists complaints
    r = s.get(f"{API}/admin/complaints", headers=admin["h"])
    assert r.status_code == 200
    comps = r.json()["complaints"]
    _assert_no_id(comps)
    target = next((c for c in comps if c.get("message") == "TEST_help_iter4"), None)
    assert target is not None, "SOS not found in complaints"
    assert "user" in target and "ride" in target
    # After phone-normalization fix, stored phone is canonical `91XXXXXXXXXX`.
    assert target["user"]["phone"] == f"91{phone}"
    # resolve
    rr2 = s.post(f"{API}/admin/complaints/{target['id']}/resolve",
                 json={"resolution": "TEST_handled"}, headers=admin["h"])
    assert rr2.status_code == 200
    # check resolved
    r2 = s.get(f"{API}/admin/complaints", headers=admin["h"])
    updated = next(c for c in r2.json()["complaints"] if c["id"] == target["id"])
    assert updated.get("resolved") is True
    assert updated.get("resolution") == "TEST_handled"


# --------- role guards ----------
def test_admin_endpoints_reject_customer(s, customer):
    endpoints = ["/admin/dashboard", "/admin/fleet", "/admin/users", "/admin/fare-config", "/admin/complaints"]
    for e in endpoints:
        r = s.get(f"{API}{e}", headers=customer["h"])
        assert r.status_code == 403, f"{e} did not 403 for customer: {r.status_code}"


def test_admin_endpoints_reject_captain(s, captain):
    r = s.get(f"{API}/admin/dashboard", headers=captain["h"])
    assert r.status_code == 403
