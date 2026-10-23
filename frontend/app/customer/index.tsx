import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Image,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme";
import { MapMarker } from "@/src/components/MockMap";
import { RideMap } from "@/src/components/RideMap";
import { PlaceSearchModal, Place } from "@/src/components/PlaceSearchModal";
import { SERVICE_CENTER, SERVICE_RADIUS_KM, distanceKm, isInServiceArea } from "@/src/maps";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function CustomerHome() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [captains, setCaptains] = useState<any[]>([]);
  const [pickup, setPickup] = useState<Place>(SERVICE_CENTER);
  const [drop, setDrop] = useState<Place | null>(null);
  const [searchTarget, setSearchTarget] = useState<"pickup" | "drop" | null>(null);
  const [shortcuts, setShortcuts] = useState<Place[]>([]);
  const [route, setRoute] = useState<{ distance_km: number; duration_min: number; polyline: string | null; source: string } | null>(null);
  const [routeError, setRouteError] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [service, setService] = useState<"ZipBike" | "ZipDelivery">("ZipBike");
  const [fareBike, setFareBike] = useState<{ fare: number; eta_min: number } | null>(null);
  const [fareDel, setFareDel] = useState<{ fare: number; eta_min: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [showAddFav, setShowAddFav] = useState(false);
  const [favLabel, setFavLabel] = useState("");
  const [savingFav, setSavingFav] = useState(false);

  const loadFavorites = useCallback(async () => {
    try {
      const res = await api.listFavorites();
      setFavorites(res.favorites || []);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [loadFavorites]),
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await api.nearbyCaptains(pickup.lat, pickup.lng);
        setCaptains(res.captains);
      } catch {}
    })();
  }, [pickup]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.searchPlaces("");
        setShortcuts(
          (res.local || [])
            .filter((p: any) => p.type !== "town")
            .slice(0, 4)
            .map((p: any) => ({ name: p.name, address: `${p.name}, ${p.district}`, lat: p.lat, lng: p.lng })),
        );
      } catch {}
    })();
  }, []);

  useEffect(() => {
    setRoute(null);
    setRouteError(false);
    setFareBike(null);
    setFareDel(null);
    if (!drop) return;
    (async () => {
      try {
        const r = await api.computeRoute(pickup, drop);
        setRoute(r);
        const [b, d] = await Promise.all([
          api.fareEstimate(r.distance_km, "ZipBike"),
          api.fareEstimate(r.distance_km, "ZipDelivery"),
        ]);
        setFareBike({ ...b, eta_min: r.duration_min });
        setFareDel({ ...d, eta_min: r.duration_min });
      } catch {
        setRouteError(true);
      }
    })();
  }, [drop, pickup]);

  const markers: MapMarker[] = useMemo(() => {
    const arr: MapMarker[] = [
      { id: "user", x: 0.5, y: 0.5, kind: "user", label: "You" },
    ];
    // spread captain markers
    captains.slice(0, 5).forEach((c, i) => {
      const positions = [
        { x: 0.25, y: 0.3 },
        { x: 0.75, y: 0.35 },
        { x: 0.3, y: 0.7 },
        { x: 0.72, y: 0.68 },
        { x: 0.55, y: 0.25 },
      ];
      arr.push({
        id: c.id,
        x: positions[i].x,
        y: positions[i].y,
        kind: "captain",
      });
    });
    if (drop) arr.push({ id: "drop", x: 0.82, y: 0.18, kind: "drop", label: "Drop" });
    return arr;
  }, [captains, drop]);

  const outsideArea = [
    !isInServiceArea(pickup) && `Pickup is ${Math.round(distanceKm(SERVICE_CENTER, pickup))} km from Ambajogai`,
    drop && !isInServiceArea(drop) && `Drop is ${Math.round(distanceKm(SERVICE_CENTER, drop))} km from Ambajogai`,
  ].filter(Boolean) as string[];

  const confirmRide = async () => {
    if (!drop || !fareBike || outsideArea.length) return;
    setCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const fare = service === "ZipBike" ? fareBike.fare : fareDel?.fare || fareBike.fare;
      const res = await api.createRide({
        pickup_address: pickup.address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        drop_address: drop.address,
        drop_lat: drop.lat,
        drop_lng: drop.lng,
        service_type: service,
        distance_km: route?.distance_km || 1,
        fare,
      });
      router.push({ pathname: "/customer/searching", params: { rideId: res.ride.id } });
    } catch (e) {
      console.log("create ride error", e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Full-bleed Map */}
      <RideMap
        pickup={pickup}
        drop={drop}
        polyline={route?.polyline}
        style={StyleSheet.absoluteFillObject}
        mock={{ markers }}
      />

      {/* Top glass header */}
      <SafeAreaView edges={["top"]} style={styles.topSafe} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.iconBtn}
            testID="menu-btn"
            onPress={() => setShowMenu(true)}
          >
            <Ionicons name="menu" size={22} color="#111" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.locChip} onPress={() => setSearchTarget("pickup")} testID="pickup-chip">
            <View style={styles.dotGreen} />
            <Text style={styles.locChipText} numberOfLines={1}>
              {pickup.name}
            </Text>
            <Ionicons name="chevron-down" size={16} color="#111" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            testID="history-btn"
            onPress={() => router.push("/customer/history")}
          >
            <Ionicons name="time-outline" size={22} color="#111" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Bottom sheet */}
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        {outsideArea.length > 0 && (
          <View style={styles.areaAlert} testID="service-area-alert">
            <Ionicons name="map-outline" size={20} color={theme.colors.onSurface} />
            <View style={{ flex: 1 }}>
              <Text style={styles.areaAlertTitle}>We&apos;re not there yet 🙏</Text>
              <Text style={styles.areaAlertText}>
                ZipRides currently serves {SERVICE_RADIUS_KM} km around Ambajogai. {outsideArea.join(" · ")}. Please choose a nearer location.
              </Text>
            </View>
          </View>
        )}
        {!drop ? (
          <>
            <Text style={styles.greeting}>Hi {user?.name || "there"} 👋</Text>
            <Text style={styles.title}>Where are you headed?</Text>
            <TouchableOpacity
              testID="destination-search-btn"
              style={styles.searchBox}
              onPress={() => setSearchTarget("drop")}
              activeOpacity={0.9}
            >
              <Ionicons name="search" size={20} color="#111" />
              <Text style={styles.searchPh}>Search destination…</Text>
            </TouchableOpacity>

            {/* Favorites - one-tap booking */}
            <View style={styles.sectionRow}>
              <Text style={styles.section}>Favorites</Text>
              {favorites.length > 0 && (
                <TouchableOpacity onPress={() => setShowAddFav(true)} testID="add-fav-inline">
                  <Text style={styles.sectionAction}>+ Add</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 20 }}
            >
              {favorites.length === 0 ? (
                <TouchableOpacity
                  style={styles.favEmpty}
                  onPress={() => setShowAddFav(true)}
                  testID="add-favorite-btn"
                >
                  <View style={styles.favEmptyIcon}>
                    <Ionicons name="add" size={22} color="#111" />
                  </View>
                  <Text style={styles.favEmptyText}>Add favorite</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {favorites.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={styles.favCard}
                      onPress={() => setDrop({ name: f.label, address: f.address, lat: f.lat, lng: f.lng })}
                      testID={`fav-${f.id}`}
                    >
                      <View style={styles.favIcon}>
                        <Ionicons
                          name={
                            f.label.toLowerCase() === "home"
                              ? "home"
                              : f.label.toLowerCase() === "work"
                              ? "briefcase"
                              : "star"
                          }
                          size={16}
                          color="#111"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.favLabel} numberOfLines={1}>{f.label}</Text>
                        <Text style={styles.favAddr} numberOfLines={1}>{f.address}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>

            <Text style={styles.section}>Quick shortcuts</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 20 }}
            >
              {shortcuts.map((p) => (
                <TouchableOpacity
                  key={p.name}
                  style={styles.chip}
                  onPress={() => setDrop(p)}
                  testID={`quick-dest-${p.name}`}
                >
                  <Ionicons name="location" size={14} color="#111" />
                  <Text style={styles.chipText}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        ) : (
          <>
            {/* Route summary */}
            <View style={styles.routeCard}>
              <TouchableOpacity style={styles.routeRow} onPress={() => setSearchTarget("pickup")} testID="change-pickup">
                <View style={styles.dotGreen} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {pickup.address}
                </Text>
                <Ionicons name="pencil" size={14} color="#777" />
              </TouchableOpacity>
              <View style={styles.routeDivider} />
              <View style={styles.routeRow}>
                <View style={styles.dotRed} />
                <Text style={styles.routeText} numberOfLines={1}>
                  {drop.address}
                </Text>
                <TouchableOpacity onPress={() => setDrop(null)}>
                  <Ionicons name="close-circle" size={20} color="#777" />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.routeMeta} testID="route-meta">
              {routeError
                ? "Couldn't calculate route. Check connection and try again."
                : route
                ? `${route.distance_km} km · ~${route.duration_min} min${route.source === "estimate" ? " (approx.)" : " by road"}`
                : "Calculating distance…"}
            </Text>

            {/* Save as favorite (only if not already saved) */}
            {!favorites.some((f) => f.address === drop.address) && (
              <TouchableOpacity
                style={styles.saveFavRow}
                onPress={() => {
                  setFavLabel("");
                  setShowAddFav(true);
                }}
                testID="save-as-fav-btn"
              >
                <Ionicons name="star-outline" size={16} color="#111" />
                <Text style={styles.saveFavText}>Save this destination as favorite</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.section}>Choose your ride</Text>

            {/* Service selector */}
            <View style={styles.serviceRow}>
              <ServiceCard
                selected={service === "ZipBike"}
                onPress={() => setService("ZipBike")}
                title="ZipBike"
                subtitle="Fastest, single rider"
                fare={fareBike?.fare}
                eta={fareBike?.eta_min}
                icon={<MaterialCommunityIcons name="motorbike" size={30} color="#111" />}
                testID="service-bike"
              />
              <ServiceCard
                selected={service === "ZipDelivery"}
                onPress={() => setService("ZipDelivery")}
                title="ZipDelivery"
                subtitle="Parcels & packages"
                fare={fareDel?.fare}
                eta={fareDel?.eta_min}
                icon={<MaterialCommunityIcons name="package-variant" size={30} color="#111" />}
                testID="service-delivery"
              />
            </View>

            <Button
              testID="confirm-ride-btn"
              label={`Confirm ${service} · ₹${service === "ZipBike" ? fareBike?.fare ?? "…" : fareDel?.fare ?? "…"}`}
              onPress={confirmRide}
              loading={creating}
              disabled={!fareBike || outsideArea.length > 0}
            />
          </>
        )}
      </View>

      {/* Search Modal (pickup or destination) */}
      <PlaceSearchModal
        visible={searchTarget !== null}
        target={searchTarget || "drop"}
        onClose={() => setSearchTarget(null)}
        onSelect={(p) => {
          if (searchTarget === "pickup") setPickup(p);
          else setDrop(p);
          setSearchTarget(null);
        }}
      />

      {/* Menu Modal */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <SafeAreaView edges={["top"]} style={styles.menuSheet}>
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={26} color="#fff" />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.userName}>{user?.name || "Rider"}</Text>
                <Text style={styles.userPhone}>+91 {user?.phone}</Text>
              </View>
            </View>
            <View style={styles.walletCard}>
              <Text style={styles.walletLabel}>ZipRides Wallet</Text>
              <Text style={styles.walletAmt}>₹{user?.wallet_balance?.toFixed(0) || "0"}</Text>
            </View>
            <MenuItem
              icon={<Ionicons name="time" size={20} color="#111" />}
              label="Ride History"
              onPress={() => {
                setShowMenu(false);
                router.push("/customer/history");
              }}
              testID="menu-history"
            />
            <MenuItem
              icon={<MaterialCommunityIcons name="gift" size={20} color="#111" />}
              label="Refer & Earn"
              onPress={() => {
                setShowMenu(false);
                router.push("/customer/refer");
              }}
              testID="menu-refer"
            />
            <MenuItem
              icon={<Ionicons name="log-out" size={20} color="#111" />}
              label="Log out"
              onPress={async () => {
                setShowMenu(false);
                await logout();
                router.replace("/role-select");
              }}
              testID="menu-logout"
            />
          </SafeAreaView>
        </TouchableOpacity>
      </Modal>

      {/* Add Favorite Modal */}
      <Modal visible={showAddFav} transparent animationType="fade" onRequestClose={() => setShowAddFav(false)}>
        <View style={styles.favModalBackdrop}>
          <View style={styles.favModalCard}>
            <View style={styles.favModalIcon}>
              <Ionicons name="star" size={22} color="#111" />
            </View>
            <Text style={styles.favModalTitle}>Save as favorite</Text>
            <Text style={styles.favModalSub}>
              {drop ? drop.address : "Choose a destination first"}
            </Text>
            <TextInput
              value={favLabel}
              onChangeText={setFavLabel}
              placeholder="Label (Home, Work, Gym…)"
              placeholderTextColor="#999"
              style={styles.favInput}
              autoFocus
              testID="fav-label-input"
            />
            <View style={styles.presetRow}>
              {["Home", "Work", "Gym", "College"].map((p) => (
                <TouchableOpacity
                  key={p}
                  style={styles.presetChip}
                  onPress={() => setFavLabel(p)}
                  testID={`fav-preset-${p}`}
                >
                  <Text style={styles.presetChipText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.favModalActions}>
              <TouchableOpacity
                style={styles.favCancelBtn}
                onPress={() => setShowAddFav(false)}
                testID="fav-cancel"
              >
                <Text style={styles.favCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Button
                label={savingFav ? "Saving…" : "Save"}
                onPress={async () => {
                  if (!favLabel.trim() || !drop) return;
                  setSavingFav(true);
                  try {
                    await api.addFavorite({
                      label: favLabel.trim(),
                      address: drop.address,
                      lat: drop.lat,
                      lng: drop.lng,
                    });
                    await loadFavorites();
                    setShowAddFav(false);
                    setFavLabel("");
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                  } catch {}
                  setSavingFav(false);
                }}
                loading={savingFav}
                disabled={!favLabel.trim() || !drop}
                style={{ flex: 1, height: 48 }}
                testID="fav-save"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ServiceCard: React.FC<{
  selected: boolean;
  onPress: () => void;
  title: string;
  subtitle: string;
  fare?: number;
  eta?: number;
  icon: React.ReactNode;
  testID: string;
}> = ({ selected, onPress, title, subtitle, fare, eta, icon, testID }) => (
  <TouchableOpacity
    testID={testID}
    style={[styles.svcCard, selected && styles.svcCardSelected]}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <View style={styles.svcIconBox}>{icon}</View>
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.svcTitle}>{title}</Text>
        <Text style={styles.svcSub}>{subtitle}</Text>
      </View>
    </View>
    <View style={styles.svcFooter}>
      <Text style={styles.svcFare}>{fare != null ? `₹${fare}` : "—"}</Text>
      <View style={styles.etaChip}>
        <Ionicons name="time-outline" size={11} color="#111" />
        <Text style={styles.etaText}>{eta != null ? `${eta} min` : "—"}</Text>
      </View>
    </View>
  </TouchableOpacity>
);

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onPress: () => void; testID: string }> = ({
  icon,
  label,
  onPress,
  testID,
}) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} testID={testID}>
    {icon}
    <Text style={styles.menuItemText}>{label}</Text>
    <Ionicons name="chevron-forward" size={18} color="#777" style={{ marginLeft: "auto" }} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  topSafe: { position: "absolute", top: 0, left: 0, right: 0 },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadow.fab,
  },
  locChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 44,
    ...theme.shadow.card,
  },
  locChipText: { fontSize: 14, fontWeight: "700", color: "#111", flex: 1 },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.success },
  dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.error },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 34,
    ...theme.shadow.fab,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceTertiary,
    alignSelf: "center",
    marginBottom: 12,
  },
  greeting: { fontSize: 13, color: theme.colors.onSurfaceSecondary },
  title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.5, marginTop: 2 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 54,
    marginTop: 16,
  },
  searchPh: { fontSize: 15, color: theme.colors.onSurfaceSecondary, fontWeight: "500" },
  section: { fontSize: 12, fontWeight: "700", color: "#777", marginTop: 20, marginBottom: 10, letterSpacing: 0.5, textTransform: "uppercase" },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 10 },
  sectionAction: { fontSize: 12, fontWeight: "700", color: theme.colors.brandPrimary },
  favEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  favEmptyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  favEmptyText: { fontSize: 13, fontWeight: "700", color: "#111" },
  favCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.brandTertiary,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 180,
    maxWidth: 240,
  },
  favIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  favLabel: { fontSize: 13, fontWeight: "800", color: "#111" },
  favAddr: { fontSize: 11, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  saveFavRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
  },
  saveFavText: { fontSize: 12, fontWeight: "700", color: "#111" },
  // Add favorite modal
  favModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  favModalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
  },
  favModalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  favModalTitle: { fontSize: 20, fontWeight: "800", color: "#111" },
  favModalSub: { fontSize: 13, color: theme.colors.onSurfaceSecondary, textAlign: "center", marginTop: 6 },
  favInput: {
    alignSelf: "stretch",
    marginTop: 16,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
  },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12, alignSelf: "stretch" },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  presetChipText: { fontSize: 12, fontWeight: "700", color: "#111" },
  favModalActions: { flexDirection: "row", gap: 10, marginTop: 20, alignSelf: "stretch" },
  favCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  favCancelText: { fontSize: 15, fontWeight: "700", color: "#111" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontSize: 13, fontWeight: "600", color: "#111" },
  routeCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    marginTop: 4,
  },
  routeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  routeText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#111" },
  areaAlert: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: theme.colors.accent,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  areaAlertTitle: { fontSize: 14, fontWeight: "800", color: theme.colors.onSurface },
  areaAlertText: { fontSize: 12, fontWeight: "600", color: theme.colors.onSurface, marginTop: 2, lineHeight: 17 },
  routeMeta: { fontSize: 12, fontWeight: "700", color: theme.colors.onSurfaceSecondary, marginTop: 8 },
  routeDivider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 8, marginLeft: 20 },
  serviceRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  svcCard: {
    flex: 1,
    borderRadius: theme.radius.md,
    padding: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: "#fff",
  },
  svcCardSelected: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandTertiary,
  },
  svcIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  svcTitle: { fontSize: 15, fontWeight: "800", color: "#111" },
  svcSub: { fontSize: 11, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  svcFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  svcFare: { fontSize: 18, fontWeight: "800", color: "#111" },
  etaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  etaText: { fontSize: 11, fontWeight: "700", color: "#111" },
  // Modal
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    height: 52,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#111" },
  searchBoxModal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.surfaceSecondary,
    marginHorizontal: 16,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 54,
    marginBottom: 12,
  },
  modalInput: { flex: 1, fontSize: 15, color: "#111", fontWeight: "600" },
  destRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 12,
  },
  destIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  destTitle: { fontSize: 15, fontWeight: "700", color: "#111" },
  destSub: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  destDist: { fontSize: 13, fontWeight: "700", color: theme.colors.onSurfaceSecondary },
  // Menu
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  menuSheet: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: "82%",
    backgroundColor: "#fff",
    padding: 20,
  },
  userRow: { flexDirection: "row", alignItems: "center", marginTop: 10 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: { fontSize: 17, fontWeight: "800", color: "#111" },
  userPhone: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  walletCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: theme.colors.brandPrimary,
  },
  walletLabel: { color: "#BBB", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  walletAmt: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 4 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  menuItemText: { fontSize: 15, fontWeight: "700", color: "#111" },
});
