import { Alert, Linking, Platform } from "react-native";
import * as Location from "expo-location";

export type LatLng = { lat: number; lng: number };

// Flip to "true" in frontend/.env once the Android/iOS Google Maps keys are in app.json
export const GOOGLE_MAPS_ENABLED =
  Platform.OS !== "web" && process.env.EXPO_PUBLIC_GOOGLE_MAPS_ENABLED === "true";

export const SERVICE_CENTER: LatLng & { name: string; address: string } = {
  name: "Ambajogai",
  address: "Ambajogai, Beed, Maharashtra",
  lat: 18.73312,
  lng: 76.38616,
};

export const SERVICE_RADIUS_KM = 30;

export function distanceKm(a: LatLng, b: LatLng): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const isInServiceArea = (p: LatLng) => distanceKm(SERVICE_CENTER, p) <= SERVICE_RADIUS_KM;

// Google encoded polyline -> coordinates
export function decodePolyline(encoded: string): LatLng[] {
  const pts: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    for (const which of [0, 1]) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}

export function openNavigation(dest: LatLng) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;
  Linking.openURL(url).catch(() => Alert.alert("Unable to open Google Maps"));
}

function confirmAsync(title: string, message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(true);
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: "Not now", style: "cancel", onPress: () => resolve(false) },
      { text: "Continue", onPress: () => resolve(true) },
    ]),
  );
}

function showOpenSettings(fallbackMsg: string) {
  if (Platform.OS === "web") return;
  Alert.alert("Location is turned off", fallbackMsg, [
    { text: "OK", style: "cancel" },
    { text: "Open Settings", onPress: () => Linking.openSettings() },
  ]);
}

/** Permission contract: check -> explain -> request -> handle denied / blocked. */
export async function ensureLocationPermission(reason: string, fallbackMsg: string): Promise<boolean> {
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.granted) return true;
    if (!perm.canAskAgain) {
      showOpenSettings(fallbackMsg);
      return false;
    }
    const ok = await confirmAsync("Use your location", reason);
    if (!ok) return false;
    perm = await Location.requestForegroundPermissionsAsync();
    if (perm.granted) return true;
    if (!perm.canAskAgain) showOpenSettings(fallbackMsg);
    else if (Platform.OS !== "web") Alert.alert("Location not shared", fallbackMsg);
    return false;
  } catch {
    return false;
  }
}

export async function getCurrentPlace(): Promise<(LatLng & { name: string; address: string }) | null> {
  const ok = await ensureLocationPermission(
    "ZipRides uses your location to set your pickup point.",
    "No problem — you can type your pickup address or choose your village instead.",
  );
  if (!ok) return null;
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude: lat, longitude: lng } = pos.coords;
    let address = `Current location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    if (Platform.OS !== "web") {
      try {
        const [g] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (g) address = [g.name, g.district || g.subregion, g.city].filter(Boolean).join(", ") || address;
      } catch {}
    }
    return { name: "Current location", address, lat, lng };
  } catch {
    if (Platform.OS !== "web") Alert.alert("Couldn't get location", "Please type your pickup address instead.");
    return null;
  }
}
