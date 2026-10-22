"""
Security audit remediation tests (iteration 3) for ZipRide backend.
Covers SEC-002 (server fare/idempotency/role), SEC-003 (read authz),
SEC-004 (rating authz + tip bounds), SEC-005 (no signup wallet),
and hardening (logout, captain-role guards, SOS rate limit + participant).
"""
import os
import random
import time as _time
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


# ---------- helpers ----------
def rand_phone():
    return "9" + "".join(str(random.randint(0, 9)) for _ in range(9))


def signup(role: str) -> dict:
    phone = rand_phone()
    r = requests.post(f"{API}/auth/send-otp", json={"phone": phone, "role": role}, timeout=15)
    assert r.status_code == 200, r.text
    r = requests.post(
        f"{API}/auth/verify-otp",
        json={"phone": phone, "otp": "1234", "role": role},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return {"phone": phone, "token": data["token"], "user": data["user"]}


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_searching_ride(customer_token: str, distance_km=5.0, fare=9999) -> dict:
    payload = {
        "pickup_address": "TEST_pickup",
        "pickup_lat": 12.97,
        "pickup_lng": 77.59,
        "drop_address": "TEST_drop",
        "drop_lat": 12.98,
        "drop_lng": 77.60,
        "service_type": "ZipBike",
        "distance_km": distance_km,
        "fare": fare,
    }
    r = requests.post(f"{API}/rides", json=payload, headers=auth(customer_token), timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["ride"]


def no_id_leak(obj):
    """Recursively assert no '_id' key present."""
    if isinstance(obj, dict):
        assert "_id" not in obj, f"_id leaked in {list(obj.keys())}"
        for v in obj.values():
            no_id_leak(v)
    elif isinstance(obj, list):
        for v in obj:
            no_id_leak(v)


# ================= SEC-002 =================
class TestSEC002ServerFare:
    def test_server_fare_recomputed_and_client_fare_ignored(self):
        cust = signup("customer")
        # Client sends fare=9999 but server must recompute. iter9: server also
        # recomputes distance via /routes/compute from pickup/drop lat/lng, so
        # we assert against compute_fare(ride.distance_km) using the LIVE config.
        ride = create_searching_ride(cust["token"], distance_km=5.0, fare=9999)
        cfg = requests.get(f"{API}/fare/config").json()["ZipBike"]
        expected = round(max(cfg["base"] + cfg["per_km"] * ride["distance_km"], cfg["min"]), 2)
        assert ride["fare"] == expected, f"expected {expected} for d={ride['distance_km']}, got {ride['fare']}"
        assert ride["fare"] != 9999, "server did not override client-sent fare"
        no_id_leak(ride)

    def test_invalid_distance_too_large(self):
        cust = signup("customer")
        payload = {
            "pickup_address": "a", "pickup_lat": 0, "pickup_lng": 0,
            "drop_address": "b", "drop_lat": 0, "drop_lng": 0,
            "service_type": "ZipBike", "distance_km": 500, "fare": 100,
        }
        r = requests.post(f"{API}/rides", json=payload, headers=auth(cust["token"]))
        assert r.status_code == 400
        assert "distance" in r.json()["detail"].lower()

    def test_invalid_distance_negative(self):
        cust = signup("customer")
        payload = {
            "pickup_address": "a", "pickup_lat": 0, "pickup_lng": 0,
            "drop_address": "b", "drop_lat": 0, "drop_lng": 0,
            "service_type": "ZipBike", "distance_km": -1, "fare": 100,
        }
        r = requests.post(f"{API}/rides", json=payload, headers=auth(cust["token"]))
        assert r.status_code == 400


class TestSEC002Idempotency:
    def test_double_complete_does_not_double_credit(self):
        cust = signup("customer")
        cap = signup("captain")
        ride = create_searching_ride(cust["token"], distance_km=5.0, fare=9999)
        rid = ride["id"]
        # captain accepts
        r = requests.post(f"{API}/rides/{rid}/accept", headers=auth(cap["token"]))
        assert r.status_code == 200
        # complete first time
        r = requests.patch(
            f"{API}/rides/{rid}/status",
            json={"status": "completed"},
            headers=auth(cap["token"]),
        )
        assert r.status_code == 200
        # complete second time
        r = requests.patch(
            f"{API}/rides/{rid}/status",
            json={"status": "completed"},
            headers=auth(cap["token"]),
        )
        assert r.status_code == 200
        # earnings should reflect ONE completion only (use ride.fare as the
        # server-authoritative value — iter9: distance comes from /routes/compute)
        r = requests.get(f"{API}/captain/earnings", headers=auth(cap["token"]))
        assert r.status_code == 200
        earn = r.json()
        expected = ride["fare"]
        assert earn["total_earnings"] == expected, f"total_earnings expected {expected}, got {earn['total_earnings']}"
        assert earn["cash_in_hand"] == expected, f"cash_in_hand expected {expected}, got {earn['cash_in_hand']}"
        # Captain me total_rides should be 1
        me = requests.get(f"{API}/auth/me", headers=auth(cap["token"])).json()["user"]
        assert me["total_rides"] == 1


class TestSEC002AcceptRole:
    def test_customer_cannot_accept_ride(self):
        cust = signup("customer")
        ride = create_searching_ride(cust["token"])
        r = requests.post(f"{API}/rides/{ride['id']}/accept", headers=auth(cust["token"]))
        assert r.status_code == 403

    def test_double_accept_returns_409(self):
        cust = signup("customer")
        cap1 = signup("captain")
        cap2 = signup("captain")
        ride = create_searching_ride(cust["token"])
        r1 = requests.post(f"{API}/rides/{ride['id']}/accept", headers=auth(cap1["token"]))
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/rides/{ride['id']}/accept", headers=auth(cap2["token"]))
        assert r2.status_code == 409


# ================= SEC-003 =================
class TestSEC003ReadAuthz:
    def test_owner_customer_can_read(self):
        cust = signup("customer")
        ride = create_searching_ride(cust["token"])
        r = requests.get(f"{API}/rides/{ride['id']}", headers=auth(cust["token"]))
        assert r.status_code == 200

    def test_unrelated_user_cannot_read(self):
        cust = signup("customer")
        other = signup("customer")
        ride = create_searching_ride(cust["token"])
        r = requests.get(f"{API}/rides/{ride['id']}", headers=auth(other["token"]))
        assert r.status_code == 403

    def test_assigned_captain_can_read(self):
        cust = signup("customer")
        cap = signup("captain")
        ride = create_searching_ride(cust["token"])
        requests.post(f"{API}/rides/{ride['id']}/accept", headers=auth(cap["token"]))
        r = requests.get(f"{API}/rides/{ride['id']}", headers=auth(cap["token"]))
        assert r.status_code == 200

    def test_non_participant_cannot_patch_status(self):
        cust = signup("customer")
        other_cap = signup("captain")
        ride = create_searching_ride(cust["token"])
        r = requests.patch(
            f"{API}/rides/{ride['id']}/status",
            json={"status": "accepted"},
            headers=auth(other_cap["token"]),
        )
        assert r.status_code == 403


# ================= SEC-004 =================
class TestSEC004Rating:
    def _completed_ride(self):
        cust = signup("customer")
        cap = signup("captain")
        ride = create_searching_ride(cust["token"])
        requests.post(f"{API}/rides/{ride['id']}/accept", headers=auth(cap["token"]))
        requests.patch(
            f"{API}/rides/{ride['id']}/status",
            json={"status": "completed"},
            headers=auth(cap["token"]),
        )
        return cust, cap, ride

    def test_captain_cannot_rate(self):
        cust, cap, ride = self._completed_ride()
        r = requests.post(
            f"{API}/rides/{ride['id']}/rate",
            json={"rating": 5, "tip": 0},
            headers=auth(cap["token"]),
        )
        assert r.status_code == 403

    def test_unrelated_user_cannot_rate(self):
        cust, cap, ride = self._completed_ride()
        other = signup("customer")
        r = requests.post(
            f"{API}/rides/{ride['id']}/rate",
            json={"rating": 5, "tip": 0},
            headers=auth(other["token"]),
        )
        assert r.status_code == 403

    def test_double_rate_returns_409(self):
        cust, cap, ride = self._completed_ride()
        r1 = requests.post(
            f"{API}/rides/{ride['id']}/rate",
            json={"rating": 5, "tip": 0, "payment_method": "cash"},
            headers=auth(cust["token"]),
        )
        assert r1.status_code == 200
        r2 = requests.post(
            f"{API}/rides/{ride['id']}/rate",
            json={"rating": 4, "tip": 0, "payment_method": "cash"},
            headers=auth(cust["token"]),
        )
        assert r2.status_code == 409

    def test_negative_tip_rejected(self):
        cust, cap, ride = self._completed_ride()
        r = requests.post(
            f"{API}/rides/{ride['id']}/rate",
            json={"rating": 5, "tip": -10, "payment_method": "cash"},
            headers=auth(cust["token"]),
        )
        assert r.status_code == 400

    def test_huge_tip_rejected(self):
        cust, cap, ride = self._completed_ride()
        r = requests.post(
            f"{API}/rides/{ride['id']}/rate",
            json={"rating": 5, "tip": 501, "payment_method": "cash"},
            headers=auth(cust["token"]),
        )
        assert r.status_code == 400

    def test_rating_out_of_range(self):
        cust, cap, ride = self._completed_ride()
        r = requests.post(
            f"{API}/rides/{ride['id']}/rate",
            json={"rating": 6, "tip": 0, "payment_method": "cash"},
            headers=auth(cust["token"]),
        )
        assert r.status_code == 400


# ================= SEC-005 =================
class TestSEC005SignupWallet:
    def test_new_user_wallet_is_zero(self):
        cust = signup("customer")
        assert cust["user"]["wallet_balance"] == 0
        # Also verify via /me
        me = requests.get(f"{API}/auth/me", headers=auth(cust["token"])).json()["user"]
        assert me["wallet_balance"] == 0

    def test_referral_still_credits_both_parties_50(self):
        referrer = signup("customer")
        new_user = signup("customer")
        code = referrer["user"]["referral_code"]
        r = requests.post(
            f"{API}/referrals/apply",
            json={"code": code},
            headers=auth(new_user["token"]),
        )
        assert r.status_code == 200
        # both should have wallet_balance = 50
        me_new = requests.get(f"{API}/auth/me", headers=auth(new_user["token"])).json()["user"]
        me_ref = requests.get(f"{API}/auth/me", headers=auth(referrer["token"])).json()["user"]
        assert me_new["wallet_balance"] == 50.0, me_new["wallet_balance"]
        assert me_ref["wallet_balance"] == 50.0, me_ref["wallet_balance"]
        assert me_ref["referrals_count"] == 1


# ================= Hardening =================
class TestLogout:
    def test_logout_invalidates_token(self):
        cust = signup("customer")
        r = requests.post(f"{API}/auth/logout", headers=auth(cust["token"]))
        assert r.status_code == 200
        r2 = requests.get(f"{API}/auth/me", headers=auth(cust["token"]))
        assert r2.status_code == 401


class TestCaptainRoleGuards:
    def test_customer_forbidden_on_duty(self):
        cust = signup("customer")
        r = requests.post(f"{API}/captain/duty", json={"online": True}, headers=auth(cust["token"]))
        assert r.status_code == 403

    def test_customer_forbidden_on_earnings(self):
        cust = signup("customer")
        r = requests.get(f"{API}/captain/earnings", headers=auth(cust["token"]))
        assert r.status_code == 403

    def test_customer_forbidden_on_incoming(self):
        cust = signup("customer")
        r = requests.get(f"{API}/captain/incoming", headers=auth(cust["token"]))
        assert r.status_code == 403


class TestSOSHardening:
    def test_non_participant_cannot_sos(self):
        cust = signup("customer")
        other = signup("customer")
        ride = create_searching_ride(cust["token"])
        r = requests.post(
            f"{API}/rides/{ride['id']}/sos",
            json={"lat": 0, "lng": 0, "message": "help"},
            headers=auth(other["token"]),
        )
        assert r.status_code == 403

    def test_sos_rate_limit_4th_returns_429(self):
        cust = signup("customer")
        ride = create_searching_ride(cust["token"])
        for i in range(3):
            r = requests.post(
                f"{API}/rides/{ride['id']}/sos",
                json={"lat": 0, "lng": 0, "message": f"h{i}"},
                headers=auth(cust["token"]),
            )
            assert r.status_code == 200, f"call {i+1} failed: {r.text}"
        # 4th within window should be 429
        r = requests.post(
            f"{API}/rides/{ride['id']}/sos",
            json={"lat": 0, "lng": 0, "message": "4th"},
            headers=auth(cust["token"]),
        )
        assert r.status_code == 429


# ================= Regression =================
class TestCustomerRegressionFullFlow:
    def test_customer_full_flow_wallet_zero_after_signup(self):
        cust = signup("customer")
        cap = signup("captain")
        # create ride
        ride = create_searching_ride(cust["token"])
        rid = ride["id"]
        # captain accepts, progresses statuses
        assert requests.post(f"{API}/rides/{rid}/accept", headers=auth(cap["token"])).status_code == 200
        for status in ("reached_pickup", "started", "completed"):
            r = requests.patch(
                f"{API}/rides/{rid}/status",
                json={"status": status},
                headers=auth(cap["token"]),
            )
            assert r.status_code == 200, status
        # customer rates with tip=10 wallet - but wallet=0, allow negative? Backend does not prevent, so use cash
        r = requests.post(
            f"{API}/rides/{rid}/rate",
            json={"rating": 5, "tip": 10, "payment_method": "cash"},
            headers=auth(cust["token"]),
        )
        assert r.status_code == 200, r.text
        assert r.json()["tip"] == 10
        # customer history
        h = requests.get(f"{API}/rides/history/list", headers=auth(cust["token"]))
        assert h.status_code == 200
        assert any(x["id"] == rid for x in h.json()["rides"])
        no_id_leak(h.json())


class TestCaptainRegressionFullFlow:
    def test_captain_duty_incoming_earnings(self):
        cap = signup("captain")
        # duty online
        r = requests.post(f"{API}/captain/duty", json={"online": True}, headers=auth(cap["token"]))
        assert r.status_code == 200
        assert r.json()["user"]["is_online"] is True
        # incoming (demo or real)
        r = requests.get(f"{API}/captain/incoming", headers=auth(cap["token"]))
        assert r.status_code == 200
        # create a real ride from another customer -> accept -> complete
        cust = signup("customer")
        ride = create_searching_ride(cust["token"])
        rid = ride["id"]
        assert requests.post(f"{API}/rides/{rid}/accept", headers=auth(cap["token"])).status_code == 200
        assert requests.patch(
            f"{API}/rides/{rid}/status", json={"status": "completed"}, headers=auth(cap["token"])
        ).status_code == 200
        earn = requests.get(f"{API}/captain/earnings", headers=auth(cap["token"])).json()
        assert earn["total_earnings"] >= 65.0
        assert earn["today_rides"] >= 1
        no_id_leak(earn)


class TestFavoritesRegression:
    def test_favorites_crud(self):
        cust = signup("customer")
        # empty
        r = requests.get(f"{API}/favorites", headers=auth(cust["token"]))
        assert r.status_code == 200
        assert r.json()["favorites"] == []
        # create
        r = requests.post(
            f"{API}/favorites",
            json={"label": "TEST_Home", "address": "x", "lat": 1.0, "lng": 2.0, "icon": "home"},
            headers=auth(cust["token"]),
        )
        assert r.status_code == 200
        fav_id = r.json()["favorite"]["id"]
        # list
        r = requests.get(f"{API}/favorites", headers=auth(cust["token"]))
        assert any(f["id"] == fav_id for f in r.json()["favorites"])
        no_id_leak(r.json())
        # delete
        r = requests.delete(f"{API}/favorites/{fav_id}", headers=auth(cust["token"]))
        assert r.status_code == 200
