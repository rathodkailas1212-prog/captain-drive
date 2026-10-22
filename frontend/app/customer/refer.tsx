import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Share,
  Platform,
  TextInput,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { theme } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function Refer() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [summary, setSummary] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyErr, setApplyErr] = useState("");
  const [applySuccess, setApplySuccess] = useState("");
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const res = await api.referralSummary();
      setSummary(res);
    } catch {}
    setRefreshing(false);
  };
  useEffect(() => {
    load();
  }, []);

  const copyCode = async () => {
    if (!summary?.referral_code) return;
    await Clipboard.setStringAsync(summary.referral_code);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const share = async () => {
    if (!summary?.referral_code) return;
    try {
      await Share.share({
        message: `Hey! Try ZipRides — the fastest way to book bikes & send packages in your city. Use my code ${summary.referral_code} on signup and we both get ₹${summary.bonus_per_referral} in wallet credits. 🛵`,
      });
    } catch {}
  };

  const applyCode = async () => {
    if (!code.trim()) return;
    setApplying(true);
    setApplyErr("");
    setApplySuccess("");
    try {
      const res = await api.applyReferral(code.trim().toUpperCase());
      setApplySuccess(`+₹${res.bonus} added to your wallet 🎉`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCode("");
      await refresh();
      await load();
    } catch (e: any) {
      setApplyErr(e.message || "Could not apply code");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
    setApplying(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="refer-back">
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Refer & Earn</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor="#fff" />}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="gift" size={40} color="#F5C518" />
          </View>
          <Text style={styles.heroTitle}>Give ₹50, Get ₹50</Text>
          <Text style={styles.heroSub}>
            Invite friends to ZipRides. When they sign up with your code, you both get ₹50 wallet credit.
          </Text>
        </View>

        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Your Referral Code</Text>
          <Text style={styles.codeValue} testID="referral-code-value">
            {summary?.referral_code || "…"}
          </Text>
          <View style={styles.codeActions}>
            <TouchableOpacity style={styles.copyBtn} onPress={copyCode} testID="copy-code-btn">
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color="#111" />
              <Text style={styles.copyBtnText}>{copied ? "Copied!" : "Copy Code"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareBtn} onPress={share} testID="share-code-btn">
              <Ionicons name="share-social" size={16} color="#fff" />
              <Text style={styles.shareBtnText}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard label="Friends invited" value={`${summary?.referrals_count || 0}`} icon="people" />
          <StatCard label="Credits earned" value={`₹${summary?.credits_earned?.toFixed(0) || 0}`} icon="cash" />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Have a code?</Text>
          <Text style={styles.sectionSub}>Enter a friend's code to get ₹50 in your wallet.</Text>
          <View style={styles.applyRow}>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="Enter code"
              placeholderTextColor="#999"
              autoCapitalize="characters"
              maxLength={12}
              testID="apply-code-input"
            />
            <Button
              label={applying ? "…" : "Apply"}
              onPress={applyCode}
              loading={applying}
              disabled={!code.trim()}
              style={{ height: 52, paddingHorizontal: 20 }}
              testID="apply-code-btn"
            />
          </View>
          {applyErr ? <Text style={styles.errText} testID="apply-error">{applyErr}</Text> : null}
          {applySuccess ? <Text style={styles.successText} testID="apply-success">{applySuccess}</Text> : null}
        </View>

        <View style={styles.howBox}>
          <Text style={styles.howTitle}>How it works</Text>
          <Step n={1} text="Share your code with friends" />
          <Step n={2} text="They sign up on ZipRides and apply your code" />
          <Step n={3} text="You both get ₹50 wallet credit instantly" />
        </View>

        {summary?.referrals?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your invites</Text>
            {summary.referrals.map((r: any, i: number) => (
              <View key={i} style={styles.inviteRow}>
                <View style={styles.inviteAvatar}>
                  <Ionicons name="person" size={16} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteName}>{r.name || `+91 ${r.phone}`}</Text>
                  <Text style={styles.inviteDate}>{new Date(r.created_at).toLocaleDateString()}</Text>
                </View>
                <Text style={styles.inviteBonus}>+₹{summary.bonus_per_referral}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const StatCard: React.FC<{ label: string; value: string; icon: any }> = ({ label, value, icon }) => (
  <View style={styles.stat}>
    <View style={styles.statIcon}>
      <Ionicons name={icon} size={16} color="#F5C518" />
    </View>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const Step: React.FC<{ n: number; text: string }> = ({ n, text }) => (
  <View style={styles.step}>
    <View style={styles.stepBadge}>
      <Text style={styles.stepNum}>{n}</Text>
    </View>
    <Text style={styles.stepText}>{text}</Text>
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
  hero: { alignItems: "center", marginTop: 10, paddingHorizontal: 24 },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(245,197,24,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: { fontSize: 26, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  heroSub: { fontSize: 14, color: "#BBB", textAlign: "center", marginTop: 8, lineHeight: 20 },
  codeCard: {
    marginHorizontal: 16,
    marginTop: 24,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
  },
  codeLabel: { fontSize: 11, fontWeight: "700", color: theme.colors.onSurfaceSecondary, letterSpacing: 0.5 },
  codeValue: {
    fontSize: 36,
    fontWeight: "800",
    color: "#111",
    letterSpacing: 4,
    marginTop: 8,
  },
  codeActions: { flexDirection: "row", gap: 10, marginTop: 16, alignSelf: "stretch" },
  copyBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  copyBtnText: { fontSize: 13, fontWeight: "800", color: "#111" },
  shareBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  shareBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  statsRow: { flexDirection: "row", marginHorizontal: 16, marginTop: 12, gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  statIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(245,197,24,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statLabel: { color: "#BBB", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  statValue: { color: "#fff", fontSize: 20, fontWeight: "800", marginTop: 2 },
  section: {
    marginTop: 20,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111" },
  sectionSub: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 4 },
  applyRow: { flexDirection: "row", gap: 8, marginTop: 12, alignItems: "center" },
  codeInput: {
    flex: 1,
    height: 52,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 2,
    color: "#111",
  },
  errText: { color: theme.colors.error, marginTop: 8, fontSize: 12, fontWeight: "600" },
  successText: { color: theme.colors.success, marginTop: 8, fontSize: 13, fontWeight: "700" },
  howBox: {
    marginTop: 16,
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  howTitle: { fontSize: 14, fontWeight: "800", color: "#fff", marginBottom: 12 },
  step: { flexDirection: "row", alignItems: "center", marginVertical: 6 },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  stepNum: { fontSize: 12, fontWeight: "800", color: "#111" },
  stepText: { fontSize: 13, color: "#fff", flex: 1, lineHeight: 18 },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: 12,
  },
  inviteAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteName: { fontSize: 14, fontWeight: "700", color: "#111" },
  inviteDate: { fontSize: 11, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  inviteBonus: { fontSize: 14, fontWeight: "800", color: theme.colors.success },
});
