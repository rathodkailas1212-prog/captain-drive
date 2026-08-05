import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme";
import { MockMap } from "@/src/components/MockMap";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function CaptainDashboard() {
  const router = useRouter();
  const { user, refresh, logout } = useAuth();
  const [online, setOnline] = useState(user?.is_online || false);
  const [earnings, setEarnings] = useState<any>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [checking, setChecking] = useState(false);

  const loadEarnings = useCallback(async () => {
    try {
      const e = await api.earnings();
      setEarnings(e);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEarnings();
      refresh();
    }, [loadEarnings, refresh]),
  );

  // Simulate incoming ride when online
  useEffect(() => {
    if (!online) return;
    // After 3s of being online, show an incoming ride request
    const t = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      router.push("/captain/incoming");
    }, 3500);
    return () => clearTimeout(t);
  }, [online, router]);

  const toggle = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const next = !online;
    setOnline(next);
    try {
      await api.toggleDuty(next);
      await refresh();
    } catch {}
  };

  return (
    <View style={styles.container}>
      <MockMap
        style={StyleSheet.absoluteFillObject}
        markers={[{ id: "u", x: 0.5, y: 0.5, kind: online ? "captain" : "user", label: online ? "You (Online)" : "You" }]}
      />
      {!online && <View style={styles.offlineOverlay} pointerEvents="none" />}

      <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setShowMenu(true)} testID="cap-menu-btn">
            <Ionicons name="menu" size={22} color="#111" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.togglePill, online ? styles.pillOn : styles.pillOff]}
            onPress={toggle}
            testID="duty-toggle"
          >
            <View style={[styles.toggleDot, online ? { backgroundColor: theme.colors.success } : { backgroundColor: "#999" }]} />
            <Text style={[styles.toggleText, online && { color: "#fff" }]}>{online ? "You're Online" : "You're Offline"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/captain/earnings")} testID="cap-earnings-btn">
            <Ionicons name="wallet" size={20} color="#111" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Bottom floating card */}
      <View style={styles.bottomCard}>
        <View style={styles.bcHead}>
          <Text style={styles.bcTitle}>Today&apos;s Snapshot</Text>
          <TouchableOpacity onPress={() => router.push("/captain/earnings")} testID="see-earnings">
            <Text style={styles.bcLink}>See all →</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.metricsRow}>
          <Metric label="Earnings" value={`₹${earnings?.today_earnings?.toFixed(0) || 0}`} icon="cash" />
          <Metric label="Rides" value={`${earnings?.today_rides || 0}`} icon="checkmark-done" />
          <Metric label="Cash" value={`₹${earnings?.cash_in_hand?.toFixed(0) || 0}`} icon="wallet-outline" />
        </View>
        {!online ? (
          <Text style={styles.hint}>Turn duty ON to start receiving ride requests.</Text>
        ) : (
          <Text style={styles.hint}>Waiting for ride requests in your area…</Text>
        )}
      </View>

      {/* Menu */}
      <Modal visible={showMenu} transparent animationType="fade" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setShowMenu(false)}>
          <SafeAreaView edges={["top"]} style={styles.menuSheet}>
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                <MaterialCommunityIcons name="motorbike" size={26} color="#F5C518" />
              </View>
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.userName}>{user?.name || "Captain"}</Text>
                <Text style={styles.userPhone}>+91 {user?.phone}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                  <Ionicons name="star" size={12} color={theme.colors.accent} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#111" }}>{(user?.rating ?? 4.8).toFixed(1)}</Text>
                  <View style={styles.kycChip}>
                    <Ionicons name={user?.kyc_verified ? "shield-checkmark" : "shield-outline"} size={11} color={user?.kyc_verified ? theme.colors.success : "#777"} />
                    <Text style={{ fontSize: 10, fontWeight: "700", color: user?.kyc_verified ? theme.colors.success : "#777" }}>
                      {user?.kyc_verified ? "KYC Verified" : "KYC Pending"}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <MenuItem icon={<Ionicons name="wallet" size={20} color="#111" />} label="Earnings" onPress={() => { setShowMenu(false); router.push("/captain/earnings"); }} testID="cap-menu-earnings" />
            <MenuItem icon={<Ionicons name="person-circle" size={20} color="#111" />} label="Profile & Documents" onPress={() => { setShowMenu(false); router.push("/captain/profile"); }} testID="cap-menu-profile" />
            <MenuItem icon={<Ionicons name="log-out" size={20} color="#111" />} label="Log out" onPress={async () => { setShowMenu(false); await logout(); router.replace("/role-select"); }} testID="cap-menu-logout" />
          </SafeAreaView>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const Metric: React.FC<{ label: string; value: string; icon: any }> = ({ label, value, icon }) => (
  <View style={styles.metric}>
    <View style={styles.metricIcon}>
      <Ionicons name={icon} size={16} color="#111" />
    </View>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
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
  offlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17,17,17,0.35)",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  togglePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
    ...theme.shadow.fab,
  },
  pillOn: { backgroundColor: theme.colors.brandPrimary },
  pillOff: { backgroundColor: "#fff" },
  toggleDot: { width: 10, height: 10, borderRadius: 5 },
  toggleText: { fontSize: 13, fontWeight: "800", color: "#111" },
  bottomCard: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    ...theme.shadow.fab,
  },
  bcHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  bcTitle: { fontSize: 15, fontWeight: "800", color: "#111" },
  bcLink: { fontSize: 12, fontWeight: "700", color: theme.colors.brandPrimary },
  metricsRow: { flexDirection: "row", gap: 8 },
  metric: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 12,
    padding: 10,
    alignItems: "flex-start",
  },
  metricIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  metricLabel: { fontSize: 10, color: theme.colors.onSurfaceSecondary, fontWeight: "700", letterSpacing: 0.5 },
  metricValue: { fontSize: 16, fontWeight: "800", color: "#111", marginTop: 2 },
  hint: { marginTop: 12, fontSize: 12, color: theme.colors.onSurfaceSecondary, textAlign: "center" },
  // menu
  menuBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
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
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: { fontSize: 17, fontWeight: "800", color: "#111" },
  userPhone: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  kycChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 6,
    backgroundColor: theme.colors.surfaceSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    marginTop: 8,
  },
  menuItemText: { fontSize: 15, fontWeight: "700", color: "#111" },
});
