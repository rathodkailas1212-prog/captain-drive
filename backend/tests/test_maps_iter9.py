"""
Iteration 9 — Maps / Places / Routes / Captain-location feature tests.
Backend: GOOGLE_MAPS_SERVER_KEY is intentionally absent -> fallback mode is EXPECTED.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
           os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL / EXPO_BACKEND_URL must be set"
API = f"{BASE_URL}/api"

CUSTOMER_PHONE = "9876543210"
CAPTAIN_PHONE = "9000011111"
OTP = "1234"

# Ambajogai centre + a known nearby village (Morewadi, ~2.1 km)
AMBAJOGAI = (18.73312, 76.38616)
MOREWADI = (18.72174, 76.37025)

# Keep all tests on a single xdist worker so parallel logins with the same
# phone number don't invalidate each other's tokens (backend rotates token
# on every verify-otp). pytest.ini uses --dist loadscope which pins each
# class to a worker; different classes using the same phone would race.
# Solution: distinct phones per class that logs in.


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, phone, role):
    # request OTP (mocked)
    r = session.post(f"{API}/auth/send-otp", json={"phone": phone, "role": role})
    assert r.status_code == 200, r.text
    r = session.post(f"{API}/auth/verify-otp", json={"phone": phone, "otp": OTP, "role": role})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="class")
def customer_token(session, request):
    # Unique phone per class to avoid parallel xdist workers invalidating
    # each other's tokens (verify-otp rotates the token on every login).
    phone = f"9876500{abs(hash(request.cls.__name__)) % 1000:03d}"
    return _login(session, phone, "customer")


@pytest.fixture(scope="class")
def captain_token(session, request):
    phone = f"9000011{abs(hash(request.cls.__name__)) % 1000:03d}"
    return _login(session, phone, "captain")


@pytest.fixture(scope="module")
def fare_cfg(session):
    r = session.get(f"{API}/fare/config")
    assert r.status_code == 200
    return r.json()  # may be defaults or admin override


def _expected_fare(cfg, distance_km, service):
    svc = cfg.get(service) or cfg.get("services", {}).get(service) or {}
    # support both flat and nested shapes
    base = svc.get("base", 25)
    per_km = svc.get("per_km", 8)
    minf = svc.get("min", 30)
    return round(max(base + per_km * distance_km, minf), 2)


# ---------- 1. maps/config ----------
class TestMapsConfig:
    def test_config_shape(self, session):
        r = session.get(f"{API}/maps/config")
        assert r.status_code == 200
        d = r.json()
        assert d["google_enabled"] is False
        assert d["local_places_count"] == 478
        assert d["radius_km"] == 30
        assert d["center"]["name"] == "Ambajogai"
        assert abs(d["center"]["lat"] - 18.73312) < 1e-4
        assert abs(d["center"]["lng"] - 76.38616) < 1e-4


# ---------- 2. places/search ----------
class TestPlacesSearch:
    def test_search_more_returns_morewadi_first(self, session):
        r = session.get(f"{API}/places/search", params={"q": "more"})
        assert r.status_code == 200
        d = r.json()
        assert "local" in d and "google" in d
        assert d["google"] == []  # no Google key configured
        assert len(d["local"]) >= 1
        assert d["local"][0]["name"].lower() == "morewadi", \
            f"Expected Morewadi first, got {d['local'][0]['name']}"

    def test_empty_query_lists_landmarks_first(self, session):
        r = session.get(f"{API}/places/search", params={"q": ""})
        assert r.status_code == 200
        d = r.json()
        assert d["google"] == []
        assert len(d["local"]) > 0
        # Landmarks (bus stand, temples, hospitals) must come first
        first = d["local"][0]
        assert first["type"] == "landmark", f"Expected landmark first, got {first.get('type')}: {first['name']}"
        # Required fields on each entry
        for p in d["local"][:20]:
            for k in ("name", "name_local", "district", "lat", "lng",
                      "distance_from_ambajogai_km", "type", "sources"):
                assert k in p, f"missing field {k} in {p.get('name')}"
            assert isinstance(p["sources"], list)
            assert p["distance_from_ambajogai_km"] <= 30.0
        # Landmarks should appear before villages in the ordering
        types_seq = [p["type"] for p in d["local"][:60]]
        last_landmark_idx = max((i for i, t in enumerate(types_seq) if t == "landmark"), default=-1)
        first_village_idx = next((i for i, t in enumerate(types_seq) if t == "village"), -1)
        if last_landmark_idx >= 0 and first_village_idx >= 0:
            assert last_landmark_idx < first_village_idx, "landmarks must precede villages"

    def test_marathi_search_yogeshwari(self, session):
        """Marathi query 'योग' must return Yogeshwari Temple."""
        r = session.get(f"{API}/places/search", params={"q": "योग"})
        assert r.status_code == 200
        d = r.json()
        names = [p["name"] for p in d["local"]]
        assert "Yogeshwari Temple" in names, f"Marathi search did not match. Got: {names[:5]}"

    def test_landmarks_include_bus_station_and_temple(self, session):
        r = session.get(f"{API}/places/search", params={"q": "", "limit": 500})
        assert r.status_code == 200
        d = r.json()
        landmarks = [p["name"] for p in d["local"] if p["type"] == "landmark"]
        assert "Ambajogai Bus Station" in landmarks
        assert "Yogeshwari Temple" in landmarks

    def test_limit_capped(self, session):
        r = session.get(f"{API}/places/search", params={"q": "", "limit": 5})
        assert r.status_code == 200
        assert len(r.json()["local"]) == 5


# ---------- 3. places/details + places/geocode ----------
class TestPlaceDetailsGeocode:
    def test_details_503_when_no_key(self, session):
        r = session.get(f"{API}/places/details/ChIJsome-fake-id-xxxxxxxx")
        assert r.status_code == 503

    def test_geocode_null_result_when_no_key(self, session):
        r = session.get(f"{API}/places/geocode", params={"q": "abc"})
        assert r.status_code == 200
        assert r.json() == {"result": None}


# ---------- 4. routes/compute ----------
class TestRoutesCompute:
    def test_compute_estimate(self, session):
        body = {
            "origin": {"lat": AMBAJOGAI[0], "lng": AMBAJOGAI[1]},
            "destination": {"lat": MOREWADI[0], "lng": MOREWADI[1]},
        }
        r = session.post(f"{API}/routes/compute", json=body)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["source"] == "estimate"
        assert d["distance_km"] > 0
        assert d["duration_min"] >= 3
        # ~2.1 km straight * 1.3 = ~2.7 km road estimate (allow range)
        assert 1.5 <= d["distance_km"] <= 5.0

    def test_compute_min_floor(self, session):
        # same origin & destination -> distance should still clamp to 0.5 km min
        body = {"origin": {"lat": AMBAJOGAI[0], "lng": AMBAJOGAI[1]},
                "destination": {"lat": AMBAJOGAI[0], "lng": AMBAJOGAI[1]}}
        r = session.post(f"{API}/routes/compute", json=body)
        assert r.status_code == 200
        assert r.json()["distance_km"] >= 0.5


# ---------- 5. POST /rides uses server-computed distance ----------
class TestRideServerDistance:
    def test_ride_ignores_client_distance_and_uses_server(self, session, customer_token, fare_cfg):
        headers = {"Authorization": f"Bearer {customer_token}"}
        # Client lies: says 50 km, but Ambajogai->Morewadi is ~2.7 km (estimate)
        payload = {
            "pickup_address": "Ambajogai",
            "pickup_lat": AMBAJOGAI[0],
            "pickup_lng": AMBAJOGAI[1],
            "drop_address": "Morewadi",
            "drop_lat": MOREWADI[0],
            "drop_lng": MOREWADI[1],
            "service_type": "ZipBike",
            "distance_km": 50.0,       # lie
            "fare": 9999.0,            # lie
        }
        r = session.post(f"{API}/rides", json=payload, headers=headers)
        assert r.status_code == 200, r.text
        ride = r.json()["ride"]
        # Server must override client's 50 km with ~2.x km
        assert ride["distance_km"] < 10.0, f"Server did not override client distance: {ride['distance_km']}"
        assert ride["distance_km"] > 0
        # duration_min must be present
        assert ride.get("duration_min") is not None and ride["duration_min"] >= 1
        # fare must equal compute_fare(server distance, service)
        exp = _expected_fare(fare_cfg, ride["distance_km"], "ZipBike")
        assert ride["fare"] == exp, f"Fare mismatch: ride.fare={ride['fare']} expected {exp} for d={ride['distance_km']}"
        # Persist ride_id for subsequent tests
        pytest.ride_id = ride["id"]

    def test_ride_rejects_zero_or_huge_distance(self, session, customer_token):
        headers = {"Authorization": f"Bearer {customer_token}"}
        base = {
            "pickup_address": "A", "pickup_lat": AMBAJOGAI[0], "pickup_lng": AMBAJOGAI[1],
            "drop_address": "B", "drop_lat": MOREWADI[0], "drop_lng": MOREWADI[1],
            "service_type": "ZipBike", "fare": 100,
        }
        for bad in (0, -1, 250):
            r = session.post(f"{API}/rides", json={**base, "distance_km": bad}, headers=headers)
            assert r.status_code == 400, f"Expected 400 for distance_km={bad}, got {r.status_code}"


# ---------- 5b. Service-area 30 km enforcement ----------
# Bengaluru MG Road - ~700 km from Ambajogai, well outside radius
BENGALURU = (12.9758, 77.6068)


class TestServiceArea:
    def _payload(self, p, d):
        return {
            "pickup_address": "P", "pickup_lat": p[0], "pickup_lng": p[1],
            "drop_address": "D", "drop_lat": d[0], "drop_lng": d[1],
            "service_type": "ZipBike", "distance_km": 5.0, "fare": 100,
        }

    def test_reject_pickup_outside_30km(self, session, customer_token):
        headers = {"Authorization": f"Bearer {customer_token}"}
        r = session.post(f"{API}/rides", json=self._payload(BENGALURU, MOREWADI), headers=headers)
        assert r.status_code == 400, r.text
        detail = r.json().get("detail", "").lower()
        assert "outside the ziprides service area" in detail, detail
        assert "pickup" in detail

    def test_reject_drop_outside_30km(self, session, customer_token):
        headers = {"Authorization": f"Bearer {customer_token}"}
        r = session.post(f"{API}/rides", json=self._payload(AMBAJOGAI, BENGALURU), headers=headers)
        assert r.status_code == 400
        detail = r.json().get("detail", "").lower()
        assert "outside the ziprides service area" in detail
        assert "drop" in detail

    def test_accept_inside_30km(self, session, customer_token):
        headers = {"Authorization": f"Bearer {customer_token}"}
        r = session.post(f"{API}/rides", json=self._payload(AMBAJOGAI, MOREWADI), headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["ride"]["status"] == "searching"



# ---------- 6. captain/location authz ----------
class TestCaptainLocation:
    def test_customer_forbidden(self, session, customer_token):
        headers = {"Authorization": f"Bearer {customer_token}"}
        r = session.post(f"{API}/captain/location",
                         json={"lat": AMBAJOGAI[0], "lng": AMBAJOGAI[1]}, headers=headers)
        assert r.status_code == 403, r.text

    def test_captain_updates_self_without_ride(self, session, captain_token):
        headers = {"Authorization": f"Bearer {captain_token}"}
        r = session.post(f"{API}/captain/location",
                         json={"lat": AMBAJOGAI[0], "lng": AMBAJOGAI[1]}, headers=headers)
        assert r.status_code == 200
        assert r.json().get("success") is True

    def test_captain_updates_ride_lat_lng(self, session, customer_token, captain_token):
        # Create a fresh ride then accept it as captain and push location
        headers_c = {"Authorization": f"Bearer {customer_token}"}
        payload = {
            "pickup_address": "Ambajogai", "pickup_lat": AMBAJOGAI[0], "pickup_lng": AMBAJOGAI[1],
            "drop_address": "Morewadi", "drop_lat": MOREWADI[0], "drop_lng": MOREWADI[1],
            "service_type": "ZipBike", "distance_km": 3.0, "fare": 60,
        }
        r = session.post(f"{API}/rides", json=payload, headers=headers_c)
        assert r.status_code == 200
        ride_id = r.json()["ride"]["id"]

        headers_cap = {"Authorization": f"Bearer {captain_token}"}
        acc = session.post(f"{API}/rides/{ride_id}/accept", json={}, headers=headers_cap)
        assert acc.status_code == 200, acc.text

        push = session.post(f"{API}/captain/location",
                            json={"lat": 18.75, "lng": 76.40, "ride_id": ride_id},
                            headers=headers_cap)
        assert push.status_code == 200

        # Verify ride got captain_lat/lng
        g = session.get(f"{API}/rides/{ride_id}", headers=headers_c)
        assert g.status_code == 200
        ride = g.json()["ride"]
        assert ride.get("captain_lat") == 18.75
        assert ride.get("captain_lng") == 76.40
        assert ride.get("captain_loc_at")
