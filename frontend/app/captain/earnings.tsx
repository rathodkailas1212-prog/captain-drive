import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { api } from "@/src/api";

export default function Earnings() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const res = await api.earnings();
      setData(res);
    } catch {}
    setRefreshing(false);
  };
  useEffect(() => {
    load();
  }, []);

  const maxWeek = Math.max(...(data?.weekly?.map((w: any) => w.earnings) || [1]), 1);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Earnings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#fff" />}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroLbl}>Today&apos;s Earnings</Text>
          <Text style={styles.heroValue}>₹{data?.today_earnings?.toFixed(2) || "0.00"}</Text>
          <Text style={styles.heroRides}>{data?.today_rides || 0} completed rides</Text>
        </View>

        <View style={styles.metricsGrid}>
          <MetricCard label="This Week" value={`₹${data?.week_earnings?.toFixed(0) || 0}`} icon="calendar" />
          <MetricCard label="Cash in Hand" value={`₹${data?.cash_in_hand?.toFixed(0) || 0}`} icon="cash" />
          <MetricCard label="Lifetime" value={`₹${data?.total_earnings?.toFixed(0) || 0}`} icon="trophy" />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Weekly payout</Text>
            <Text style={styles.sectionSub}>Last 7 days</Text>
          </View>
          <View style={styles.chart}>
            {(data?.weekly || []).length === 0 ? (
              <View style={styles.emptyChart}>
                <MaterialCommunityIcons name="chart-line" size={40} color="#CCC" />
                <Text style={styles.emptyChartText}>Complete rides to see your weekly trend</Text>
              </View>
            ) : (
              <View style={styles.chartInner}>
                {data.weekly.map((w: any) => (
                  <View key={w.date} style={styles.barCol}>
                    <View style={{ flex: 1, justifyContent: "flex-end", width: "100%", alignItems: "center" }}>
                      <View
                        style={[
                          styles.bar,
                          { height: `${(w.earnings / maxWeek) * 100}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{w.date.slice(5)}</Text>
                    <Text style={styles.barValue}>₹{w.earnings}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        <View style={styles.tips}>
          <Ionicons name="bulb" size={20} color={theme.colors.accent} />
          <Text style={styles.tipsText}>
            Complete 5 rides between 6-10 PM to unlock a ₹50 bonus. Tap-to-earn missions coming soon.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const MetricCard: React.FC<{ label: string; value: string; icon: any }> = ({ label, value, icon }) => (
  <View style={styles.mcard}>
    <View style={styles.mcardIcon}>
      <Ionicons name={icon} size={16} color="#F5C518" />
    </View>
    <Text style={styles.mcardLbl}>{label}</Text>
    <Text style={styles.mcardVal}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.brandPrimary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 52,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#fff" },
  heroCard: {
    marginHorizontal: 16,
    padding: 24,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    marginTop: 10,
  },
  heroLbl: { color: "#BBB", fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  heroValue: { color: "#fff", fontSize: 48, fontWeight: "800", letterSpacing: -1.5, marginTop: 4 },
  heroRides: { color: "#F5C518", fontSize: 13, fontWeight: "700", marginTop: 4 },
  metricsGrid: { flexDirection: "row", marginTop: 16, paddingHorizontal: 16, gap: 8 },
  mcard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  mcardIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(245,197,24,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  mcardLbl: { color: "#BBB", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  mcardVal: { color: "#fff", fontSize: 16, fontWeight: "800", marginTop: 2 },
  section: {
    marginTop: 24,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
  },
  sectionHead: { marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111" },
  sectionSub: { fontSize: 11, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  chart: { height: 180 },
  emptyChart: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyChartText: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 8, textAlign: "center" },
  chartInner: { flex: 1, flexDirection: "row", justifyContent: "space-between", gap: 6 },
  barCol: { flex: 1, alignItems: "center" },
  bar: {
    width: 22,
    backgroundColor: theme.colors.brandPrimary,
    borderRadius: 4,
  },
  barLabel: { fontSize: 10, fontWeight: "700", color: theme.colors.onSurfaceSecondary, marginTop: 4 },
  barValue: { fontSize: 10, fontWeight: "800", color: "#111" },
  tips: {
    marginTop: 20,
    marginHorizontal: 16,
    flexDirection: "row",
    gap: 10,
    padding: 14,
    backgroundColor: "rgba(245,197,24,0.15)",
    borderRadius: 12,
  },
  tipsText: { fontSize: 12, color: "#fff", flex: 1, lineHeight: 18 },
});
