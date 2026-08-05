import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { api } from "@/src/api";

export default function History() {
  const router = useRouter();
  const [rides, setRides] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const res = await api.history();
      setRides(res.rides);
    } catch {}
    setRefreshing(false);
  };
  useEffect(() => {
    load();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride History</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      >
        {rides.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="map-clock-outline" size={64} color="#CCC" />
            <Text style={styles.emptyTitle}>No rides yet</Text>
            <Text style={styles.emptyBody}>Your ride history will show up here after your first trip.</Text>
          </View>
        ) : (
          rides.map((r) => (
            <View key={r.id} style={styles.rideCard} testID={`ride-history-${r.id}`}>
              <View style={styles.rideHead}>
                <View style={styles.svcTag}>
                  <MaterialCommunityIcons
                    name={r.service_type === "ZipDelivery" ? "package-variant" : "motorbike"}
                    size={14}
                    color="#111"
                  />
                  <Text style={styles.svcTagText}>{r.service_type}</Text>
                </View>
                <Text style={styles.rideDate}>{new Date(r.created_at).toLocaleDateString()}</Text>
              </View>
              <View style={styles.routeMini}>
                <View style={styles.dotG} />
                <Text style={styles.routeMiniText} numberOfLines={1}>{r.pickup_address}</Text>
              </View>
              <View style={styles.routeMini}>
                <View style={styles.dotR} />
                <Text style={styles.routeMiniText} numberOfLines={1}>{r.drop_address}</Text>
              </View>
              <View style={styles.rideFoot}>
                <Text style={styles.rideStatus}>
                  {r.status === "completed" ? "Completed" : r.status.replace(/_/g, " ")}
                </Text>
                <Text style={styles.rideFare}>₹{r.fare}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#111" },
  empty: { alignItems: "center", marginTop: 100 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#111", marginTop: 16 },
  emptyBody: { fontSize: 13, color: theme.colors.onSurfaceSecondary, textAlign: "center", marginTop: 6, paddingHorizontal: 32 },
  rideCard: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  rideHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  svcTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  svcTagText: { fontSize: 11, fontWeight: "700", color: "#111" },
  rideDate: { fontSize: 12, color: theme.colors.onSurfaceSecondary },
  routeMini: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  dotG: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success },
  dotR: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.error },
  routeMiniText: { fontSize: 13, color: "#111", flex: 1, fontWeight: "600" },
  rideFoot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  rideStatus: { fontSize: 12, fontWeight: "700", color: theme.colors.onSurfaceSecondary, textTransform: "capitalize" },
  rideFare: { fontSize: 17, fontWeight: "800", color: "#111" },
});
