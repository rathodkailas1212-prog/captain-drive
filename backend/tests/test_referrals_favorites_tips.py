"""ZipRide iteration 2: Referrals, Favorites, Tip on rating."""
import os
import re
import uuid
import pytest
import requests

BASE = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://captain-driver-app.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE}/api"

REFERRAL_REGEX = re.compile(r"^ZIP\d{4}\d{2}$")


# ---------- helpers ----------
def _login(sess, phone, role):
    sess.post(f"{API}/auth/send-otp", json={"phone": phone, "role": role})
    r = sess.post(
        f"{API}/auth/verify-otp",
        json={"phone": phone, "otp": "1234", "role": role},
    )
    assert r.status_code == 200, r.text
    d = r.json()
    return d["token"], d["user"]


def _assert_no_objid(obj):
    if isinstance(obj, dict):
        assert "_id" not in obj, f"_id leaked: {obj}"
        for v in obj.values():
            _assert_no_objid(v)
    elif isinstance(obj, list):
        for it in obj:
            _assert_no_objid(it)


def _phone():
    return f"97{uuid.uuid4().int % 100000000:08d}"


def _new_user(sess, role="customer"):
    token, user = _login(sess, _phone(), role)
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def user_a(s):
    return _new_user(s, "customer")


@pytest.fixture(scope="module")
def user_b(s):
    return _new_user(s, "customer")


# ============================================================
# REFERRALS
# ============================================================
class TestReferralCodeOnLogin:
    def test_new_user_has_referral_code(self, user_a):
        u = user_a["user"]
        assert "referral_code" in u
        assert u["referral_code"], "referral_code empty"
        assert REFERRAL_REGEX.match(u["referral_code"]), f"bad format: {u['referral_code']}"
        assert u.get("referrals_count") == 0
        assert u.get("credits_earned") == 0.0
        _assert_no_objid(u)


class TestReferralApply:
    def test_apply_valid_code(self, s, user_a, user_b):
        code = user_a["user"]["referral_code"]
        r = s.post(
            f"{API}/referrals/apply",
            json={"code": code},
            headers=user_b["headers"],
        )
        assert r.status_code == 200, r.text
        body = r.json()
        _assert_no_objid(body)
        assert body["success"] is True
        assert body["bonus"] == 50.0
        assert body["user"]["referred_by"] == user_a["user"]["id"]
        # wallet & credits for B should have grown by 50 (starting 250)
        assert body["user"]["wallet_balance"] >= 300.0
        assert body["user"]["credits_earned"] == 50.0

        # Verify A got credited too
        r2 = s.get(f"{API}/referrals/summary", headers=user_a["headers"])
        assert r2.status_code == 200
        d = r2.json()
        _assert_no_objid(d)
        assert d["referrals_count"] == 1
        assert d["credits_earned"] == 50.0
        assert d["bonus_per_referral"] == 50.0
        phones = [x["phone"] for x in d["referrals"]]
        assert user_b["user"]["phone"] in phones

    def test_apply_same_code_again_400(self, s, user_a, user_b):
        code = user_a["user"]["referral_code"]
        r = s.post(
            f"{API}/referrals/apply",
            json={"code": code},
            headers=user_b["headers"],
        )
        assert r.status_code == 400
        assert "already" in r.json()["detail"].lower()

    def test_apply_own_code(self, s):
        # fresh user, applying own code
        u = _new_user(s, "customer")
        r = s.post(
            f"{API}/referrals/apply",
            json={"code": u["user"]["referral_code"]},
            headers=u["headers"],
        )
        assert r.status_code == 400
        assert "own" in r.json()["detail"].lower()

    def test_apply_invalid_code(self, s):
        u = _new_user(s, "customer")
        r = s.post(
            f"{API}/referrals/apply",
            json={"code": "ZIP0000ZZ"},
            headers=u["headers"],
        )
        assert r.status_code == 404


class TestReferralSummary:
    def test_summary_shape(self, s, user_a):
        r = s.get(f"{API}/referrals/summary", headers=user_a["headers"])
        assert r.status_code == 200
        d = r.json()
        _assert_no_objid(d)
        for k in ("referral_code", "referrals_count", "credits_earned", "bonus_per_referral", "referrals"):
            assert k in d
        assert d["bonus_per_referral"] == 50.0
        if d["referrals"]:
            ref0 = d["referrals"][0]
            assert "name" in ref0 and "phone" in ref0 and "created_at" in ref0


# ============================================================
# FAVORITES
# ============================================================
class TestFavorites:
    def test_empty_list_for_new_user(self, s):
        u = _new_user(s)
        r = s.get(f"{API}/favorites", headers=u["headers"])
        assert r.status_code == 200
        assert r.json() == {"favorites": []}

    def test_create_get_and_isolation(self, s):
        u1 = _new_user(s)
        u2 = _new_user(s)
        payload = {
            "label": "TEST_Home",
            "address": "MG Road",
            "lat": 12.9758,
            "lng": 77.6068,
            "icon": "home",
        }
        r = s.post(f"{API}/favorites", json=payload, headers=u1["headers"])
        assert r.status_code == 200
        fav = r.json()["favorite"]
        _assert_no_objid(fav)
        for k in ("id", "label", "address", "lat", "lng", "icon", "created_at"):
            assert k in fav, f"missing {k}"
        assert fav["label"] == "TEST_Home"
        fav_id = fav["id"]

        # GET returns for owner
        r2 = s.get(f"{API}/favorites", headers=u1["headers"])
        assert r2.status_code == 200
        favs = r2.json()["favorites"]
        _assert_no_objid(r2.json())
        ids = [f["id"] for f in favs]
        assert fav_id in ids

        # Isolation: u2 should not see it
        r3 = s.get(f"{API}/favorites", headers=u2["headers"])
        assert r3.status_code == 200
        assert fav_id not in [f["id"] for f in r3.json()["favorites"]]

        # DELETE
        d = s.delete(f"{API}/favorites/{fav_id}", headers=u1["headers"])
        assert d.status_code == 200
        assert d.json()["success"] is True

        # Second delete -> 404
        d2 = s.delete(f"{API}/favorites/{fav_id}", headers=u1["headers"])
        assert d2.status_code == 404


# ============================================================
# TIP ON RATING
# ============================================================
def _create_and_complete_ride(sess, customer, captain, fare=60.0):
    payload = {
        "pickup_address": "MG Road",
        "pickup_lat": 12.9758,
        "pickup_lng": 77.6068,
        "drop_address": "Indiranagar",
        "drop_lat": 12.9784,
        "drop_lng": 77.6408,
        "service_type": "ZipBike",
        "distance_km": 4.0,
        "fare": fare,
    }
    r = sess.post(f"{API}/rides", json=payload, headers=customer["headers"])
    assert r.status_code == 200, r.text
    ride = r.json()["ride"]
    # accept + transitions
    r = sess.post(f"{API}/rides/{ride['id']}/accept", headers=captain["headers"])
    assert r.status_code == 200
    for st in ["reached_pickup", "started", "completed"]:
        r = sess.patch(
            f"{API}/rides/{ride['id']}/status",
            json={"status": st},
            headers=captain["headers"],
        )
        assert r.status_code == 200, f"{st}: {r.text}"
    return ride["id"]


def _get_earnings(sess, captain):
    r = sess.get(f"{API}/captain/earnings", headers=captain["headers"])
    assert r.status_code == 200
    return r.json()


def _get_cash(sess, captain):
    r = sess.get(f"{API}/auth/me", headers=captain["headers"])
    assert r.status_code == 200
    return r.json()["user"].get("cash_in_hand", 0.0)


def _get_wallet(sess, user):
    r = sess.get(f"{API}/auth/me", headers=user["headers"])
    return r.json()["user"].get("wallet_balance", 0.0)


class TestTipOnRating:
    def test_tip_cash_increments_cash_and_earnings(self, s):
        cust = _new_user(s, "customer")
        cap = _new_user(s, "captain")
        ride_id = _create_and_complete_ride(s, cust, cap, fare=60.0)

        cash_before = _get_cash(s, cap)
        earn_before = _get_earnings(s, cap)["total_earnings"]

        r = s.post(
            f"{API}/rides/{ride_id}/rate",
            json={"rating": 5, "payment_method": "cash", "tip": 20},
            headers=cust["headers"],
        )
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["tip"] == 20.0

        cash_after = _get_cash(s, cap)
        earn_after = _get_earnings(s, cap)["total_earnings"]
        # cash-in-hand: +tip 20 (no deduction on cash payments)
        assert cash_after - cash_before == pytest.approx(20.0, abs=0.01), \
            f"cash delta wrong: {cash_before}->{cash_after}"
        # earnings should have increased by tip only (fare added on ride complete already)
        assert earn_after - earn_before == pytest.approx(20.0, abs=0.01)

    def test_tip_wallet_flow(self, s):
        cust = _new_user(s, "customer")
        cap = _new_user(s, "captain")
        ride_id = _create_and_complete_ride(s, cust, cap, fare=60.0)

        wallet_before = _get_wallet(s, cust)
        earn_before = _get_earnings(s, cap)["total_earnings"]

        r = s.post(
            f"{API}/rides/{ride_id}/rate",
            json={"rating": 5, "payment_method": "wallet", "tip": 15},
            headers=cust["headers"],
        )
        assert r.status_code == 200
        assert r.json()["tip"] == 15.0

        wallet_after = _get_wallet(s, cust)
        earn_after = _get_earnings(s, cap)["total_earnings"]
        assert wallet_before - wallet_after == pytest.approx(15.0, abs=0.01)
        # earnings += tip only (fare booked at ride complete)
        assert earn_after - earn_before == pytest.approx(15.0, abs=0.01)

    def test_tip_upi_flow(self, s):
        cust = _new_user(s, "customer")
        cap = _new_user(s, "captain")
        ride_id = _create_and_complete_ride(s, cust, cap, fare=60.0)

        cash_before = _get_cash(s, cap)
        earn_before = _get_earnings(s, cap)["total_earnings"]

        r = s.post(
            f"{API}/rides/{ride_id}/rate",
            json={"rating": 4, "payment_method": "upi", "tip": 10},
            headers=cust["headers"],
        )
        assert r.status_code == 200
        assert r.json()["tip"] == 10.0

        cash_after = _get_cash(s, cap)
        earn_after = _get_earnings(s, cap)["total_earnings"]
        # UPI: no cash change from tip; but base rating deducts fare from cash_in_hand
        # (cash_in_hand -= ride.fare on upi/wallet) -- so cash decreases by fare
        assert cash_after - cash_before == pytest.approx(-60.0, abs=0.01)
        assert earn_after - earn_before == pytest.approx(10.0, abs=0.01)

    def test_rate_without_tip_returns_tip_zero(self, s):
        cust = _new_user(s, "customer")
        cap = _new_user(s, "captain")
        ride_id = _create_and_complete_ride(s, cust, cap, fare=50.0)
        r = s.post(
            f"{API}/rides/{ride_id}/rate",
            json={"rating": 3, "payment_method": "upi"},
            headers=cust["headers"],
        )
        assert r.status_code == 200
        assert r.json()["tip"] == 0
