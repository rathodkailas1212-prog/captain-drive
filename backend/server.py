from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import asyncio
import logging
import random
import math
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
import httpx


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="ZipRides API")
api = APIRouter(prefix="/api")

# Fixed admin phone (mocked login). Pre-seeded on startup.
ADMIN_PHONE = "9999999999"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("zipride")


# ============================================================================
# MODELS
# ============================================================================
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class OTPRequest(BaseModel):
    phone: str
    role: Literal["customer", "captain", "admin"]


class OTPVerify(BaseModel):
    phone: str
    otp: str
    role: Literal["customer", "captain", "admin"]


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    photo: Optional[str] = None
    vehicle_number: Optional[str] = None
    vehicle_type: Optional[str] = None
    aadhaar: Optional[str] = None
    driving_license: Optional[str] = None
    vehicle_rc: Optional[str] = None


class DutyToggle(BaseModel):
    online: bool


class RideCreate(BaseModel):
    pickup_address: str
    pickup_lat: float
    pickup_lng: float
    drop_address: str
    drop_lat: float
    drop_lng: float
    service_type: Literal["ZipBike", "ZipDelivery"]
    distance_km: float
    fare: float


class RideStatusUpdate(BaseModel):
    status: Literal[
        "accepted",
        "reached_pickup",
        "started",
        "completed",
        "cancelled",
    ]


class RideRating(BaseModel):
    rating: int
    comment: Optional[str] = None
    payment_method: Optional[Literal["upi", "cash", "wallet"]] = None
    tip: Optional[float] = 0


class ReferralApply(BaseModel):
    code: str


class FavoriteCreate(BaseModel):
    label: str
    address: str
    lat: float
    lng: float
    icon: Optional[str] = "location"


class UserBlockPayload(BaseModel):
    blocked: bool
    reason: Optional[str] = None


class KYCDecisionPayload(BaseModel):
    approved: bool
    reason: Optional[str] = None


class FareConfigUpdate(BaseModel):
    service_type: Literal["ZipBike", "ZipDelivery"]
    base: float
    per_km: float
    min: float
    commission_pct: Optional[float] = None


class ComplaintResolvePayload(BaseModel):
    resolution: str


class SOSAlert(BaseModel):
    lat: float
    lng: float
    message: Optional[str] = None


class FareEstimateReq(BaseModel):
    distance_km: float
    service_type: Literal["ZipBike", "ZipDelivery"]


# ============================================================================
# AUTH HELPERS
# ============================================================================
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    user = await db.users.find_one({"token": token}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    if user.get("blocked"):
        raise HTTPException(status_code=403, detail="Account blocked. Contact support.")
    return user


async def require_captain(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "captain":
        raise HTTPException(status_code=403, detail="Captain role required")
    return user


async def require_customer(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "customer":
        raise HTTPException(status_code=403, detail="Customer role required")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


def ensure_ride_participant(ride: dict, user: dict) -> None:
    """Raise 403 unless the user is the ride's customer or its assigned captain."""
    customer_id = ride.get("customer_id")
    captain_id = ride.get("captain_id") or (ride.get("captain") or {}).get("id")
    if user["id"] != customer_id and user["id"] != captain_id:
        raise HTTPException(status_code=403, detail="Not authorized for this ride")


# Simple in-memory SOS rate limiter: user_id -> list[epoch_seconds]
_SOS_HITS: dict = {}
SOS_MAX = 3
SOS_WINDOW = 300  # seconds


# ============================================================================
# FARE / DISTANCE LOGIC
# ============================================================================
FARE_CONFIG = {
    "ZipBike": {"base": 25, "per_km": 8, "min": 30, "commission_pct": 15},
    "ZipDelivery": {"base": 40, "per_km": 12, "min": 50, "commission_pct": 18},
}


def compute_fare(distance_km: float, service: str) -> float:
    cfg = FARE_CONFIG.get(service, FARE_CONFIG["ZipBike"])
    fare = cfg["base"] + cfg["per_km"] * distance_km
    return round(max(fare, cfg["min"]), 2)


def haversine(lat1, lng1, lat2, lng2):
    R = 6371
    dLat = math.radians(lat2 - lat1)
    dLng = math.radians(lng2 - lng1)
    a = (
        math.sin(dLat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dLng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


# ============================================================================
# ROUTES
# ============================================================================
@api.get("/")
async def root():
    return {"message": "ZipRides API is running", "time": now_iso()}


# ============================================================================
# MSG91 SMS OTP (real SMS in production; `1234` bypass in dev/preview)
# ============================================================================
ZIPRIDE_ENV = os.environ.get("ZIPRIDE_ENV", "development").lower()
MSG91_AUTH_KEY = os.environ.get("MSG91_AUTH_KEY", "").strip()
MSG91_OTP_TEMPLATE_ID = os.environ.get("MSG91_OTP_TEMPLATE_ID", "").strip()
IS_PROD = ZIPRIDE_ENV == "production"


def normalize_indian_phone(value: str) -> str:
    """Return `91XXXXXXXXXX` (MSG91 format). Accept +91XXXXXXXXXX, 91XXXXXXXXXX,
    or bare 10-digit. Raise HTTPException 400 on invalid."""
    digits = re.sub(r"\D", "", value or "")
    if digits.startswith("91") and len(digits) == 12:
        local = digits[2:]
    elif len(digits) == 10:
        local = digits
    else:
        raise HTTPException(status_code=400, detail="Invalid Indian mobile number")
    if not re.fullmatch(r"[6-9]\d{9}", local):
        raise HTTPException(status_code=400, detail="Invalid Indian mobile number")
    return "91" + local


async def _msg91_request(method: str, url: str, *, params: dict, headers: dict) -> dict:
    """Retry transport + 429/5xx up to 3 times with exp backoff. Never leaks keys."""
    timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.request(method, url, params=params, headers=headers)
            if res.status_code not in {429, 500, 502, 503, 504}:
                try:
                    body = res.json()
                except Exception:
                    body = {"message": res.text[:300]}
                if res.status_code >= 400:
                    logger.warning("MSG91 returned %s: %s", res.status_code, body)
                    raise HTTPException(status_code=502, detail="OTP provider rejected the request")
                return body if isinstance(body, dict) else {"data": body}
            last_err = RuntimeError(f"MSG91 HTTP {res.status_code}")
        except (httpx.TimeoutException, httpx.NetworkError) as e:
            last_err = e
        if attempt < 2:
            await asyncio.sleep(0.5 * (2 ** attempt))
    logger.error("MSG91 unavailable after retries: %r", last_err)
    raise HTTPException(status_code=503, detail="OTP service temporarily unavailable")


async def msg91_send_otp(phone_e164: str) -> dict:
    if not MSG91_AUTH_KEY or not MSG91_OTP_TEMPLATE_ID:
        raise HTTPException(
            status_code=500,
            detail="MSG91 not configured (set MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID)",
        )
    return await _msg91_request(
        "POST",
        "https://control.msg91.com/api/v5/otp",
        params={
            "template_id": MSG91_OTP_TEMPLATE_ID,
            "mobile": phone_e164,
            "authkey": MSG91_AUTH_KEY,
            "otp_length": "4",
            "otp_expiry": "10",
        },
        headers={"accept": "application/json"},
    )


async def msg91_verify_otp(phone_e164: str, otp: str) -> dict:
    if not MSG91_AUTH_KEY:
        raise HTTPException(status_code=500, detail="MSG91 not configured")
    return await _msg91_request(
        "GET",
        "https://control.msg91.com/api/v5/otp/verify",
        params={"mobile": phone_e164, "otp": otp},
        headers={"accept": "application/json", "authkey": MSG91_AUTH_KEY},
    )


def msg91_ok(payload: dict, verify: bool = False) -> bool:
    msg = str(payload.get("message", "")).lower()
    kind = str(payload.get("type", "")).lower()
    if kind == "success":
        return True
    if verify and "verified" in msg and "success" in msg:
        return True
    if not verify and "sent" in msg:
        return True
    return False


# ---------- AUTH ----------
@api.post("/auth/send-otp")
async def send_otp(payload: OTPRequest):
    # Admin login: no SMS ever — admin phone is fixed and known.
    if payload.role == "admin":
        return {"success": True, "message": "Enter OTP 1234 (admin bypass).", "phone": payload.phone}

    phone_e164 = normalize_indian_phone(payload.phone)

    if IS_PROD:
        result = await msg91_send_otp(phone_e164)
        if not msg91_ok(result):
            logger.warning("MSG91 send rejected: %s", result.get("message"))
            raise HTTPException(status_code=502, detail="Unable to send OTP")
        return {"success": True, "message": "OTP sent to your phone.", "phone": payload.phone}

    # Non-production bypass — no real SMS, `1234` will work in verify.
    return {"success": True, "message": "OTP sent (dev bypass — use 1234).", "phone": payload.phone}


@api.post("/auth/verify-otp")
async def verify_otp(payload: OTPVerify):
    # Canonical phone key for DB lookup + storage. Admin uses its fixed value.
    if payload.role == "admin":
        if payload.phone != ADMIN_PHONE:
            raise HTTPException(status_code=403, detail="This phone number is not an admin.")
        if payload.otp != "1234":
            raise HTTPException(status_code=400, detail="Invalid admin OTP.")
        canonical_phone = ADMIN_PHONE
    else:
        # Always normalize so `+91xxx`, `91xxx`, `xxx` all resolve to the SAME user.
        canonical_phone = normalize_indian_phone(payload.phone)
        # Real MSG91 verification in production, bypass elsewhere
        if IS_PROD:
            result = await msg91_verify_otp(canonical_phone, payload.otp)
            if not msg91_ok(result, verify=True):
                raise HTTPException(status_code=400, detail="Invalid or expired OTP.")
        else:
            if payload.otp != "1234":
                raise HTTPException(status_code=400, detail="Invalid OTP. Use 1234 for demo.")

    existing = await db.users.find_one(
        {"phone": canonical_phone, "role": payload.role}, {"_id": 0}
    )
    token = str(uuid.uuid4())

    if existing:
        set_fields = {"token": token, "last_login": now_iso()}
        # Backfill referral fields for pre-existing users
        if not existing.get("referral_code"):
            set_fields["referral_code"] = f"ZIP{canonical_phone[-4:]}{random.randint(10, 99)}"
        if existing.get("referrals_count") is None:
            set_fields["referrals_count"] = 0
        if existing.get("credits_earned") is None:
            set_fields["credits_earned"] = 0.0
        await db.users.update_one(
            {"phone": canonical_phone, "role": payload.role},
            {"$set": set_fields},
        )
        user = await db.users.find_one(
            {"phone": canonical_phone, "role": payload.role}, {"_id": 0}
        )
    else:
        user = {
            "id": str(uuid.uuid4()),
            "phone": canonical_phone,
            "role": payload.role,
            "name": "",
            "photo": "",
            "token": token,
            "created_at": now_iso(),
            "last_login": now_iso(),
            "rating": 4.8,
            "total_rides": 0,
            "wallet_balance": 0.0,
            # captain specific
            "vehicle_number": "",
            "vehicle_type": "ZipBike",
            "aadhaar": "",
            "driving_license": "",
            "vehicle_rc": "",
            "is_online": False,
            "cash_in_hand": 0.0,
            "total_earnings": 0.0,
            "kyc_verified": False,
            # referral
            "referral_code": f"ZIP{canonical_phone[-4:]}{random.randint(10, 99)}",
            "referred_by": None,
            "referrals_count": 0,
            "credits_earned": 0.0,
        }
        await db.users.insert_one(dict(user))
        # Remove any Mongo-added _id from returned object
        user.pop("_id", None)

    return {"success": True, "user": user, "token": token}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": user}


@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    # Invalidate the current bearer token server-side
    await db.users.update_one({"id": user["id"]}, {"$set": {"token": ""}})
    return {"success": True}


@api.put("/users/profile")
async def update_profile(
    payload: ProfileUpdate, user: dict = Depends(get_current_user)
):
    updates = {k: v for k, v in payload.dict().items() if v is not None}
    if not updates:
        return {"user": user}
    # If any KYC doc is present for a captain, mark verified
    if user.get("role") == "captain":
        merged = {**user, **updates}
        if merged.get("aadhaar") and merged.get("driving_license") and merged.get("vehicle_rc"):
            updates["kyc_verified"] = True
    await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": updated}


# ---------- FARE ESTIMATE ----------
@api.post("/fare/estimate")
async def fare_estimate(payload: FareEstimateReq):
    fare = compute_fare(payload.distance_km, payload.service_type)
    eta_min = max(3, int(payload.distance_km * 2.5))
    return {
        "service_type": payload.service_type,
        "distance_km": payload.distance_km,
        "fare": fare,
        "eta_min": eta_min,
        "config": FARE_CONFIG[payload.service_type],
    }


@api.get("/fare/config")
async def fare_config():
    return FARE_CONFIG


# ============================================================================
# MAPS: local village directory + Google Places/Routes (server-side key only)
# ============================================================================
GOOGLE_MAPS_SERVER_KEY = os.environ.get("GOOGLE_MAPS_SERVER_KEY", "").strip()
_PLACES_FILE = ROOT_DIR / "data" / "ambajogai_places.json"
with open(_PLACES_FILE, encoding="utf-8") as _f:
    PLACES_DATA = json.load(_f)
LOCAL_PLACES = PLACES_DATA["places"]
SERVICE_CENTER = PLACES_DATA["center"]
_ROUTE_CACHE: dict = {}


class LatLngIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class RouteReq(BaseModel):
    origin: LatLngIn
    destination: LatLngIn


class CaptainLocation(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    ride_id: Optional[str] = None


async def _google_post(url: str, body: dict, field_mask: str) -> Optional[dict]:
    """Call a Google Maps web service. Returns None on any failure (caller falls back)."""
    if not GOOGLE_MAPS_SERVER_KEY:
        return None
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_SERVER_KEY,
        "X-Goog-FieldMask": field_mask,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(url, json=body, headers=headers)
        if r.status_code >= 400:
            logger.warning("Google Maps %s -> %s", url.split("/")[-1], r.status_code)
            return None
        return r.json()
    except (httpx.TimeoutException, httpx.NetworkError) as e:
        logger.warning("Google Maps unreachable: %r", e)
        return None


async def compute_route(o_lat: float, o_lng: float, d_lat: float, d_lng: float) -> dict:
    """Road distance + ETA. Google Routes API when configured, else straight-line estimate."""
    key = (round(o_lat, 4), round(o_lng, 4), round(d_lat, 4), round(d_lng, 4))
    if key in _ROUTE_CACHE:
        return _ROUTE_CACHE[key]
    data = await _google_post(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        {
            "origin": {"location": {"latLng": {"latitude": o_lat, "longitude": o_lng}}},
            "destination": {"location": {"latLng": {"latitude": d_lat, "longitude": d_lng}}},
            "travelMode": "TWO_WHEELER",
            "regionCode": "IN",
        },
        "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    )
    route = ((data or {}).get("routes") or [None])[0]
    if route and route.get("distanceMeters"):
        result = {
            "distance_km": round(route["distanceMeters"] / 1000, 2),
            "duration_min": max(1, round(int(str(route.get("duration", "0s")).rstrip("s") or 0) / 60)),
            "polyline": (route.get("polyline") or {}).get("encodedPolyline"),
            "source": "google",
        }
    else:
        # Fallback: straight line x 1.3 road factor, 25 km/h avg rural speed
        km = round(max(0.5, haversine(o_lat, o_lng, d_lat, d_lng) * 1.3), 2)
        result = {"distance_km": km, "duration_min": max(3, round(km / 25 * 60)), "polyline": None, "source": "estimate"}
    _ROUTE_CACHE[key] = result
    return result


@api.get("/maps/config")
async def maps_config():
    return {
        "google_enabled": bool(GOOGLE_MAPS_SERVER_KEY),
        "center": SERVICE_CENTER,
        "radius_km": PLACES_DATA["radius_km"],
        "local_places_count": len(LOCAL_PLACES),
    }


@api.get("/places/search")
async def places_search(q: str = "", session_token: Optional[str] = None, limit: int = 30):
    """Local Ambajogai directory first, then Google Places Autocomplete suggestions."""
    term = q.strip().lower()
    if term:
        starts = [p for p in LOCAL_PLACES if p["name"].lower().startswith(term) or p["name_local"].startswith(q.strip())]
        contains = [p for p in LOCAL_PLACES if p not in starts and term in p["name"].lower()]
        local = starts + contains
    else:
        # Popular town pickup points (bus stand, temples, hospitals…) first, then villages by distance
        local = [p for p in LOCAL_PLACES if p["type"] == "landmark"] + [p for p in LOCAL_PLACES if p["type"] != "landmark"]
    local = local[: max(1, min(limit, 500))]

    google: list = []
    if term and len(term) >= 2 and GOOGLE_MAPS_SERVER_KEY:
        body = {
            "input": q.strip(),
            "includedRegionCodes": ["in"],
            "locationBias": {"circle": {
                "center": {"latitude": SERVICE_CENTER["lat"], "longitude": SERVICE_CENTER["lng"]},
                "radius": 30000.0,
            }},
        }
        if session_token:
            body["sessionToken"] = session_token[:100]
        data = await _google_post(
            "https://places.googleapis.com/v1/places:autocomplete",
            body,
            "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat",
        )
        for s in (data or {}).get("suggestions", [])[:5]:
            pp = s.get("placePrediction") or {}
            sf = pp.get("structuredFormat") or {}
            google.append({
                "place_id": pp.get("placeId"),
                "name": (sf.get("mainText") or {}).get("text", ""),
                "address": (sf.get("secondaryText") or {}).get("text", ""),
                "source": "google",
            })
    return {"local": local, "google": google}


@api.get("/places/details/{place_id}")
async def place_details(place_id: str, session_token: Optional[str] = None):
    if not GOOGLE_MAPS_SERVER_KEY:
        raise HTTPException(status_code=503, detail="Google Places not configured")
    if not re.fullmatch(r"[A-Za-z0-9_\-]{10,300}", place_id):
        raise HTTPException(status_code=400, detail="Invalid place id")
    headers = {"X-Goog-Api-Key": GOOGLE_MAPS_SERVER_KEY, "X-Goog-FieldMask": "location,displayName,formattedAddress"}
    params = {"sessionToken": session_token[:100]} if session_token else {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(f"https://places.googleapis.com/v1/places/{place_id}", headers=headers, params=params)
    except (httpx.TimeoutException, httpx.NetworkError):
        raise HTTPException(status_code=503, detail="Places service unavailable")
    if r.status_code >= 400:
        raise HTTPException(status_code=502, detail="Places service error")
    d = r.json()
    loc = d.get("location") or {}
    return {
        "name": (d.get("displayName") or {}).get("text", ""),
        "address": d.get("formattedAddress", ""),
        "lat": loc.get("latitude"),
        "lng": loc.get("longitude"),
    }


@api.get("/places/geocode")
async def places_geocode(q: str):
    """Geocode a manually typed address (Google Geocoding). Returns null result if unavailable."""
    if not GOOGLE_MAPS_SERVER_KEY or len(q.strip()) < 3:
        return {"result": None}
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"address": q.strip()[:200], "region": "in", "key": GOOGLE_MAPS_SERVER_KEY,
                        "bounds": f"{SERVICE_CENTER['lat']-0.3},{SERVICE_CENTER['lng']-0.3}|{SERVICE_CENTER['lat']+0.3},{SERVICE_CENTER['lng']+0.3}"},
            )
        res = (r.json().get("results") or [None])[0]
    except Exception:
        return {"result": None}
    if not res:
        return {"result": None}
    loc = res["geometry"]["location"]
    return {"result": {"address": res.get("formatted_address", q), "lat": loc["lat"], "lng": loc["lng"]}}


@api.post("/routes/compute")
async def routes_compute(payload: RouteReq):
    return await compute_route(payload.origin.lat, payload.origin.lng, payload.destination.lat, payload.destination.lng)


@api.post("/captain/location")
async def captain_location(payload: CaptainLocation, user: dict = Depends(require_captain)):
    loc = {"captain_lat": payload.lat, "captain_lng": payload.lng, "captain_loc_at": now_iso()}
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_lat": payload.lat, "last_lng": payload.lng}})
    if payload.ride_id:
        await db.rides.update_one({"id": payload.ride_id, "captain_id": user["id"]}, {"$set": loc})
    return {"success": True}


# ---------- CAPTAINS NEARBY ----------
@api.get("/captains/nearby")
async def captains_nearby(lat: float = 18.73312, lng: float = 76.38616):
    # Return 6 pseudo-random nearby captains around the given lat/lng
    random.seed(int(lat * 1000) + int(lng * 1000))
    captains = []
    names = ["Ravi", "Amit", "Sundar", "Kiran", "Pooja", "Arjun"]
    for i in range(6):
        d_lat = (random.random() - 0.5) * 0.01
        d_lng = (random.random() - 0.5) * 0.01
        captains.append(
            {
                "id": f"cap-{i+1}",
                "name": names[i],
                "lat": lat + d_lat,
                "lng": lng + d_lng,
                "vehicle_type": "ZipBike" if i % 2 == 0 else "ZipDelivery",
                "vehicle_number": f"KA-01-{1000+i*13}",
                "rating": round(4.5 + random.random() * 0.5, 1),
                "eta_min": random.randint(2, 8),
            }
        )
    return {"captains": captains}


# ---------- RIDES ----------
@api.post("/rides")
async def create_ride(payload: RideCreate, user: dict = Depends(require_customer)):
    # Validate distance range (SEC-002: prevent fare abuse via extreme values)
    if payload.distance_km <= 0 or payload.distance_km > 200:
        raise HTTPException(status_code=400, detail="Invalid distance (must be 0-200 km)")

    # Service area: pickup and drop must be within radius of Ambajogai
    radius = PLACES_DATA["radius_km"]
    for label, la, ln in (("Pickup", payload.pickup_lat, payload.pickup_lng), ("Drop", payload.drop_lat, payload.drop_lng)):
        if haversine(SERVICE_CENTER["lat"], SERVICE_CENTER["lng"], la, ln) > radius:
            raise HTTPException(
                status_code=400,
                detail=f"{label} is outside the ZipRides service area ({radius} km around Ambajogai).",
            )

    # Server-side distance + fare (SEC-002: ignore client-supplied fare/distance)
    route = await compute_route(payload.pickup_lat, payload.pickup_lng, payload.drop_lat, payload.drop_lng)
    distance_km = route["distance_km"]
    if distance_km > 200:
        raise HTTPException(status_code=400, detail="Trip too long (max 200 km)")
    server_fare = compute_fare(distance_km, payload.service_type)

    ride_id = str(uuid.uuid4())
    otp = str(random.randint(1000, 9999))
    captain_pool = [
        {
            "id": "cap-1",
            "name": "Ravi Kumar",
            "photo": "https://images.unsplash.com/photo-1759851683916-b1aee28f28a2?crop=entropy&cs=srgb&fm=jpg&w=400&q=80",
            "vehicle_number": "KA-01-1234",
            "rating": 4.9,
            "phone": "+919876543210",
        },
        {
            "id": "cap-2",
            "name": "Amit Sharma",
            "photo": "https://images.unsplash.com/photo-1759851683916-b1aee28f28a2?crop=entropy&cs=srgb&fm=jpg&w=400&q=80",
            "vehicle_number": "KA-05-4567",
            "rating": 4.8,
            "phone": "+919876543211",
        },
    ]
    captain = random.choice(captain_pool)

    ride = {
        "id": ride_id,
        "customer_id": user["id"],
        "customer_phone": user["phone"],
        "customer_name": user.get("name") or "Guest",
        "captain": captain,
        "pickup_address": payload.pickup_address,
        "pickup_lat": payload.pickup_lat,
        "pickup_lng": payload.pickup_lng,
        "drop_address": payload.drop_address,
        "drop_lat": payload.drop_lat,
        "drop_lng": payload.drop_lng,
        "service_type": payload.service_type,
        "distance_km": distance_km,
        "duration_min": route["duration_min"],
        "route_polyline": route["polyline"],
        "fare": server_fare,
        "otp": otp,
        "status": "searching",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "rating": None,
        "payment_method": None,
    }
    await db.rides.insert_one(dict(ride))
    ride.pop("_id", None)
    return {"ride": ride}


@api.get("/rides/{ride_id}")
async def get_ride(ride_id: str, user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    # SEC-003: only ride participants can read (customer or assigned captain)
    ensure_ride_participant(ride, user)
    return {"ride": ride}


@api.patch("/rides/{ride_id}/status")
async def update_ride_status(
    ride_id: str,
    payload: RideStatusUpdate,
    user: dict = Depends(get_current_user),
):
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    # SEC-002: only ride participants may change status
    ensure_ride_participant(ride, user)

    # SEC-002: idempotent completion — do not credit twice
    already_completed = ride.get("status") == "completed"

    updates = {"status": payload.status, "updated_at": now_iso()}
    await db.rides.update_one({"id": ride_id}, {"$set": updates})

    # Credit captain earnings only on first transition into 'completed'
    if (
        payload.status == "completed"
        and not already_completed
        and user.get("role") == "captain"
    ):
        fare = ride["fare"]
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$inc": {
                    "cash_in_hand": fare,
                    "total_earnings": fare,
                    "total_rides": 1,
                }
            },
        )

    updated = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    return {"ride": updated}


@api.post("/rides/{ride_id}/accept")
async def accept_ride(ride_id: str, user: dict = Depends(require_captain)):
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    # SEC-002: cannot re-accept an already-accepted ride
    if ride.get("captain_id") and ride["captain_id"] != user["id"]:
        raise HTTPException(status_code=409, detail="Ride already accepted by another captain")
    if ride.get("status") not in ("searching", "accepted"):
        raise HTTPException(status_code=409, detail=f"Ride cannot be accepted (status={ride.get('status')})")

    updates = {
        "status": "accepted",
        "updated_at": now_iso(),
        "captain": {
            "id": user["id"],
            "name": user.get("name") or "Captain",
            "photo": user.get("photo") or "https://images.unsplash.com/photo-1759851683916-b1aee28f28a2?crop=entropy&cs=srgb&fm=jpg&w=400&q=80",
            "vehicle_number": user.get("vehicle_number") or "KA-01-0000",
            "rating": user.get("rating", 4.8),
            "phone": user["phone"],
        },
        "captain_id": user["id"],
    }
    await db.rides.update_one({"id": ride_id}, {"$set": updates})
    updated = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    return {"ride": updated}


@api.post("/rides/{ride_id}/rate")
async def rate_ride(
    ride_id: str, payload: RideRating, user: dict = Depends(get_current_user)
):
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

    # SEC-004: only the ride's customer may rate
    if ride.get("customer_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Only the ride's customer can rate")

    # SEC-004: idempotent — rate only once
    if ride.get("rating") is not None:
        raise HTTPException(status_code=409, detail="Ride already rated")

    # SEC-004: validate rating and tip bounds
    if payload.rating < 1 or payload.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")
    tip = float(payload.tip or 0)
    if tip < 0 or tip > 500:
        raise HTTPException(status_code=400, detail="Tip must be 0-500")

    updates = {
        "rating": payload.rating,
        "rating_comment": payload.comment,
        "payment_method": payload.payment_method,
        "tip": tip,
        "updated_at": now_iso(),
    }
    await db.rides.update_one({"id": ride_id}, {"$set": updates})

    captain_id = ride.get("captain_id") or (ride.get("captain") or {}).get("id")

    # Reduce cash-in-hand if wallet/upi payment used (captain doesn't keep cash)
    if payload.payment_method in ("upi", "wallet") and captain_id:
        await db.users.update_one(
            {"id": captain_id}, {"$inc": {"cash_in_hand": -ride["fare"]}}
        )

    # Add tip to captain's earnings (regardless of payment method it goes to captain)
    if tip > 0 and captain_id:
        await db.users.update_one(
            {"id": captain_id},
            {"$inc": {"total_earnings": tip, "cash_in_hand": tip if payload.payment_method == "cash" else 0}},
        )

    # Deduct tip from customer's wallet if wallet payment
    if tip > 0 and payload.payment_method == "wallet":
        await db.users.update_one(
            {"id": user["id"]}, {"$inc": {"wallet_balance": -tip}}
        )

    return {"success": True, "tip": tip}


@api.post("/rides/{ride_id}/sos")
async def sos_alert(
    ride_id: str, payload: SOSAlert, user: dict = Depends(get_current_user)
):
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    # SEC-hardening: only ride participants may trigger SOS
    ensure_ride_participant(ride, user)

    # SEC-hardening: rate limit — max SOS_MAX alerts per SOS_WINDOW seconds per user
    import time as _time
    now = _time.time()
    hits = [t for t in _SOS_HITS.get(user["id"], []) if now - t < SOS_WINDOW]
    if len(hits) >= SOS_MAX:
        raise HTTPException(status_code=429, detail="Too many SOS requests, please wait")
    hits.append(now)
    _SOS_HITS[user["id"]] = hits

    entry = {
        "id": str(uuid.uuid4()),
        "ride_id": ride_id,
        "user_id": user["id"],
        "user_role": user["role"],
        "lat": payload.lat,
        "lng": payload.lng,
        "message": payload.message or "SOS activated",
        "created_at": now_iso(),
    }
    await db.sos_alerts.insert_one(dict(entry))
    entry.pop("_id", None)
    return {"success": True, "alert": entry}


@api.get("/rides/history/list")
async def rides_history(user: dict = Depends(get_current_user)):
    q = (
        {"customer_id": user["id"]}
        if user["role"] == "customer"
        else {"captain_id": user["id"]}
    )
    rides = await db.rides.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"rides": rides}


# ---------- CAPTAIN ----------
@api.post("/captain/duty")
async def captain_duty(payload: DutyToggle, user: dict = Depends(require_captain)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"is_online": payload.online}})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": updated}


@api.get("/captain/earnings")
async def captain_earnings(user: dict = Depends(require_captain)):
    # Aggregate from rides
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    week_start = today_start - timedelta(days=7)

    rides_cursor = db.rides.find(
        {"captain_id": user["id"], "status": "completed"}, {"_id": 0}
    )
    rides = await rides_cursor.to_list(1000)

    today_rides = [r for r in rides if r.get("updated_at", "") >= today_start.isoformat()]
    week_rides = [r for r in rides if r.get("updated_at", "") >= week_start.isoformat()]

    weekly_history = {}
    for r in week_rides:
        try:
            day = r["updated_at"][:10]
            weekly_history[day] = weekly_history.get(day, 0) + r["fare"]
        except Exception:
            continue
    weekly = [{"date": k, "earnings": round(v, 2)} for k, v in sorted(weekly_history.items())]

    return {
        "today_earnings": round(sum(r["fare"] for r in today_rides), 2),
        "today_rides": len(today_rides),
        "week_earnings": round(sum(r["fare"] for r in week_rides), 2),
        "total_earnings": user.get("total_earnings", 0.0),
        "cash_in_hand": user.get("cash_in_hand", 0.0),
        "weekly": weekly,
    }


# ---------- CAPTAIN INCOMING REQUESTS ----------
@api.get("/captain/incoming")
async def captain_incoming(user: dict = Depends(require_captain)):
    """Simulate an incoming ride for an online captain."""
    if not user.get("is_online"):
        return {"request": None}

    # Look for a real 'searching' ride first
    ride = await db.rides.find_one(
        {"status": "searching", "captain_id": {"$exists": False}}, {"_id": 0}
    )
    if ride:
        return {"request": ride}

    # Otherwise return a mock demo request
    demo = {
        "id": f"demo-{int(datetime.now(timezone.utc).timestamp())}",
        "demo": True,
        "pickup_address": "Ambajogai Bus Stand, Ambajogai",
        "pickup_lat": 18.73312,
        "pickup_lng": 76.38616,
        "drop_address": "Morewadi, Ambajogai",
        "drop_lat": 18.72174,
        "drop_lng": 76.37025,
        "distance_km": 2.5,
        "fare": compute_fare(2.5, "ZipBike"),
        "service_type": "ZipBike",
        "customer_name": "Priya S.",
        "customer_rating": 4.7,
    }
    return {"request": demo}


# ---------- REFERRALS ----------
REFERRAL_BONUS = 50.0


@api.post("/referrals/apply")
async def apply_referral(payload: ReferralApply, user: dict = Depends(get_current_user)):
    code = (payload.code or "").strip().upper()
    if not code:
        raise HTTPException(status_code=400, detail="Referral code required")

    if user.get("referred_by"):
        raise HTTPException(status_code=400, detail="Referral code already applied")

    referrer = await db.users.find_one({"referral_code": code}, {"_id": 0})
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")

    if referrer["id"] == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot use your own code")

    # Credit both users
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {"referred_by": referrer["id"]},
            "$inc": {"wallet_balance": REFERRAL_BONUS, "credits_earned": REFERRAL_BONUS},
        },
    )
    await db.users.update_one(
        {"id": referrer["id"]},
        {"$inc": {"wallet_balance": REFERRAL_BONUS, "credits_earned": REFERRAL_BONUS, "referrals_count": 1}},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"success": True, "bonus": REFERRAL_BONUS, "user": updated}


@api.get("/referrals/summary")
async def referral_summary(user: dict = Depends(get_current_user)):
    referrals = await db.users.find(
        {"referred_by": user["id"]}, {"_id": 0, "name": 1, "phone": 1, "created_at": 1}
    ).to_list(100)
    return {
        "referral_code": user.get("referral_code", ""),
        "referrals_count": user.get("referrals_count", 0),
        "credits_earned": user.get("credits_earned", 0.0),
        "bonus_per_referral": REFERRAL_BONUS,
        "referrals": referrals,
    }


# ---------- FAVORITES ----------
@api.get("/favorites")
async def list_favorites(user: dict = Depends(get_current_user)):
    favs = await db.favorites.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).to_list(50)
    return {"favorites": favs}


@api.post("/favorites")
async def create_favorite(payload: FavoriteCreate, user: dict = Depends(get_current_user)):
    fav = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "label": payload.label,
        "address": payload.address,
        "lat": payload.lat,
        "lng": payload.lng,
        "icon": payload.icon or "location",
        "created_at": now_iso(),
    }
    await db.favorites.insert_one(dict(fav))
    fav.pop("_id", None)
    return {"favorite": fav}


@api.delete("/favorites/{fav_id}")
async def delete_favorite(fav_id: str, user: dict = Depends(get_current_user)):
    res = await db.favorites.delete_one({"id": fav_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Favorite not found")
    return {"success": True}


# ============================================================================
# ADMIN
# ============================================================================
async def seed_admin() -> None:
    """Seed the admin user if not already present."""
    existing = await db.users.find_one({"phone": ADMIN_PHONE, "role": "admin"})
    if existing:
        return
    admin = {
        "id": str(uuid.uuid4()),
        "phone": ADMIN_PHONE,
        "role": "admin",
        "name": "ZipRides Admin",
        "photo": "",
        "token": "",
        "created_at": now_iso(),
        "last_login": None,
        "wallet_balance": 0.0,
        "referral_code": "ZIPADMIN",
        "credits_earned": 0.0,
        "referrals_count": 0,
    }
    await db.users.insert_one(dict(admin))


@app.on_event("startup")
async def on_startup():
    await seed_admin()
    # Load persisted fare config overrides if any
    override = await db.settings.find_one({"key": "fare_config"}, {"_id": 0})
    if override and isinstance(override.get("value"), dict):
        for svc, cfg in override["value"].items():
            if svc in FARE_CONFIG:
                FARE_CONFIG[svc].update(cfg)


def _clean_user(u: dict) -> dict:
    """Strip fields we don't want to send from admin listings."""
    u.pop("_id", None)
    u.pop("token", None)
    return u


@api.get("/admin/dashboard")
async def admin_dashboard(user: dict = Depends(require_admin)):
    today_start = datetime.now(timezone.utc).replace(
        hour=0, minute=0, second=0, microsecond=0
    ).isoformat()
    week_start = (
        datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        - timedelta(days=6)
    ).isoformat()

    total_customers = await db.users.count_documents({"role": "customer"})
    total_captains = await db.users.count_documents({"role": "captain"})
    active_captains = await db.users.count_documents({"role": "captain", "is_online": True})
    pending_kyc = await db.users.count_documents({"role": "captain", "kyc_verified": {"$ne": True}})
    blocked = await db.users.count_documents({"blocked": True})

    rides_today = await db.rides.find(
        {"created_at": {"$gte": today_start}}, {"_id": 0}
    ).to_list(2000)
    rides_completed_today = [r for r in rides_today if r.get("status") == "completed"]
    revenue_today = round(sum(r.get("fare", 0) for r in rides_completed_today), 2)

    # Commission earned today (approx via service commission_pct)
    commission_today = 0.0
    for r in rides_completed_today:
        cfg = FARE_CONFIG.get(r.get("service_type") or "ZipBike", {})
        commission_today += r.get("fare", 0) * (cfg.get("commission_pct", 0) / 100)
    commission_today = round(commission_today, 2)

    # Weekly ride volume (last 7 days)
    week_rides = await db.rides.find(
        {"created_at": {"$gte": week_start}, "status": "completed"}, {"_id": 0}
    ).to_list(5000)
    daily = {}
    for r in week_rides:
        day = r["created_at"][:10]
        daily[day] = daily.get(day, 0) + r.get("fare", 0)
    weekly = [{"date": k, "revenue": round(v, 2)} for k, v in sorted(daily.items())]

    open_complaints = await db.sos_alerts.count_documents({"resolved": {"$ne": True}})

    return {
        "total_customers": total_customers,
        "total_captains": total_captains,
        "active_captains": active_captains,
        "pending_kyc": pending_kyc,
        "blocked_users": blocked,
        "rides_today": len(rides_today),
        "rides_completed_today": len(rides_completed_today),
        "revenue_today": revenue_today,
        "commission_today": commission_today,
        "open_complaints": open_complaints,
        "weekly": weekly,
    }


@api.get("/admin/fleet")
async def admin_fleet(user: dict = Depends(require_admin)):
    captains = await db.users.find(
        {"role": "captain"}, {"_id": 0, "token": 0}
    ).to_list(1000)

    # Attach synthetic positions for display (or use last-known if stored)
    for i, c in enumerate(captains):
        base_lat = 12.9716
        base_lng = 77.5946
        c["lat"] = base_lat + ((hash(c["id"]) % 200) - 100) / 1000
        c["lng"] = base_lng + ((hash(c["id"]) % 300) - 150) / 1000

    return {"captains": captains}


@api.get("/admin/users")
async def admin_users(
    role: Optional[Literal["customer", "captain"]] = None,
    filter: Optional[Literal["blocked", "pending_kyc"]] = None,
    q: Optional[str] = None,
    user: dict = Depends(require_admin),
):
    query: dict = {}
    if role:
        query["role"] = role
    else:
        query["role"] = {"$in": ["customer", "captain"]}
    if filter == "blocked":
        query["blocked"] = True
    elif filter == "pending_kyc":
        query["role"] = "captain"
        query["kyc_verified"] = {"$ne": True}
    if q:
        query["$or"] = [
            {"phone": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
            {"vehicle_number": {"$regex": q, "$options": "i"}},
        ]
    users = await db.users.find(query, {"_id": 0, "token": 0}).sort("created_at", -1).to_list(200)
    return {"users": users}


@api.post("/admin/users/{uid}/block")
async def admin_block_user(uid: str, payload: UserBlockPayload, user: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Cannot block admin")
    updates = {
        "blocked": payload.blocked,
        "blocked_reason": payload.reason,
        "blocked_at": now_iso() if payload.blocked else None,
    }
    # Force logout when blocking
    if payload.blocked:
        updates["token"] = ""
        updates["is_online"] = False
    await db.users.update_one({"id": uid}, {"$set": updates})
    updated = await db.users.find_one({"id": uid}, {"_id": 0, "token": 0})
    return {"user": updated}


@api.post("/admin/users/{uid}/kyc")
async def admin_kyc_decision(uid: str, payload: KYCDecisionPayload, user: dict = Depends(require_admin)):
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") != "captain":
        raise HTTPException(status_code=400, detail="KYC applies to captains only")
    updates = {
        "kyc_verified": bool(payload.approved),
        "kyc_reviewed_at": now_iso(),
        "kyc_reason": payload.reason,
    }
    if not payload.approved:
        # Reset docs on rejection so captain can re-upload
        updates.update({"aadhaar": "", "driving_license": "", "vehicle_rc": ""})
    await db.users.update_one({"id": uid}, {"$set": updates})
    updated = await db.users.find_one({"id": uid}, {"_id": 0, "token": 0})
    return {"user": updated}


@api.get("/admin/fare-config")
async def admin_get_fare_config(user: dict = Depends(require_admin)):
    return {"fare_config": FARE_CONFIG}


@api.put("/admin/fare-config")
async def admin_update_fare_config(payload: FareConfigUpdate, user: dict = Depends(require_admin)):
    if payload.base < 0 or payload.per_km < 0 or payload.min < 0:
        raise HTTPException(status_code=400, detail="Values must be non-negative")
    cfg = FARE_CONFIG[payload.service_type]
    cfg["base"] = payload.base
    cfg["per_km"] = payload.per_km
    cfg["min"] = payload.min
    if payload.commission_pct is not None:
        if payload.commission_pct < 0 or payload.commission_pct > 60:
            raise HTTPException(status_code=400, detail="Commission must be 0-60%")
        cfg["commission_pct"] = payload.commission_pct
    # Persist for restarts
    await db.settings.update_one(
        {"key": "fare_config"},
        {"$set": {"key": "fare_config", "value": FARE_CONFIG, "updated_at": now_iso()}},
        upsert=True,
    )
    return {"fare_config": FARE_CONFIG}


@api.get("/admin/complaints")
async def admin_complaints(user: dict = Depends(require_admin)):
    alerts = await db.sos_alerts.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # Enrich with user + ride info
    for a in alerts:
        u = await db.users.find_one({"id": a.get("user_id")}, {"_id": 0, "token": 0})
        a["user"] = {"name": (u or {}).get("name"), "phone": (u or {}).get("phone"), "role": (u or {}).get("role")}
        r = await db.rides.find_one({"id": a.get("ride_id")}, {"_id": 0})
        a["ride"] = {"pickup_address": (r or {}).get("pickup_address"), "drop_address": (r or {}).get("drop_address"), "fare": (r or {}).get("fare")}
    return {"complaints": alerts}


@api.post("/admin/complaints/{cid}/resolve")
async def admin_resolve_complaint(cid: str, payload: ComplaintResolvePayload, user: dict = Depends(require_admin)):
    res = await db.sos_alerts.update_one(
        {"id": cid},
        {"$set": {"resolved": True, "resolution": payload.resolution, "resolved_at": now_iso(), "resolved_by": user["id"]}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return {"success": True}


@api.get("/admin/rides")
async def admin_rides(user: dict = Depends(require_admin)):
    rides = await db.rides.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"rides": rides}


# ============================================================================
# APP SETUP
# ============================================================================
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
