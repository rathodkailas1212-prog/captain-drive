import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const TOKEN_KEY = "zipride_token";

async function getToken() {
  return await storage.secureGet<string>(TOKEN_KEY, "");
}

export async function setToken(token: string) {
  await storage.secureSet<string>(TOKEN_KEY, token);
}

export async function clearToken() {
  await storage.secureRemove(TOKEN_KEY);
}

async function request<T = any>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: any,
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  // 15s network timeout so a stalled request can never hang the UI
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    if (e?.name === "AbortError") {
      throw new Error("Network timeout — please check your connection");
    }
    throw new Error(e?.message || "Network error");
  }
  clearTimeout(timer);

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.detail || data?.message || `Request failed (${res.status})`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data as T;
}

export const api = {
  // auth
  sendOtp: (phone: string, role: "customer" | "captain") =>
    request("/auth/send-otp", "POST", { phone, role }),
  verifyOtp: (phone: string, otp: string, role: "customer" | "captain") =>
    request<{ user: any; token: string }>("/auth/verify-otp", "POST", { phone, otp, role }),
  me: () => request<{ user: any }>("/auth/me"),
  logout: () => request("/auth/logout", "POST"),
  updateProfile: (data: any) => request<{ user: any }>("/users/profile", "PUT", data),

  // fare
  fareEstimate: (distance_km: number, service_type: "ZipBike" | "ZipDelivery") =>
    request<{ fare: number; eta_min: number; distance_km: number }>(
      "/fare/estimate",
      "POST",
      { distance_km, service_type },
    ),

  // maps / places
  mapsConfig: () => request<{ google_enabled: boolean; local_places_count: number }>("/maps/config"),
  searchPlaces: (q: string, session_token?: string, limit = 30) =>
    request<{ local: any[]; google: any[] }>(
      `/places/search?q=${encodeURIComponent(q)}&limit=${limit}${session_token ? `&session_token=${session_token}` : ""}`,
    ),
  placeDetails: (place_id: string, session_token?: string) =>
    request<{ name: string; address: string; lat: number; lng: number }>(
      `/places/details/${encodeURIComponent(place_id)}${session_token ? `?session_token=${session_token}` : ""}`,
    ),
  geocode: (q: string) =>
    request<{ result: { address: string; lat: number; lng: number } | null }>(`/places/geocode?q=${encodeURIComponent(q)}`),
  computeRoute: (o: { lat: number; lng: number }, d: { lat: number; lng: number }) =>
    request<{ distance_km: number; duration_min: number; polyline: string | null; source: string }>(
      "/routes/compute",
      "POST",
      { origin: o, destination: d },
    ),
  captainLocation: (lat: number, lng: number, ride_id?: string) =>
    request("/captain/location", "POST", { lat, lng, ride_id }),

  // captains
  nearbyCaptains: (lat: number, lng: number) =>
    request<{ captains: any[] }>(`/captains/nearby?lat=${lat}&lng=${lng}`),

  // rides
  createRide: (data: any) => request<{ ride: any }>("/rides", "POST", data),
  getRide: (id: string) => request<{ ride: any }>(`/rides/${id}`),
  updateRideStatus: (id: string, status: string) =>
    request<{ ride: any }>(`/rides/${id}/status`, "PATCH", { status }),
  acceptRide: (id: string) => request<{ ride: any }>(`/rides/${id}/accept`, "POST"),
  rateRide: (id: string, rating: number, comment: string, payment_method: string, tip: number = 0) =>
    request(`/rides/${id}/rate`, "POST", { rating, comment, payment_method, tip }),
  sos: (id: string, lat: number, lng: number, message?: string) =>
    request(`/rides/${id}/sos`, "POST", { lat, lng, message }),
  history: () => request<{ rides: any[] }>("/rides/history/list"),

  // captain
  toggleDuty: (online: boolean) =>
    request<{ user: any }>("/captain/duty", "POST", { online }),
  earnings: () => request<any>("/captain/earnings"),
  incoming: () => request<{ request: any }>("/captain/incoming"),

  // referrals
  applyReferral: (code: string) =>
    request<{ success: boolean; bonus: number; user: any }>("/referrals/apply", "POST", { code }),
  referralSummary: () =>
    request<{
      referral_code: string;
      referrals_count: number;
      credits_earned: number;
      bonus_per_referral: number;
      referrals: any[];
    }>("/referrals/summary"),

  // favorites
  listFavorites: () => request<{ favorites: any[] }>("/favorites"),
  addFavorite: (data: { label: string; address: string; lat: number; lng: number; icon?: string }) =>
    request<{ favorite: any }>("/favorites", "POST", data),
  removeFavorite: (id: string) => request(`/favorites/${id}`, "DELETE"),

  // admin
  adminDashboard: () => request<any>("/admin/dashboard"),
  adminFleet: () => request<{ captains: any[] }>("/admin/fleet"),
  adminUsers: (params: { role?: string; filter?: string; q?: string } = {}) => {
    const p = new URLSearchParams();
    if (params.role) p.set("role", params.role);
    if (params.filter) p.set("filter", params.filter);
    if (params.q) p.set("q", params.q);
    const qs = p.toString();
    return request<{ users: any[] }>(`/admin/users${qs ? `?${qs}` : ""}`);
  },
  adminBlockUser: (id: string, blocked: boolean, reason?: string) =>
    request<{ user: any }>(`/admin/users/${id}/block`, "POST", { blocked, reason }),
  adminKYC: (id: string, approved: boolean, reason?: string) =>
    request<{ user: any }>(`/admin/users/${id}/kyc`, "POST", { approved, reason }),
  adminGetFareConfig: () => request<{ fare_config: any }>("/admin/fare-config"),
  adminUpdateFareConfig: (data: {
    service_type: "ZipBike" | "ZipDelivery";
    base: number;
    per_km: number;
    min: number;
    commission_pct?: number;
  }) => request<{ fare_config: any }>("/admin/fare-config", "PUT", data),
  adminComplaints: () => request<{ complaints: any[] }>("/admin/complaints"),
  adminResolveComplaint: (id: string, resolution: string) =>
    request(`/admin/complaints/${id}/resolve`, "POST", { resolution }),
  adminRides: () => request<{ rides: any[] }>("/admin/rides"),
};

export { getToken };
