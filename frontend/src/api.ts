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

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

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
  updateProfile: (data: any) => request<{ user: any }>("/users/profile", "PUT", data),

  // fare
  fareEstimate: (distance_km: number, service_type: "ZipBike" | "ZipDelivery") =>
    request<{ fare: number; eta_min: number; distance_km: number }>(
      "/fare/estimate",
      "POST",
      { distance_km, service_type },
    ),

  // captains
  nearbyCaptains: (lat: number, lng: number) =>
    request<{ captains: any[] }>(`/captains/nearby?lat=${lat}&lng=${lng}`),

  // rides
  createRide: (data: any) => request<{ ride: any }>("/rides", "POST", data),
  getRide: (id: string) => request<{ ride: any }>(`/rides/${id}`),
  updateRideStatus: (id: string, status: string) =>
    request<{ ride: any }>(`/rides/${id}/status`, "PATCH", { status }),
  acceptRide: (id: string) => request<{ ride: any }>(`/rides/${id}/accept`, "POST"),
  rateRide: (id: string, rating: number, comment: string, payment_method: string) =>
    request(`/rides/${id}/rate`, "POST", { rating, comment, payment_method }),
  sos: (id: string, lat: number, lng: number, message?: string) =>
    request(`/rides/${id}/sos`, "POST", { lat, lng, message }),
  history: () => request<{ rides: any[] }>("/rides/history/list"),

  // captain
  toggleDuty: (online: boolean) =>
    request<{ user: any }>("/captain/duty", "POST", { online }),
  earnings: () => request<any>("/captain/earnings"),
  incoming: () => request<{ request: any }>("/captain/incoming"),
};

export { getToken };
