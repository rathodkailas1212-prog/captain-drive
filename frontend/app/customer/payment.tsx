import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";

const METHODS = [
  { id: "upi", label: "UPI", sub: "Pay via GPay / PhonePe", icon: "phone-portrait" },
  { id: "cash", label: "Cash", sub: "Pay directly to captain", icon: "cash-outline" },
  { id: "wallet", label: "ZipRide Wallet", sub: "Use wallet balance", icon: "wallet" },
];

export default function Payment() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ride, setRide] = useState<any>(null);
  const [selected, setSelected] = useState<string>("upi");
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getRide(rideId!);
        setRide(res.ride);
      } catch (e) {
        console.log(e);
      }
    })();
  }, [rideId]);

  const pay = async () => {
    if (!ride) return;
    setPaying(true);
    // MOCKED payment
    setTimeout(() => {
      setPaid(true);
      setPaying(false);
    }, 1400);
  };

  const goRate = () => {
    router.replace({
      pathname: "/customer/rating",
      params: { rideId, method: selected },
    });
  };

  if (!ride) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride Complete</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.hero}>
        <View style={styles.check}>
          <Ionicons name="checkmark" size={40} color="#fff" />
        </View>
        <Text style={styles.heroTitle}>Thanks for riding{"\n"}with ZipRide!</Text>
        <Text style={styles.heroSub}>
          Trip completed · {ride.distance_km} km · {ride.service_type}
        </Text>
      </View>

      <View style={styles.fareCard}>
        <View style={styles.fareRow}>
          <Text style={styles.fareLbl}>Trip fare</Text>
          <Text style={styles.fareVal}>₹{(ride.fare - 10).toFixed(2)}</Text>
        </View>
        <View style={styles.fareRow}>
          <Text style={styles.fareLbl}>Booking fee</Text>
          <Text style={styles.fareVal}>₹10.00</Text>
        </View>
        <View style={styles.fareDivider} />
        <View style={styles.fareRow}>
          <Text style={styles.totalLbl}>Total</Text>
          <Text style={styles.totalVal}>₹{ride.fare.toFixed(2)}</Text>
        </View>
      </View>

      <Text style={styles.section}>Choose payment</Text>
      <View style={{ gap: 10, marginBottom: 20 }}>
        {METHODS.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.method, selected === m.id && styles.methodSel]}
            onPress={() => setSelected(m.id)}
            testID={`pay-${m.id}`}
          >
            <View style={styles.methodIcon}>
              <Ionicons name={m.icon as any} size={22} color="#111" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.methodTitle}>{m.label}</Text>
              <Text style={styles.methodSub}>{m.sub}</Text>
            </View>
            <View style={[styles.radio, selected === m.id && styles.radioSel]}>
              {selected === m.id && <View style={styles.radioDot} />}
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ marginTop: "auto" }}>
        {!paid ? (
          <Button
            testID="pay-btn"
            label={`Pay ₹${ride.fare}`}
            onPress={pay}
            loading={paying}
          />
        ) : (
          <Button
            testID="pay-continue"
            label="Continue to Rate"
            onPress={goRate}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.lg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#111" },
  hero: { alignItems: "center", marginTop: 10, marginBottom: 20 },
  check: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: theme.colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: { fontSize: 26, fontWeight: "800", color: "#111", textAlign: "center", letterSpacing: -0.5, lineHeight: 32 },
  heroSub: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 6 },
  fareCard: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 16,
    padding: 16,
  },
  fareRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  fareLbl: { fontSize: 14, color: theme.colors.onSurfaceSecondary },
  fareVal: { fontSize: 14, fontWeight: "700", color: "#111" },
  fareDivider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 8 },
  totalLbl: { fontSize: 16, fontWeight: "800", color: "#111" },
  totalVal: { fontSize: 22, fontWeight: "800", color: "#111" },
  section: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#777",
    marginTop: 20,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  method: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    padding: 14,
    borderRadius: 14,
  },
  methodSel: { borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.brandTertiary },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  methodTitle: { fontSize: 15, fontWeight: "800", color: "#111" },
  methodSub: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSel: { borderColor: theme.colors.brandPrimary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.brandPrimary,
  },
});
