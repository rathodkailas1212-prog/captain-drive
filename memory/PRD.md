# ZipRides - Product Requirements Document

## Overview
ZipRide is a two-sided mobility marketplace built as a unified Expo mobile app. It contains both the Customer app (book rides / send packages) and the Captain app (drive & earn) under one binary, selectable by role at login.

## Tech Stack
- **Frontend**: Expo SDK 54 (React Native, expo-router file-based routing)
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **Maps**: Custom stylized `MockMap` component (works on iOS/Android/Web) — no Google Maps API keys required.
- **State**: Custom `useAuth()` hook backed by SecureStore for tokens.

## MVP Features (v1.0)

### Customer
1. Splash + Onboarding + Role Selection
2. OTP Login (MOCKED — accepts `1234`)
3. Live map with nearby captains (mocked positions)
4. Ride booking: pickup preset + destination search + service selector (ZipBike / ZipDelivery) + dynamic fare estimate
5. Searching & Matching (auto-accept after 4s + radar animation)
6. Live Tracking: captain marker moves towards user then to drop, route polyline, ride OTP display, call/chat/share/SOS actions
7. In-app chat (MOCKED — captain auto-replies)
8. SOS alert (posts to backend `/sos` endpoint)
9. Payment screen (MOCKED — UPI/Cash/Wallet)
10. Rating + tags + comment
11. Ride history

### Captain
1. Splash + Role Selection + OTP Login
2. Online/Offline duty toggle (map dims when offline)
3. Incoming Ride Request modal (20s countdown, big fare, pickup/drop, accept/decline)
4. Active Ride: stage-based CTA (Reached Pickup → Start Ride → Complete Ride), OTP verification, in-ride map, customer info
5. Earnings Dashboard: today, week, cash-in-hand, lifetime, weekly bar chart
6. Profile & Document Verification (Aadhaar, Driving License, Vehicle RC — MOCKED uploads)

## Backend API Endpoints
- `POST /api/auth/send-otp` (mock)
- `POST /api/auth/verify-otp` → returns `{user, token}`
- `GET /api/auth/me` (bearer token)
- `PUT /api/users/profile`
- `POST /api/fare/estimate`
- `GET /api/captains/nearby?lat=&lng=`
- `POST /api/rides` (create ride)
- `GET /api/rides/{id}`
- `PATCH /api/rides/{id}/status`
- `POST /api/rides/{id}/accept`
- `POST /api/rides/{id}/rate`
- `POST /api/rides/{id}/sos`
- `GET /api/rides/history/list`
- `POST /api/captain/duty`
- `GET /api/captain/earnings`
- `GET /api/captain/incoming`

## Fare Config
- ZipBike: base ₹25, ₹8/km, min ₹30
- ZipDelivery: base ₹40, ₹12/km, min ₹50

## Mocked Integrations (highlighted for user)
- **OTP**: MOCKED — always `1234`
- **Maps**: MOCKED — custom stylized map, no Google Maps
- **Payments**: MOCKED — UPI/Cash/Wallet simulate success
- **Chat**: MOCKED — captain auto-replies with static message
- **Captain matching**: MOCKED — random captain assigned when ride created; searching auto-completes after 4s
- **Captain incoming request**: MOCKED — demo ride shown after 3.5s if no real 'searching' ride exists

## Not Yet Built (v1.0 exclusion, from problem statement)
- Admin Web Panel (user selected Customer+Captain only)
- Real Google Maps routing
- Real Twilio SMS OTP
- Real Razorpay/Stripe payments
- Real-time WebSocket chat
- KYC document actual upload / verification workflow

## v1.2 — Google Maps + Ambajogai service area (Jun 2026)
- Backend: `GET /api/maps/config`, `GET /api/places/search?q=` (local Ambajogai directory + Google Places Autocomplete), `GET /api/places/details/{id}`, `GET /api/places/geocode?q=`, `POST /api/routes/compute` (Google Routes API TWO_WHEELER; fallback straight-line x1.3 @25km/h), `POST /api/captain/location`.
- `POST /api/rides` now computes distance server-side (route) and stores `duration_min`, `route_polyline`.
- Village directory: `/app/backend/data/ambajogai_places.json` — 292 places (285 villages, 1 town, 6 landmarks) within 30 km of Ambajogai (18.73312, 76.38616), source GeoNames (CC-BY), haversine-filtered. Beed 232, Latur 44, Dharashiv 8, Parbhani 8. 5 GeoNames "abandoned" (PPLQ) entries excluded.
- Frontend: `RideMap` (native Google map when `EXPO_PUBLIC_GOOGLE_MAPS_ENABLED=true`, else MockMap; web always MockMap), `PlaceSearchModal` (pickup+drop search, Use my location w/ permission flow, manual address -> geocode or nearest village), captain live location (foreground) + "Navigate in Google Maps".
- Keys needed to enable: backend `GOOGLE_MAPS_SERVER_KEY`; app.json `android.config.googleMaps.apiKey`, `ios.config.googleMapsApiKey`; then `EXPO_PUBLIC_GOOGLE_MAPS_ENABLED=true` and rebuild.

## v1.3 — Directory expansion + service area (Jun 2026)
- Directory now 478 entries: 440 settlements (395 villages, 44 hamlets, 1 town) merged from GeoNames + OpenStreetMap (Geofabrik extract) + Wikidata; 192 confirmed by 2+ sources. 38 verified landmarks/pickup points (Ambajogai Bus Station [OSM], Yogeshwari Temple, Kholeshwar, Mukundraj Samadhi, Shivleni caves, SRTR Medical College, Rural Hospital, railway stations, dams…), 29 with Marathi names from Wikidata.
- Marathi village names: only 3 verifiable (no reliable open source has more). NOT transliterated.
- Service area: backend rejects ride when pickup/drop > 30 km from Ambajogai (400); customer home shows friendly alert and disables Confirm.
