import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme";
import { MockMap, MapMarker } from "@/src/components/MockMap";
import { api } from "@/src/api";

type Stage = "to_pickup" | "at_pickup" | "in_ride" | "completed";

export default function ActiveRide() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [stage, setStage] = useState<Stage>("to_pickup");
  const [progress, setProgress] = useState(0);
  const [ride, setRide] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!rideId || rideId.startsWith("demo")) {
        setRide({
          id: rideId,
          pickup_address: "MG Road Metro Station",
          drop_address: "Indiranagar 100ft Road",
          distance_km: 4.2,
          fare: 60,
          customer_name: "Priya S.",
          customer_phone: "+919812345678",
          otp: "4271",
          service_type: "ZipBike",
        });
        return;
      }
      try {
        const res = await api.getRide(rideId);
        setRide(res.ride);
      } catch {}
    })();
  }, [rideId]);

  // slow progress simulation
  useEffect(() => {
    if (stage === "at_pickup" || stage === "completed") return;
    const t = setInterval(() => {
      setProgress((p) => {
        const n = Math.min(1, p + 0.02);
        return n;
      });
    }, 300);
    return () => clearInterval(t);
  }, [stage]);

  const nextStage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    if (stage === "to_pickup") {
      setStage("at_pickup");
      setProgress(0);
      try {
        if (rideId && !rideId.startsWith("demo")) await api.updateRideStatus(rideId, "reached_pickup");
      } catch {}
    } else if (stage === "at_pickup") {
      setStage("in_ride");
      setProgress(0);
      try {
        if (rideId && !rideId.startsWith("demo")) await api.updateRideStatus(rideId, "started");
      } catch {}
    } else if (stage === "in_ride") {
      try {
        if (rideId && !rideId.startsWith("demo")) await api.updateRideStatus(rideId, "completed");
      } catch {}
      setStage("completed");
    }
  };

  const finish = () => {
    router.replace("/captain");
  };

  const captainPos: MapMarker =
    stage === "to_pickup"
      ? { id: "cap", x: 0.2 + progress * 0.3, y: 0.7 - progress * 0.2, kind: "captain" }
      : stage === "at_pickup"
      ? { id: "cap", x: 0.5, y: 0.5, kind: "captain" }
      : { id: "cap", x: 0.5 + progress * 0.3, y: 0.5 - progress * 0.3, kind: "captain" };

  const targetMarker: MapMarker =
    stage === "to_pickup" || stage === "at_pickup"
      ? { id: "pk", x: 0.5, y: 0.5, kind: "pickup", label: "Pickup" }
      : { id: "dr", x: 0.82, y: 0.18, kind: "drop", label: "Drop" };

  const stageInfo = {
    to_pickup: { instr: "Head to pickup point", cta: "I've reached pickup", eta: `${Math.max(1, Math.round((1 - progress) * 6))} min · 1.2 km` },
    at_pickup: { instr: `Verify OTP from customer`, cta: "Start Ride", eta: `Pickup: ${ride?.pickup_address ?? ""}` },
    in_ride: { instr: "Take customer to drop location", cta: "Complete Ride", eta: `${Math.max(1, Math.round((1 - progress) * 12))} min · ${ride?.distance_km ?? 0} km` },
    completed: { instr: "Ride Complete", cta: "Back to Home", eta: `You earned ₹${ride?.fare ?? 0}` },
  }[stage];

  if (!ride) return null;

  return (
    <View style={styles.container}>
      <MockMap
        style={StyleSheet.absoluteFillObject}
        markers={[captainPos, targetMarker]}
        showRoute
        routeFrom={{ x: captainPos.x, y: captainPos.y }}
        routeTo={{ x: targetMarker.x, y: targetMarker.y }}
      />

      <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <View style={styles.turnBanner}>
          <View style={styles.turnIcon}>
            <Ionicons name="arrow-forward" size={20} color="#F5C518" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.turnMain}>{stageInfo.instr}</Text>
            <Text style={styles.turnSub}>{stageInfo.eta}</Text>
          </View>
          <TouchableOpacity onPress={() => router.replace("/captain")} testID="close-active-ride">
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.custRow}>
          <View style={styles.custAvatar}>
            <Ionicons name="person" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.custName}>{ride.customer_name}</Text>
            <Text style={styles.custPh}>{ride.customer_phone || "+91 98****78"}</Text>
          </View>
          <TouchableOpacity style={styles.callBtn}>
            <Ionicons name="call" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {stage === "at_pickup" && (
          <View style={styles.otpBox}>
            <Text style={styles.otpLabel}>Ask customer for OTP</Text>
            <Text style={styles.otpValue}>{ride.otp}</Text>
          </View>
        )}

        <View style={styles.tripMeta}>
          <View style={{ flex: 1 }}>
            <Text style={styles.metaLbl}>{stage === "to_pickup" ? "PICKUP" : "DROP"}</Text>
            <Text style={styles.metaVal} numberOfLines={2}>
              {stage === "to_pickup" ? ride.pickup_address : ride.drop_address}
            </Text>
          </View>
          <View>
            <Text style={styles.metaLbl}>FARE</Text>
            <Text style={styles.metaVal}>₹{ride.fare}</Text>
          </View>
        </View>

        {stage !== "completed" ? (
          <TouchableOpacity style={styles.ctaBtn} onPress={nextStage} testID="next-stage-btn">
            <Text style={styles.ctaText}>{stageInfo.cta}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: theme.colors.success }]} onPress={finish} testID="complete-ride-btn">
            <Text style={styles.ctaText}>{stageInfo.cta}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  turnBanner: {
    marginHorizontal: 14,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.colors.brandPrimary,
    borderRadius: 16,
    padding: 12,
    ...theme.shadow.fab,
  },
  turnIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(245,197,24,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  turnMain: { fontSize: 14, fontWeight: "800", color: "#fff" },
  turnSub: { fontSize: 12, color: "#BBB", marginTop: 2 },
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
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceTertiary,
    alignSelf: "center",
    marginBottom: 14,
  },
  custRow: { flexDirection: "row", alignItems: "center" },
  custAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  custName: { fontSize: 16, fontWeight: "800", color: "#111" },
  custPh: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  callBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBox: {
    marginTop: 14,
    backgroundColor: theme.colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  otpLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, color: "#111" },
  otpValue: { fontSize: 28, fontWeight: "800", color: "#111", letterSpacing: 6, marginTop: 4 },
  tripMeta: { flexDirection: "row", marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: theme.colors.border, gap: 20 },
  metaLbl: { fontSize: 10, fontWeight: "700", color: theme.colors.onSurfaceSecondary, letterSpacing: 0.5 },
  metaVal: { fontSize: 14, fontWeight: "800", color: "#111", marginTop: 2, maxWidth: 220 },
  ctaBtn: {
    marginTop: 20,
    height: 60,
    borderRadius: 14,
    backgroundColor: theme.colors.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
