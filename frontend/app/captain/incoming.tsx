import React, { useEffect, useState, useMemo, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Vibration, Platform } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from "expo-audio";
import { theme } from "@/src/theme";
import { api } from "@/src/api";

const BELL = require("../../assets/bell.mp3");
// Vibration pattern (Android): [wait, vibrate, wait, vibrate, …]
const VIBRATE_PATTERN = [0, 500, 250, 500, 250, 500];

export default function CaptainIncoming() {
  const router = useRouter();
  const [request, setRequest] = useState<any>(null);
  const [remaining, setRemaining] = useState(20);
  const [muted, setMuted] = useState(false);
  const progress = useSharedValue(1);
  const playerRef = useRef<AudioPlayer | null>(null);
  const mounted = useRef(true);

  const stopAlert = () => {
    try {
      Vibration.cancel();
    } catch {}
    const p = playerRef.current;
    if (p) {
      try {
        p.pause();
      } catch {}
      try {
        p.remove();
      } catch {}
      playerRef.current = null;
    }
  };

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const res = await api.incoming();
        if (mounted.current) setRequest(res.request);
      } catch {}
    })();
    progress.value = withTiming(0, { duration: 20000, easing: Easing.linear });

    // Start alarm: loud bell chime + strong vibration until captain acts / mutes / times out
    (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: false,
        });
        const player = createAudioPlayer(BELL);
        player.loop = true;
        player.volume = 1.0;
        player.play();
        if (mounted.current) {
          playerRef.current = player;
        } else {
          player.pause();
          player.remove();
        }
      } catch (e) {
        // Audio unavailable (e.g. web without user gesture) — fall back to vibration only
      }
      try {
        // Repeating vibration on Android; single strong buzz on iOS
        if (Platform.OS === "android") {
          Vibration.vibrate(VIBRATE_PATTERN, true);
        } else if (Platform.OS === "ios") {
          Vibration.vibrate();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
      } catch {}
    })();

    return () => {
      mounted.current = false;
      stopAlert();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      if (next) {
        stopAlert();
      }
      return next;
    });
  };

  useEffect(() => {
    const t = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) {
          clearInterval(t);
          reject();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accept = async () => {
    stopAlert();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (request && !request.demo) {
      try {
        await api.acceptRide(request.id);
      } catch {}
    }
    router.replace({ pathname: "/captain/active-ride", params: { rideId: request?.id || "demo" } });
  };

  const reject = () => {
    stopAlert();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.replace("/captain");
  };

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  if (!request) {
    return (
      <View style={styles.container}>
        <Text>Loading request…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <TouchableOpacity style={styles.muteBtn} onPress={toggleMute} testID="mute-btn">
        <Ionicons name={muted ? "volume-mute" : "volume-high"} size={18} color="#111" />
        <Text style={styles.muteText}>{muted ? "Muted" : "Alerting"}</Text>
      </TouchableOpacity>
      <View style={styles.timerCol}>
        <View style={styles.timerCircle}>
          <Text style={styles.timerNum}>{remaining}</Text>
          <Text style={styles.timerLbl}>seconds</Text>
        </View>
        <Text style={styles.title}>New Ride Request</Text>
      </View>

      <View style={styles.progressWrap}>
        <Animated.View style={[styles.progressBar, barStyle]} />
      </View>

      <View style={styles.card}>
        <View style={styles.fareBlock}>
          <Text style={styles.fareLabel}>You&apos;ll earn</Text>
          <Text style={styles.fareValue}>₹{request.fare}</Text>
          <View style={styles.svcChip}>
            <MaterialCommunityIcons
              name={request.service_type === "ZipDelivery" ? "package-variant" : "motorbike"}
              size={13}
              color="#F5C518"
            />
            <Text style={styles.svcChipText}>{request.service_type}</Text>
          </View>
        </View>

        <View style={styles.routeSection}>
          <View style={styles.routeRow}>
            <View style={styles.routeIcon}>
              <View style={styles.dotG} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeLbl}>PICKUP · 1.2 km away</Text>
              <Text style={styles.routeText} numberOfLines={2}>{request.pickup_address}</Text>
            </View>
          </View>
          <View style={styles.routeConnector} />
          <View style={styles.routeRow}>
            <View style={styles.routeIcon}>
              <View style={styles.dotR} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeLbl}>DROP · {request.distance_km} km trip</Text>
              <Text style={styles.routeText} numberOfLines={2}>{request.drop_address}</Text>
            </View>
          </View>
        </View>

        <View style={styles.custRow}>
          <View style={styles.custAvatar}>
            <Ionicons name="person" size={18} color="#fff" />
          </View>
          <Text style={styles.custName}>{request.customer_name || "Customer"}</Text>
          <View style={styles.custRating}>
            <Ionicons name="star" size={11} color="#111" />
            <Text style={styles.custRatingText}>{request.customer_rating || 4.7}</Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.declineBtn} onPress={reject} testID="reject-ride-btn">
          <Text style={styles.declineText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.acceptBtn} onPress={accept} testID="accept-ride-btn">
          <Text style={styles.acceptText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.brandPrimary, paddingHorizontal: theme.spacing.lg },
  muteBtn: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginTop: 6,
  },
  muteText: { fontSize: 12, fontWeight: "800", color: "#111" },
  timerCol: { alignItems: "center", marginTop: 20 },
  timerCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  timerNum: { fontSize: 40, fontWeight: "800", color: "#111", letterSpacing: -1 },
  timerLbl: { fontSize: 10, fontWeight: "700", color: "#111", letterSpacing: 0.5, textTransform: "uppercase" },
  title: { fontSize: 22, fontWeight: "800", color: "#fff", marginTop: 16 },
  progressWrap: { height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, marginTop: 20, overflow: "hidden" },
  progressBar: { height: 4, backgroundColor: theme.colors.accent, borderRadius: 2 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    marginTop: 20,
  },
  fareBlock: { alignItems: "center", paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  fareLabel: { fontSize: 11, fontWeight: "700", color: theme.colors.onSurfaceSecondary, letterSpacing: 0.5, textTransform: "uppercase" },
  fareValue: { fontSize: 40, fontWeight: "800", color: "#111", marginTop: 4, letterSpacing: -1 },
  svcChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#111",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 8,
  },
  svcChipText: { fontSize: 11, fontWeight: "700", color: "#F5C518" },
  routeSection: { paddingTop: 16 },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  routeIcon: { width: 24, alignItems: "center", justifyContent: "center", marginTop: 4 },
  dotG: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.success },
  dotR: { width: 12, height: 12, borderRadius: 6, backgroundColor: theme.colors.error },
  routeConnector: { width: 2, height: 20, backgroundColor: theme.colors.border, marginLeft: 11, marginVertical: 2 },
  routeLbl: { fontSize: 10, fontWeight: "700", color: theme.colors.onSurfaceSecondary, letterSpacing: 0.5 },
  routeText: { fontSize: 14, fontWeight: "700", color: "#111", marginTop: 2, lineHeight: 20 },
  custRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  custAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  custName: { fontSize: 14, fontWeight: "700", color: "#111", flex: 1 },
  custRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  custRatingText: { fontSize: 11, fontWeight: "800", color: "#111" },
  actions: { flexDirection: "row", gap: 10, marginTop: "auto", marginBottom: 10 },
  declineBtn: {
    flex: 1,
    height: 60,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  declineText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  acceptBtn: {
    flex: 1.4,
    height: 60,
    borderRadius: 14,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptText: { color: "#111", fontSize: 16, fontWeight: "800" },
});
