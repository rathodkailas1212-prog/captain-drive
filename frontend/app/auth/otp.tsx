import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

const LEN = 4;

export default function OtpScreen() {
  const router = useRouter();
  const { phone, role } = useLocalSearchParams<{ phone: string; role: "customer" | "captain" }>();
  const { login } = useAuth();

  const [otp, setOtp] = useState<string[]>(Array(LEN).fill(""));
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [seconds, setSeconds] = useState(30);

  const inputs = useRef<Array<TextInput | null>>([]);
  const shake = useSharedValue(0);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const handleChange = (v: string, idx: number) => {
    const val = v.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[idx] = val;
    setOtp(next);
    if (val && idx < LEN - 1) inputs.current[idx + 1]?.focus();
    if (val && idx === LEN - 1) {
      submitCode(next.join(""));
    }
  };

  const handleKey = (e: any, idx: number) => {
    if (e.nativeEvent.key === "Backspace" && !otp[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
  };

  const submitCode = async (code: string) => {
    if (code.length !== LEN || loading) return;
    setLoading(true);
    setErr("");
    try {
      const res = await api.verifyOtp(phone || "", code, role || "customer");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await login(res.user, res.token);
      if (res.user.role === "captain") router.replace("/captain");
      else router.replace("/customer");
    } catch (e: any) {
      setErr(e.message || "Invalid OTP");
      shake.value = withSequence(
        withTiming(-10, { duration: 60 }),
        withTiming(10, { duration: 60 }),
        withTiming(-8, { duration: 60 }),
        withTiming(8, { duration: 60 }),
        withTiming(0, { duration: 60 }),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setOtp(Array(LEN).fill(""));
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  const resend = async () => {
    if (seconds > 0) return;
    try {
      await api.sendOtp(phone || "", role || "customer");
      setSeconds(30);
    } catch {}
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="otp-back-btn">
            <Ionicons name="chevron-back" size={26} color="#111" />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>Enter OTP</Text>
          <Text style={styles.sub}>
            Sent to <Text style={{ fontWeight: "700", color: "#111" }}>+91 {phone}</Text>
          </Text>

          <Animated.View style={[styles.otpRow, shakeStyle]}>
            {otp.map((c, i) => (
              <TextInput
                key={i}
                ref={(r) => {
                  inputs.current[i] = r;
                }}
                value={c}
                onChangeText={(v) => handleChange(v, i)}
                onKeyPress={(e) => handleKey(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                style={[styles.otpBox, c && styles.otpBoxFilled]}
                testID={`otp-input-${i}`}
              />
            ))}
          </Animated.View>

          {err ? (
            <Text style={styles.err} testID="otp-error">
              {err}
            </Text>
          ) : (
            <Text style={styles.hint}>
              Demo OTP: <Text style={{ fontWeight: "800", color: "#111" }}>1234</Text>
            </Text>
          )}

          <TouchableOpacity onPress={resend} disabled={seconds > 0}>
            <Text style={[styles.resend, seconds > 0 && { opacity: 0.5 }]} testID="resend-otp-btn">
              {seconds > 0 ? `Resend in 0:${seconds.toString().padStart(2, "0")}` : "Resend OTP"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Button
            testID="verify-otp-btn"
            label="Verify & Continue"
            onPress={() => submitCode(otp.join(""))}
            disabled={otp.join("").length !== LEN}
            loading={loading}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  body: { flex: 1, paddingHorizontal: theme.spacing.lg, marginTop: 20 },
  title: { fontSize: 32, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: theme.colors.onSurfaceSecondary, marginTop: 8, fontSize: 15 },
  otpRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 36,
    gap: 12,
  },
  otpBox: {
    flex: 1,
    height: 70,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    textAlign: "center",
    fontSize: 28,
    fontWeight: "800",
    color: "#111",
    backgroundColor: theme.colors.surfaceSecondary,
  },
  otpBoxFilled: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: "#fff",
  },
  err: { color: theme.colors.error, marginTop: 16, fontSize: 13 },
  hint: { marginTop: 16, fontSize: 13, color: theme.colors.onSurfaceSecondary },
  resend: {
    marginTop: 20,
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.brandPrimary,
  },
  footer: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg },
});
