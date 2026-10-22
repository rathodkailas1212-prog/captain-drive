import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { MockMap } from "@/src/components/MockMap";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";

export default function Searching() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [tick, setTick] = useState(0);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    // Simulate matching in 4 seconds by auto-accepting the ride
    const t = setTimeout(async () => {
      try {
        await api.updateRideStatus(rideId!, "accepted");
        router.replace({ pathname: "/customer/tracking", params: { rideId } });
      } catch (e) {
        console.log(e);
      }
    }, 4200);
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [rideId, router]);

  const cancel = async () => {
    setCancelled(true);
    try {
      await api.updateRideStatus(rideId!, "cancelled");
    } catch {}
    router.replace("/customer");
  };

  return (
    <View style={styles.container}>
      <MockMap
        style={StyleSheet.absoluteFillObject}
        markers={[{ id: "u", x: 0.5, y: 0.5, kind: "user", label: "You" }]}
        showRadar
      />

      <SafeAreaView edges={["top"]} pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={cancel} testID="searching-back">
            <Ionicons name="close" size={22} color="#111" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.searchBox}>
          <View style={styles.spinDot} />
          <Text style={styles.searchTitle}>Finding your ZipRides captain…</Text>
          <Text style={styles.searchSub}>Hang tight — pinging captains near you {".".repeat((tick % 3) + 1)}</Text>
        </View>
        <View style={styles.metaRow}>
          <MetaBox label="Wait time" value={`${5 - Math.min(4, tick)}s`} />
          <MetaBox label="Radius" value="1.2 km" />
          <MetaBox label="Captains" value="6 online" />
        </View>
        <Button label="Cancel search" onPress={cancel} variant="secondary" testID="cancel-search-btn" />
      </View>
    </View>
  );
}

const MetaBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.metaBox}>
    <Text style={styles.metaLabel}>{label}</Text>
    <Text style={styles.metaValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  topBar: { flexDirection: "row", padding: 14 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadow.fab,
  },
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
    marginBottom: 16,
  },
  searchBox: { alignItems: "center", marginBottom: 20 },
  spinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.success,
    marginBottom: 12,
  },
  searchTitle: { fontSize: 20, fontWeight: "800", color: "#111", textAlign: "center" },
  searchSub: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 6, textAlign: "center" },
  metaRow: { flexDirection: "row", gap: 10, marginBottom: 18 },
  metaBox: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    padding: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  metaLabel: { fontSize: 10, color: theme.colors.onSurfaceSecondary, fontWeight: "700", letterSpacing: 0.5 },
  metaValue: { fontSize: 16, fontWeight: "800", color: "#111", marginTop: 4 },
});
