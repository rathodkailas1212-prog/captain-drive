import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/theme";
import { MapMarker } from "@/src/components/MockMap";
import { RideMap } from "@/src/components/RideMap";
import { api } from "@/src/api";

type RideStage = "arriving" | "at_pickup" | "in_ride" | "completed";

export default function Tracking() {
  const router = useRouter();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ride, setRide] = useState<any>(null);
  const [stage, setStage] = useState<RideStage>("arriving");
  const [progress, setProgress] = useState(0); // 0..1
  const [showChat, setShowChat] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<{ from: "me" | "captain"; text: string }[]>([
    { from: "captain", text: "Hi! I'm on my way, be there in a couple of minutes." },
  ]);
  const [chatDraft, setChatDraft] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.getRide(rideId!);
        setRide(res.ride);
      } catch (e) {
        console.log(e);
      }
    };
    load();
    // Poll for captain's live location while the screen is open
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [rideId]);

  // Simulate captain moving
  useEffect(() => {
    const t = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(1, p + 0.02);
        if (next >= 0.5 && stage === "arriving") setStage("at_pickup");
        if (next >= 1 && stage === "at_pickup") setStage("in_ride");
        return next;
      });
    }, 400);
    return () => clearInterval(t);
  }, [stage]);

  useEffect(() => {
    if (stage === "in_ride") {
      // start ride progress
      let p2 = 0;
      const t = setInterval(async () => {
        p2 = Math.min(1, p2 + 0.03);
        setProgress(p2);
        if (p2 >= 1) {
          clearInterval(t);
          try {
            await api.updateRideStatus(rideId!, "completed");
          } catch {}
          router.replace({ pathname: "/customer/payment", params: { rideId } });
        }
      }, 400);
      return () => clearInterval(t);
    }
  }, [stage, rideId, router]);

  if (!ride) {
    return (
      <View style={styles.container}>
        <Text style={{ padding: 40, textAlign: "center" }}>Loading ride…</Text>
      </View>
    );
  }

  const captainPos: MapMarker =
    stage === "arriving"
      ? { id: "cap", x: 0.25 + progress * 0.5, y: 0.25 + progress * 0.5, kind: "captain" }
      : stage === "at_pickup"
      ? { id: "cap", x: 0.5, y: 0.5, kind: "captain" }
      : { id: "cap", x: 0.5 + progress * 0.3, y: 0.5 - progress * 0.35, kind: "captain" };

  const markers: MapMarker[] =
    stage === "in_ride"
      ? [
          captainPos,
          { id: "drop", x: 0.82, y: 0.15, kind: "drop", label: "Drop" },
        ]
      : [
          captainPos,
          { id: "user", x: 0.5, y: 0.5, kind: "user", label: "You" },
        ];

  const statusText =
    stage === "arriving"
      ? `Captain arriving in ${Math.max(1, Math.round((1 - progress) * 6))} min`
      : stage === "at_pickup"
      ? "Your captain has arrived"
      : `Reaching drop in ${Math.max(1, Math.round((1 - progress) * 12))} min`;

  const sendMsg = () => {
    if (!chatDraft.trim()) return;
    setChatMsgs((m) => [...m, { from: "me", text: chatDraft.trim() }]);
    setChatDraft("");
    setTimeout(() => {
      setChatMsgs((m) => [...m, { from: "captain", text: "Got it, thanks!" }]);
    }, 900);
  };

  const triggerSOS = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    try {
      await api.sos(rideId!, ride?.captain_lat ?? ride?.pickup_lat ?? 18.73312, ride?.captain_lng ?? ride?.pickup_lng ?? 76.38616, "Customer SOS activated");
    } catch {}
    setShowSOS(true);
  };

  return (
    <View style={styles.container}>
      <RideMap
        style={StyleSheet.absoluteFillObject}
        pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
        drop={{ lat: ride.drop_lat, lng: ride.drop_lng }}
        captain={ride.captain_lat != null ? { lat: ride.captain_lat, lng: ride.captain_lng } : null}
        polyline={ride.route_polyline}
        mock={{
          markers,
          showRoute: true,
          routeFrom: { x: captainPos.x, y: captainPos.y },
          routeTo: stage === "in_ride" ? { x: 0.82, y: 0.15 } : { x: 0.5, y: 0.5 },
        }}
      />

      <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }} pointerEvents="box-none">
        <View style={styles.topBar}>
          <View style={styles.statusPill}>
            <View style={styles.livePulse} />
            <Text style={styles.statusPillText}>{statusText}</Text>
          </View>
          <TouchableOpacity style={styles.sosFab} onPress={triggerSOS} testID="sos-btn">
            <Ionicons name="alert-circle" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={styles.sheet}>
        <View style={styles.grabber} />

        {/* Captain card */}
        <View style={styles.capRow}>
          <Image source={{ uri: ride.captain.photo }} style={styles.capImg} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.capName}>{ride.captain.name}</Text>
              <View style={styles.ratingPill}>
                <Ionicons name="star" size={11} color="#111" />
                <Text style={styles.ratingText}>{ride.captain.rating}</Text>
              </View>
            </View>
            <Text style={styles.capVeh}>
              <MaterialCommunityIcons name="motorbike" size={12} color="#555" /> {ride.captain.vehicle_number}
            </Text>
          </View>
          <View style={styles.otpBox}>
            <Text style={styles.otpLabel}>OTP</Text>
            <Text style={styles.otpValue}>{ride.otp}</Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <ActionBtn
            icon={<Ionicons name="call" size={20} color="#111" />}
            label="Call"
            onPress={() => setShowSOS(false)}
            testID="action-call"
          />
          <ActionBtn
            icon={<Ionicons name="chatbubble" size={20} color="#111" />}
            label="Chat"
            onPress={() => setShowChat(true)}
            testID="action-chat"
          />
          <ActionBtn
            icon={<Ionicons name="share-social" size={20} color="#111" />}
            label="Share"
            onPress={() => {}}
            testID="action-share"
          />
          <ActionBtn
            icon={<Ionicons name="alert-circle" size={20} color={theme.colors.error} />}
            label="SOS"
            onPress={triggerSOS}
            testID="action-sos"
            danger
          />
        </View>

        <View style={styles.rideMeta}>
          <View style={{ flex: 1 }}>
            <Text style={styles.metaLabelSm}>Trip</Text>
            <Text style={styles.metaValueSm}>{ride.service_type} · {ride.distance_km} km</Text>
          </View>
          <View>
            <Text style={styles.metaLabelSm}>Fare</Text>
            <Text style={styles.metaValueSm}>₹{ride.fare}</Text>
          </View>
        </View>
      </View>

      {/* Chat modal */}
      <Modal visible={showChat} animationType="slide" onRequestClose={() => setShowChat(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top", "bottom"]}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.chatHeader}>
              <TouchableOpacity onPress={() => setShowChat(false)} testID="close-chat">
                <Ionicons name="chevron-back" size={26} color="#111" />
              </TouchableOpacity>
              <Image source={{ uri: ride.captain.photo }} style={styles.chatAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.chatName}>{ride.captain.name}</Text>
                <Text style={styles.chatSub}>{ride.captain.vehicle_number}</Text>
              </View>
              <TouchableOpacity>
                <Ionicons name="call" size={22} color="#111" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
              {chatMsgs.map((m, i) => (
                <View
                  key={i}
                  style={[
                    styles.msg,
                    m.from === "me" ? styles.msgMe : styles.msgOther,
                  ]}
                >
                  <Text style={{ color: m.from === "me" ? "#fff" : "#111", fontSize: 14 }}>{m.text}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                value={chatDraft}
                onChangeText={setChatDraft}
                placeholder="Type a message…"
                placeholderTextColor="#999"
                testID="chat-input"
              />
              <TouchableOpacity style={styles.sendBtn} onPress={sendMsg} testID="chat-send">
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* SOS modal */}
      <Modal visible={showSOS} transparent animationType="fade" onRequestClose={() => setShowSOS(false)}>
        <View style={styles.sosBackdrop}>
          <View style={styles.sosCard}>
            <View style={styles.sosIconWrap}>
              <Ionicons name="shield-checkmark" size={40} color="#fff" />
            </View>
            <Text style={styles.sosTitle}>SOS Alert sent</Text>
            <Text style={styles.sosBody}>
              Your live location and ride details have been shared with ZipRides Safety. Help is on the way.
            </Text>
            <TouchableOpacity style={styles.sosBtn} onPress={() => setShowSOS(false)} testID="sos-dismiss">
              <Text style={styles.sosBtnText}>I&apos;m safe now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ActionBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  testID: string;
  danger?: boolean;
}> = ({ icon, label, onPress, testID, danger }) => (
  <TouchableOpacity
    style={[styles.actionBtn, danger && { backgroundColor: "#FDECEA" }]}
    onPress={onPress}
    testID={testID}
  >
    {icon}
    <Text style={[styles.actionLbl, danger && { color: theme.colors.error }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  statusPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    ...theme.shadow.card,
  },
  livePulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.success },
  statusPillText: { fontSize: 13, fontWeight: "700", color: "#111", flex: 1 },
  sosFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.error,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadow.fab,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 34,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.surfaceTertiary,
    alignSelf: "center",
    marginBottom: 14,
  },
  capRow: { flexDirection: "row", alignItems: "center" },
  capImg: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#eee" },
  capName: { fontSize: 17, fontWeight: "800", color: "#111" },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  ratingText: { fontSize: 11, fontWeight: "800", color: "#111" },
  capVeh: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 4 },
  otpBox: {
    backgroundColor: theme.colors.brandPrimary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  otpLabel: { color: "#BBB", fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  otpValue: { color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: 2, marginTop: 2 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 20 },
  actionBtn: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    gap: 4,
  },
  actionLbl: { fontSize: 11, fontWeight: "700", color: "#111" },
  rideMeta: {
    flexDirection: "row",
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  metaLabelSm: { fontSize: 10, color: theme.colors.onSurfaceSecondary, fontWeight: "700", letterSpacing: 0.5 },
  metaValueSm: { fontSize: 15, fontWeight: "800", color: "#111", marginTop: 2 },
  // chat
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  chatAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#eee" },
  chatName: { fontSize: 15, fontWeight: "800", color: "#111" },
  chatSub: { fontSize: 11, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  msg: {
    marginVertical: 4,
    padding: 12,
    borderRadius: 16,
    maxWidth: "78%",
  },
  msgMe: { alignSelf: "flex-end", backgroundColor: theme.colors.brandPrimary, borderBottomRightRadius: 4 },
  msgOther: { alignSelf: "flex-start", backgroundColor: theme.colors.surfaceSecondary, borderBottomLeftRadius: 4 },
  chatInputRow: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 8,
    alignItems: "center",
  },
  chatInput: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 22,
    paddingHorizontal: 16,
    fontSize: 14,
    height: 44,
    color: "#111",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  // sos
  sosBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  sosCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  sosIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.error,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  sosTitle: { fontSize: 22, fontWeight: "800", color: "#111", marginTop: 8 },
  sosBody: {
    fontSize: 14,
    color: theme.colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  sosBtn: {
    marginTop: 20,
    backgroundColor: theme.colors.brandPrimary,
    paddingHorizontal: 24,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  sosBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
