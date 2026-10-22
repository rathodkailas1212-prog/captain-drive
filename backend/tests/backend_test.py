"""ZipRide backend API tests.

Covers: auth (OTP), profile, fare, captains, rides CRUD, SOS,
captain duty/earnings/incoming, and end-to-end customer+captain flow.
"""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://captain-driver-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _login(sess, phone, role):
    sess.post(f"{API}/auth/send-otp", json={"phone": phone, "role": role})
    r = sess.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": "1234", "role": role})
    assert r.status_code == 200, r.text
    data = r.json()
    return data["token"], data["user"]


@pytest.fixture(scope="session")
def customer(s):
    phone = f"98{uuid.uuid4().int % 100000000:08d}"
    token, user = _login(s, phone, "customer")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="session")
def captain(s):
    phone = f"90{uuid.uuid4().int % 100000000:08d}"
    token, user = _login(s, phone, "captain")
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


def _assert_no_objid(obj):
    """Recursively assert '_id' key does not appear anywhere in the response."""
    if isinstance(obj, dict):
        assert "_id" not in obj, f"ObjectId '_id' leaked in response: {obj}"
        for v in obj.values():
            _assert_no_objid(v)
    elif isinstance(obj, list):
        for it in obj:
            _assert_no_objid(it)


# ---------- root & auth ----------
def test_root(s):
    r = s.get(f"{API}/")
    assert r.status_code == 200
    assert "ZipRide" in r.json()["message"]


def test_send_otp(s):
    r = s.post(f"{API}/auth/send-otp", json={"phone": "9876543210", "role": "customer"})
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_verify_otp_wrong(s):
    r = s.post(f"{API}/auth/verify-otp", json={"phone": "9876543210", "otp": "9999", "role": "customer"})
    assert r.status_code == 400


def test_verify_otp_ok_and_no_id_leak(customer):
    _assert_no_objid(customer["user"])
    assert customer["user"]["role"] == "customer"
    assert customer["token"]


def test_auth_me(s, customer):
    r = s.get(f"{API}/auth/me", headers=customer["headers"])
    assert r.status_code == 200
    _assert_no_objid(r.json())
    assert r.json()["user"]["id"] == customer["user"]["id"]


def test_auth_me_no_token(s):
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_update_profile_customer(s, customer):
    r = s.put(f"{API}/users/profile", json={"name": "TEST_Customer"}, headers=customer["headers"])
    assert r.status_code == 200
    assert r.json()["user"]["name"] == "TEST_Customer"


def test_update_profile_captain_kyc(s, captain):
    payload = {
        "name": "TEST_Captain",
        "vehicle_number": "KA-01-TEST",
        "aadhaar": "1111-2222-3333",
        "driving_license": "DL-TEST-1",
        "vehicle_rc": "RC-TEST-1",
    }
    r = s.put(f"{API}/users/profile", json=payload, headers=captain["headers"])
    assert r.status_code == 200
    u = r.json()["user"]
    assert u["vehicle_number"] == "KA-01-TEST"
    assert u["kyc_verified"] is True


# ---------- fare ----------
def _expected_fare(cfg_entry, distance_km):
    return round(max(cfg_entry["base"] + cfg_entry["per_km"] * distance_km, cfg_entry["min"]), 2)


def test_fare_estimate_zipbike(s):
    cfg = s.get(f"{API}/fare/config").json()
    r = s.post(f"{API}/fare/estimate", json={"distance_km": 5.0, "service_type": "ZipBike"})
    assert r.status_code == 200
    d = r.json()
    assert d["fare"] == _expected_fare(cfg["ZipBike"], 5.0)
    assert d["eta_min"] >= 3


def test_fare_estimate_zipdelivery(s):
    cfg = s.get(f"{API}/fare/config").json()
    r = s.post(f"{API}/fare/estimate", json={"distance_km": 3.0, "service_type": "ZipDelivery"})
    assert r.status_code == 200
    assert r.json()["fare"] == _expected_fare(cfg["ZipDelivery"], 3.0)


def test_fare_estimate_min_applied(s):
    cfg = s.get(f"{API}/fare/config").json()
    r = s.post(f"{API}/fare/estimate", json={"distance_km": 0.1, "service_type": "ZipBike"})
    assert r.json()["fare"] == _expected_fare(cfg["ZipBike"], 0.1)


# ---------- captains nearby ----------
def test_captains_nearby(s):
    r = s.get(f"{API}/captains/nearby", params={"lat": 12.97, "lng": 77.59})
    assert r.status_code == 200
    caps = r.json()["captains"]
    assert len(caps) == 6
    _assert_no_objid(r.json())


# ---------- rides E2E ----------
@pytest.fixture(scope="session")
def created_ride(s, customer):
    payload = {
        "pickup_address": "MG Road",
        "pickup_lat": 12.9758,
        "pickup_lng": 77.6068,
        "drop_address": "Indiranagar",
        "drop_lat": 12.9784,
        "drop_lng": 77.6408,
        "service_type": "ZipBike",
        "distance_km": 4.2,
        "fare": 58.6,
    }
    r = s.post(f"{API}/rides", json=payload, headers=customer["headers"])
    assert r.status_code == 200, r.text
    ride = r.json()["ride"]
    _assert_no_objid(ride)
    assert ride["status"] == "searching"
    assert ride["otp"] and len(ride["otp"]) == 4
    return ride


def test_get_ride(s, customer, created_ride):
    r = s.get(f"{API}/rides/{created_ride['id']}", headers=customer["headers"])
    assert r.status_code == 200
    _assert_no_objid(r.json())
    assert r.json()["ride"]["id"] == created_ride["id"]


def test_get_ride_404(s, customer):
    r = s.get(f"{API}/rides/does-not-exist", headers=customer["headers"])
    assert r.status_code == 404


def test_captain_accept_ride(s, captain, created_ride):
    r = s.post(f"{API}/rides/{created_ride['id']}/accept", headers=captain["headers"])
    assert r.status_code == 200
    ride = r.json()["ride"]
    _assert_no_objid(ride)
    assert ride["status"] == "accepted"
    assert ride["captain_id"] == captain["user"]["id"]


def test_ride_status_transitions(s, captain, created_ride):
    for st in ["reached_pickup", "started", "completed"]:
        r = s.patch(
            f"{API}/rides/{created_ride['id']}/status",
            json={"status": st},
            headers=captain["headers"],
        )
        assert r.status_code == 200, f"{st}: {r.text}"
        assert r.json()["ride"]["status"] == st


def test_rate_ride(s, customer, created_ride):
    r = s.post(
        f"{API}/rides/{created_ride['id']}/rate",
        json={"rating": 5, "comment": "TEST_great", "payment_method": "upi"},
        headers=customer["headers"],
    )
    assert r.status_code == 200
    # verify persistence via GET
    g = s.get(f"{API}/rides/{created_ride['id']}", headers=customer["headers"])
    assert g.json()["ride"]["rating"] == 5
    assert g.json()["ride"]["payment_method"] == "upi"


def test_sos(s, customer, created_ride):
    r = s.post(
        f"{API}/rides/{created_ride['id']}/sos",
        json={"lat": 12.97, "lng": 77.59, "message": "TEST_help"},
        headers=customer["headers"],
    )
    assert r.status_code == 200
    _assert_no_objid(r.json())
    assert r.json()["success"] is True


def test_rides_history(s, customer, created_ride):
    r = s.get(f"{API}/rides/history/list", headers=customer["headers"])
    assert r.status_code == 200
    _assert_no_objid(r.json())
    ids = [x["id"] for x in r.json()["rides"]]
    assert created_ride["id"] in ids


# ---------- captain duty / earnings / incoming ----------
def test_captain_duty_toggle(s, captain):
    r = s.post(f"{API}/captain/duty", json={"online": True}, headers=captain["headers"])
    assert r.status_code == 200
    assert r.json()["user"]["is_online"] is True


def test_captain_earnings_after_completed(s, captain):
    r = s.get(f"{API}/captain/earnings", headers=captain["headers"])
    assert r.status_code == 200
    d = r.json()
    # ride completed in earlier test with fare 58.6
    assert d["total_earnings"] >= 58.6
    assert d["today_rides"] >= 1


def test_captain_incoming_online(s, captain):
    # captain is online (toggle above)
    r = s.get(f"{API}/captain/incoming", headers=captain["headers"])
    assert r.status_code == 200
    body = r.json()
    assert body["request"] is not None
    _assert_no_objid(body)


def test_captain_incoming_offline(s, captain):
    s.post(f"{API}/captain/duty", json={"online": False}, headers=captain["headers"])
    r = s.get(f"{API}/captain/incoming", headers=captain["headers"])
    assert r.status_code == 200
    assert r.json()["request"] is None
