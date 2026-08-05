import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";

export default function PhoneAuth() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role: "customer" | "captain" | "admin" }>();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const validPhone = phone.replace(/\D/g, "").length === 10;
  const isCaptain = role === "captain";
  const isAdmin = role === "admin";

  useEffect(() => {
    if (isAdmin && !phone) setPhone("9999999999");
  }, [isAdmin, phone]);

  const sendOtp = async () => {
    if (!validPhone) return;
    setErr("");
    setLoading(true);
    try {
      await api.sendOtp(phone, role || "customer");
      router.push({ pathname: "/auth/otp", params: { phone, role: role || "customer" } });
    } catch (e: any) {
      setErr(e.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} testID="phone-back-btn">
              <Ionicons name="chevron-back" size={26} color="#111" />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={[styles.badge, (isCaptain || isAdmin) && { backgroundColor: "#111" }]}>
              {isAdmin ? (
                <Ionicons name="shield-checkmark" size={18} color="#F5C518" />
              ) : isCaptain ? (
                <MaterialCommunityIcons name="motorbike" size={18} color="#F5C518" />
              ) : (
                <Ionicons name="person" size={18} color="#111" />
              )}
              <Text style={[styles.badgeText, (isCaptain || isAdmin) && { color: "#fff" }]}>
                {isAdmin ? "Admin login" : isCaptain ? "Captain login" : "Customer login"}
              </Text>
            </View>

            <Text style={styles.title}>Enter your{"\n"}mobile number</Text>
            <Text style={styles.sub}>
              We&apos;ll send a 4-digit OTP to verify your number.
            </Text>

            <View style={styles.inputRow}>
              <View style={styles.prefix}>
                <Text style={styles.prefixText}>+91</Text>
              </View>
              <TextInput
                testID="phone-input"
                style={styles.input}
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
                placeholder="9876543210"
                placeholderTextColor={theme.colors.onSurfaceTertiary}
                keyboardType="number-pad"
                maxLength={10}
                returnKeyType="done"
                onSubmitEditing={sendOtp}
              />
            </View>
            {err ? (
              <Text style={styles.err} testID="phone-error">
                {err}
              </Text>
            ) : null}

            <View style={styles.hint}>
              <Ionicons name="information-circle-outline" size={14} color="#777" />
              <Text style={styles.hintText}>
                Demo mode — use OTP <Text style={{ fontWeight: "800" }}>1234</Text> to verify.
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Button
              testID="send-otp-btn"
              label="Send OTP"
              onPress={sendOtp}
              disabled={!validPhone}
              loading={loading}
            />
            <Text style={styles.terms}>
              By continuing, you agree to ZipRide&apos;s Terms &amp; Privacy Policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  body: { paddingHorizontal: theme.spacing.lg, marginTop: 20, flex: 1 },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceSecondary,
    marginBottom: 24,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: "#111" },
  title: {
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 38,
  },
  sub: { color: theme.colors.onSurfaceSecondary, marginTop: 8, fontSize: 15 },
  inputRow: {
    flexDirection: "row",
    marginTop: 32,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    height: 60,
  },
  prefix: {
    paddingHorizontal: 14,
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceSecondary,
    borderRightWidth: 1,
    borderColor: theme.colors.border,
  },
  prefixText: { fontSize: 18, fontWeight: "700" },
  input: { flex: 1, paddingHorizontal: 14, fontSize: 20, fontWeight: "600", color: "#111" },
  err: { color: theme.colors.error, marginTop: 8, fontSize: 13 },
  hint: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  hintText: { fontSize: 12, color: theme.colors.onSurfaceSecondary },
  footer: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg },
  terms: {
    textAlign: "center",
    fontSize: 11,
    color: theme.colors.onSurfaceTertiary,
    marginTop: 12,
    paddingHorizontal: 20,
  },
});
