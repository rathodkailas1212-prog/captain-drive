from fastapi import FastAPI, APIRouter, HTTPException, Header, Depends
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import math
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="ZipRide API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("zipride")


# ============================================================================
# MODELS
# ============================================================================
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class OTPRequest(BaseModel):
    phone: str
    role: Literal["customer", "captain"]


class OTPVerify(BaseModel):
    phone: str
    otp: str
    role: Literal["customer", "captain"]


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
    user = await db.users.find_one({"token": token}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


# ============================================================================
# FARE / DISTANCE LOGIC
# ============================================================================
FARE_CONFIG = {
    "ZipBike": {"base": 25, "per_km": 8, "min": 30},
    "ZipDelivery": {"base": 40, "per_km": 12, "min": 50},
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
    return {"message": "ZipRide API is running", "time": now_iso()}


# ---------- AUTH ----------
@api.post("/auth/send-otp")
async def send_otp(payload: OTPRequest):
    # MOCK: pretend to send an OTP. Real code is always 1234.
    return {"success": True, "message": "OTP sent (use 1234 for demo)", "phone": payload.phone}


@api.post("/auth/verify-otp")
async def verify_otp(payload: OTPVerify):
    if payload.otp != "1234":
        raise HTTPException(status_code=400, detail="Invalid OTP. Use 1234 for demo.")

    existing = await db.users.find_one(
        {"phone": payload.phone, "role": payload.role}, {"_id": 0}
    )
    token = str(uuid.uuid4())

    if existing:
        await db.users.update_one(
            {"phone": payload.phone, "role": payload.role},
            {"$set": {"token": token, "last_login": now_iso()}},
        )
        user = await db.users.find_one(
            {"phone": payload.phone, "role": payload.role}, {"_id": 0}
        )
    else:
        user = {
            "id": str(uuid.uuid4()),
            "phone": payload.phone,
            "role": payload.role,
            "name": "",
            "photo": "",
            "token": token,
            "created_at": now_iso(),
            "last_login": now_iso(),
            "rating": 4.8,
            "total_rides": 0,
            "wallet_balance": 250.0,
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
        }
        await db.users.insert_one(dict(user))
        # Remove any Mongo-added _id from returned object
        user.pop("_id", None)

    return {"success": True, "user": user, "token": token}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": user}


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


# ---------- CAPTAINS NEARBY ----------
@api.get("/captains/nearby")
async def captains_nearby(lat: float = 12.9716, lng: float = 77.5946):
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
async def create_ride(payload: RideCreate, user: dict = Depends(get_current_user)):
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
        "distance_km": payload.distance_km,
        "fare": payload.fare,
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

    updates = {"status": payload.status, "updated_at": now_iso()}
    await db.rides.update_one({"id": ride_id}, {"$set": updates})

    # If completed and captain -> add to earnings, cash_in_hand
    if payload.status == "completed" and user.get("role") == "captain":
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
async def accept_ride(ride_id: str, user: dict = Depends(get_current_user)):
    ride = await db.rides.find_one({"id": ride_id}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")

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

    updates = {
        "rating": payload.rating,
        "rating_comment": payload.comment,
        "payment_method": payload.payment_method,
        "updated_at": now_iso(),
    }
    await db.rides.update_one({"id": ride_id}, {"$set": updates})

    # Reduce cash-in-hand if wallet/upi payment used (captain doesn't keep cash)
    if payload.payment_method in ("upi", "wallet"):
        captain_id = ride.get("captain_id") or (ride.get("captain") or {}).get("id")
        if captain_id:
            await db.users.update_one(
                {"id": captain_id}, {"$inc": {"cash_in_hand": -ride["fare"]}}
            )

    return {"success": True}


@api.post("/rides/{ride_id}/sos")
async def sos_alert(
    ride_id: str, payload: SOSAlert, user: dict = Depends(get_current_user)
):
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
async def captain_duty(payload: DutyToggle, user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"is_online": payload.online}})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"user": updated}


@api.get("/captain/earnings")
async def captain_earnings(user: dict = Depends(get_current_user)):
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
async def captain_incoming(user: dict = Depends(get_current_user)):
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
        "pickup_address": "MG Road Metro Station",
        "pickup_lat": 12.9758,
        "pickup_lng": 77.6068,
        "drop_address": "Indiranagar 100ft Road",
        "drop_lat": 12.9784,
        "drop_lng": 77.6408,
        "distance_km": 4.2,
        "fare": compute_fare(4.2, "ZipBike"),
        "service_type": "ZipBike",
        "customer_name": "Priya S.",
        "customer_rating": 4.7,
    }
    return {"request": demo}


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
