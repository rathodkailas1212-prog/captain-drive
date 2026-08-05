# ZipRide - Product Requirements Document

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
