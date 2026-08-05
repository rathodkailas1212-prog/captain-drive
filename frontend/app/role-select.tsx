import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";

export default function RoleSelect() {
  const router = useRouter();

  const pick = (role: "customer" | "captain" | "admin") => {
    router.push({ pathname: "/auth/phone", params: { role } });
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.brand}>ZipRide</Text>
        <Text style={styles.title}>How will you use ZipRide?</Text>
        <Text style={styles.sub}>You can switch roles later by logging out.</Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity
          testID="role-customer-btn"
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => pick("customer")}
        >
          <View style={[styles.iconBox, { backgroundColor: theme.colors.accent }]}>
            <Ionicons name="person" size={40} color="#111" />
          </View>
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.cardTitle}>Ride as Customer</Text>
            <Text style={styles.cardSub}>Book ZipBike or send a package with ZipDelivery.</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#111" />
        </TouchableOpacity>

        <TouchableOpacity
          testID="role-captain-btn"
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => pick("captain")}
        >
          <View style={[styles.iconBox, { backgroundColor: "#111" }]}>
            <MaterialCommunityIcons name="motorbike" size={40} color="#F5C518" />
          </View>
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={styles.cardTitle}>Drive as Captain</Text>
            <Text style={styles.cardSub}>Accept rides, track earnings, grow your income.</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#111" />
        </TouchableOpacity>

        <TouchableOpacity
          testID="role-admin-btn"
          style={[styles.card, styles.adminCard]}
          activeOpacity={0.85}
          onPress={() => pick("admin")}
        >
          <View style={[styles.iconBox, { backgroundColor: theme.colors.accent }]}>
            <Ionicons name="shield-checkmark" size={36} color="#111" />
          </View>
          <View style={{ flex: 1, marginLeft: 16 }}>
            <Text style={[styles.cardTitle, { color: "#fff" }]}>Admin Dashboard</Text>
            <Text style={[styles.cardSub, { color: "#BBB" }]}>Fleet, users, KYC, fares. Best on a desktop browser.</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <Text style={styles.foot}>Powered by ZipRide · v1.0</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
  },
  header: { marginTop: 24 },
  brand: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 40,
  },
  title: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5, lineHeight: 36 },
  sub: { fontSize: 15, color: theme.colors.onSurfaceSecondary, marginTop: 8 },
  cards: { marginTop: 36, gap: 14 },
  card: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    flexDirection: "row",
    alignItems: "center",
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  adminCard: { backgroundColor: "#111" },
  cardSub: {
    fontSize: 13,
    color: theme.colors.onSurfaceSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  foot: {
    textAlign: "center",
    marginTop: "auto",
    marginBottom: 8,
    color: theme.colors.onSurfaceTertiary,
    fontSize: 12,
  },
});
