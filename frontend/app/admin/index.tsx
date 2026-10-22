import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, useWindowDimensions, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { api } from "@/src/api";

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const { width } = useWindowDimensions();
  const cols = width >= 900 ? 4 : 2;

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await api.adminDashboard();
      setData(res);
    } catch (e: any) {
      setErr(e.message || "Failed to load dashboard");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const maxWeek = Math.max(...(data?.weekly || []).map((w: any) => w.revenue), 1);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>Dashboard</Text>
          <Text style={styles.pageSub}>Live pulse of the ZipRides network</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={load} testID="dashboard-refresh">
          <Ionicons name="refresh" size={16} color="#111" />
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {err ? (
        <View style={styles.errBox}>
          <Ionicons name="warning" size={18} color={theme.colors.error} />
          <Text style={styles.errText}>{err}</Text>
        </View>
      ) : null}

      {/* KPI Cards */}
      <View style={[styles.grid, { flexDirection: cols === 4 ? "row" : "row", flexWrap: "wrap", gap: 12 }]}>
        <Kpi
          label="Revenue Today"
          value={`₹${(data?.revenue_today || 0).toLocaleString("en-IN")}`}
          hint={`${data?.rides_completed_today || 0} completed rides`}
          icon="cash"
          accent
          colWidth={cols}
        />
        <Kpi label="Commission Today" value={`₹${(data?.commission_today || 0).toLocaleString("en-IN")}`} hint="ZipRides platform fee" icon="trending-up" colWidth={cols} />
        <Kpi label="Total Rides Today" value={`${data?.rides_today || 0}`} hint={`${data?.rides_completed_today || 0} completed`} icon="checkmark-circle" colWidth={cols} />
        <Kpi label="Active Captains" value={`${data?.active_captains || 0}`} hint={`${data?.total_captains || 0} total`} icon="motorbike" mci colWidth={cols} />
        <Kpi label="Total Customers" value={`${data?.total_customers || 0}`} hint="Lifetime signups" icon="people" colWidth={cols} />
        <Kpi label="Pending KYC" value={`${data?.pending_kyc || 0}`} hint="Awaiting verification" icon="shield-half" warn colWidth={cols} />
        <Kpi label="Blocked Users" value={`${data?.blocked_users || 0}`} hint="Access revoked" icon="ban" colWidth={cols} />
        <Kpi label="Open Complaints" value={`${data?.open_complaints || 0}`} hint="Awaiting review" icon="alert-circle" danger colWidth={cols} />
      </View>

      {/* Weekly Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Revenue — last 7 days</Text>
        <View style={styles.chart}>
          {(data?.weekly || []).length === 0 ? (
            <View style={styles.emptyChart}>
              <MaterialCommunityIcons name="chart-line" size={40} color="#CCC" />
              <Text style={styles.emptyText}>No revenue data yet</Text>
            </View>
          ) : (
            <View style={styles.chartInner}>
              {data.weekly.map((w: any) => (
                <View key={w.date} style={styles.barCol}>
                  <View style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "flex-end" }}>
                    <View style={[styles.bar, { height: `${(w.revenue / maxWeek) * 100}%` }]} />
                  </View>
                  <Text style={styles.barLabel}>{w.date.slice(5)}</Text>
                  <Text style={styles.barValue}>₹{w.revenue}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <QA icon="map" label="View live fleet" onPress={() => router.push("/admin/fleet")} testID="qa-fleet" />
          <QA icon="shield-half" label="Review KYC queue" onPress={() => router.push("/admin/users?filter=pending_kyc")} testID="qa-kyc" />
          <QA icon="pricetags" label="Update fares" onPress={() => router.push("/admin/fares")} testID="qa-fares" />
          <QA icon="alert-circle" label="Support tickets" onPress={() => router.push("/admin/support")} testID="qa-support" />
        </View>
      </View>
    </ScrollView>
  );
}

const Kpi: React.FC<{
  label: string;
  value: string;
  hint: string;
  icon: any;
  mci?: boolean;
  accent?: boolean;
  warn?: boolean;
  danger?: boolean;
  colWidth: number;
}> = ({ label, value, hint, icon, mci, accent, warn, danger, colWidth }) => {
  const flexBasis = colWidth === 4 ? "23%" : colWidth === 2 ? "48%" : "100%";
  return (
    <View
      style={[
        styles.kpi,
        { flexBasis, flexGrow: 1 },
        accent && { backgroundColor: "#111" },
      ]}
    >
      <View style={[styles.kpiIcon, accent && { backgroundColor: "rgba(245,197,24,0.15)" }, warn && { backgroundColor: "#FDF4E5" }, danger && { backgroundColor: "#FDECEA" }]}>
        {mci ? (
          <MaterialCommunityIcons name={icon} size={16} color={accent ? "#F5C518" : danger ? theme.colors.error : warn ? theme.colors.warning : "#111"} />
        ) : (
          <Ionicons name={icon} size={16} color={accent ? "#F5C518" : danger ? theme.colors.error : warn ? theme.colors.warning : "#111"} />
        )}
      </View>
      <Text style={[styles.kpiLabel, accent && { color: "#BBB" }]}>{label}</Text>
      <Text style={[styles.kpiValue, accent && { color: "#fff" }]}>{value}</Text>
      <Text style={[styles.kpiHint, accent && { color: "#888" }]}>{hint}</Text>
    </View>
  );
};

const QA: React.FC<{ icon: any; label: string; onPress: () => void; testID: string }> = ({ icon, label, onPress, testID }) => (
  <TouchableOpacity style={styles.qa} onPress={onPress} testID={testID}>
    <Ionicons name={icon} size={18} color="#111" />
    <Text style={styles.qaText}>{label}</Text>
    <Ionicons name="chevron-forward" size={14} color="#777" />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pageTitle: { fontSize: 26, fontWeight: "800", color: "#111", letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  refreshText: { fontSize: 12, fontWeight: "700", color: "#111" },
  grid: {},
  kpi: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 160,
  },
  kpiIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  kpiLabel: { fontSize: 11, fontWeight: "700", color: theme.colors.onSurfaceSecondary, letterSpacing: 0.5, textTransform: "uppercase" },
  kpiValue: { fontSize: 26, fontWeight: "800", color: "#111", marginTop: 4, letterSpacing: -0.5 },
  kpiHint: { fontSize: 11, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  section: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.border },
  sectionTitle: { fontSize: 14, fontWeight: "800", color: "#111", marginBottom: 12 },
  chart: { height: 200 },
  emptyChart: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 8 },
  chartInner: { flex: 1, flexDirection: "row", justifyContent: "space-between", gap: 6 },
  barCol: { flex: 1, alignItems: "center" },
  bar: { width: 24, backgroundColor: "#111", borderRadius: 4 },
  barLabel: { fontSize: 10, fontWeight: "700", color: theme.colors.onSurfaceSecondary, marginTop: 4 },
  barValue: { fontSize: 10, fontWeight: "800", color: "#111" },
  qa: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 220,
    flexGrow: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  qaText: { fontSize: 13, fontWeight: "700", color: "#111", flex: 1 },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FDECEA",
    padding: 12,
    borderRadius: 12,
  },
  errText: { color: theme.colors.error, fontSize: 13, fontWeight: "600", flex: 1 },
});
