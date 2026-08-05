import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions, Platform } from "react-native";
import { Slot, useRouter, usePathname } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { useAuth } from "@/src/auth";

const NAV = [
  { path: "/admin", label: "Dashboard", icon: "grid" as const },
  { path: "/admin/fleet", label: "Live Fleet", icon: "map" as const },
  { path: "/admin/users", label: "Users & Captains", icon: "people" as const },
  { path: "/admin/fares", label: "Fare & Commission", icon: "pricetags" as const },
  { path: "/admin/support", label: "Support Tickets", icon: "shield" as const },
];

export default function AdminLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const go = (path: string) => router.push(path as any);

  const NavItem = ({ item }: { item: typeof NAV[number] }) => {
    const active = pathname === item.path || (item.path !== "/admin" && pathname.startsWith(item.path));
    return (
      <TouchableOpacity
        style={[styles.navItem, active && styles.navItemActive, !isDesktop && styles.navItemMobile]}
        onPress={() => go(item.path)}
        testID={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        <Ionicons name={item.icon} size={18} color={active ? "#111" : "#BBB"} />
        {isDesktop && (
          <Text style={[styles.navText, active && { color: "#111" }]}>{item.label}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom", "left", "right"]}>
      <View style={[styles.shell, isDesktop && { flexDirection: "row" }]}>
        {/* Side nav on desktop, top nav on mobile */}
        <View style={[isDesktop ? styles.sidebar : styles.topbar]}>
          <View style={isDesktop ? styles.brandBlockDesktop : styles.brandBlockMobile}>
            <View style={styles.brandBadge}>
              <Ionicons name="shield-checkmark" size={18} color="#F5C518" />
            </View>
            {isDesktop && (
              <View>
                <Text style={styles.brandName}>ZipRide</Text>
                <Text style={styles.brandRole}>Admin Console</Text>
              </View>
            )}
          </View>

          {isDesktop ? (
            <View style={{ marginTop: 24, gap: 4 }}>
              {NAV.map((n) => (
                <NavItem key={n.path} item={n} />
              ))}
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
              {NAV.map((n) => (
                <NavItem key={n.path} item={n} />
              ))}
            </ScrollView>
          )}

          {isDesktop && (
            <View style={styles.sidebarFooter}>
              <View style={styles.userChip}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={14} color="#F5C518" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{user?.name || "Admin"}</Text>
                  <Text style={styles.userMeta}>+91 {user?.phone}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={async () => {
                  await logout();
                  router.replace("/role-select");
                }}
                testID="admin-logout"
              >
                <Ionicons name="log-out" size={16} color="#111" />
                <Text style={styles.logoutText}>Log out</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Main content */}
        <View style={styles.content}>
          <Slot />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F5F5" },
  shell: { flex: 1 },
  sidebar: {
    width: 240,
    backgroundColor: "#111",
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  topbar: {
    backgroundColor: "#111",
    paddingVertical: 10,
  },
  brandBlockDesktop: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 4 },
  brandBlockMobile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 8,
    gap: 8,
  },
  brandBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(245,197,24,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { color: "#fff", fontSize: 16, fontWeight: "800" },
  brandRole: { color: "#BBB", fontSize: 11, marginTop: 2 },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  navItemMobile: { paddingHorizontal: 14, paddingVertical: 8 },
  navItemActive: { backgroundColor: theme.colors.accent },
  navText: { color: "#BBB", fontSize: 13, fontWeight: "700" },
  sidebarFooter: { marginTop: "auto", paddingTop: 12, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)" },
  userChip: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(245,197,24,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  userName: { color: "#fff", fontSize: 13, fontWeight: "700" },
  userMeta: { color: "#888", fontSize: 11 },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: theme.colors.accent,
    paddingVertical: 10,
    borderRadius: 10,
  },
  logoutText: { fontSize: 13, fontWeight: "800", color: "#111" },
  content: { flex: 1, backgroundColor: "#F5F5F5" },
});
