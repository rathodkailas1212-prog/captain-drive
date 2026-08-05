import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, useWindowDimensions } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";

export default function AdminFares() {
  const [config, setConfig] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string>("");
  const [savedMsg, setSavedMsg] = useState("");
  const [err, setErr] = useState("");
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.adminGetFareConfig();
      setConfig(res.fare_config);
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const updateField = (svc: string, key: string, value: string) => {
    const num = key === "commission_pct" ? parseFloat(value) : parseFloat(value);
    setConfig((prev: any) => ({
      ...prev,
      [svc]: { ...prev[svc], [key]: isNaN(num) ? 0 : num },
    }));
  };

  const save = async (svc: string) => {
    if (!config) return;
    setSaving(svc);
    setErr("");
    setSavedMsg("");
    try {
      const c = config[svc];
      const res = await api.adminUpdateFareConfig({
        service_type: svc as any,
        base: c.base,
        per_km: c.per_km,
        min: c.min,
        commission_pct: c.commission_pct,
      });
      setConfig(res.fare_config);
      setSavedMsg(`${svc} config saved ✓`);
      setTimeout(() => setSavedMsg(""), 3000);
    } catch (e: any) {
      setErr(e.message || "Save failed");
    }
    setSaving("");
  };

  if (!config) {
    return (
      <View style={styles.container}>
        <Text style={styles.pageTitle}>Fare & Commission</Text>
        <Text style={styles.emptyText}>{loading ? "Loading fare config…" : "No fare config"}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>Fare & Commission</Text>
          <Text style={styles.pageSub}>Tune base fare, per-km rate, minimum, and platform commission per service.</Text>
        </View>
      </View>

      {err ? <Text style={styles.errText} testID="fare-err">{err}</Text> : null}
      {savedMsg ? <Text style={styles.saveMsg} testID="fare-saved">{savedMsg}</Text> : null}

      <View style={[styles.grid, isDesktop && { flexDirection: "row" }]}>
        {Object.entries(config).map(([svc, cfg]: any) => (
          <View key={svc} style={[styles.card, isDesktop && { flex: 1 }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIcon}>
                <MaterialCommunityIcons name={svc === "ZipDelivery" ? "package-variant" : "motorbike"} size={22} color="#111" />
              </View>
              <View>
                <Text style={styles.cardTitle}>{svc}</Text>
                <Text style={styles.cardSub}>Rate structure & commission</Text>
              </View>
            </View>

            <FormRow label="Base fare (₹)" value={cfg.base} onChange={(v) => updateField(svc, "base", v)} testID={`base-${svc}`} />
            <FormRow label="Per KM (₹)" value={cfg.per_km} onChange={(v) => updateField(svc, "per_km", v)} testID={`perkm-${svc}`} />
            <FormRow label="Minimum fare (₹)" value={cfg.min} onChange={(v) => updateField(svc, "min", v)} testID={`min-${svc}`} />
            <FormRow label="Commission (%)" value={cfg.commission_pct ?? 0} onChange={(v) => updateField(svc, "commission_pct", v)} testID={`comm-${svc}`} />

            <View style={styles.exampleBlock}>
              <Text style={styles.exampleLabel}>Fare estimate for 5 km</Text>
              <Text style={styles.exampleValue}>
                ₹{Math.max(cfg.base + cfg.per_km * 5, cfg.min).toFixed(2)}
                <Text style={styles.exampleMeta}>  · Commission ₹{(Math.max(cfg.base + cfg.per_km * 5, cfg.min) * (cfg.commission_pct || 0) / 100).toFixed(2)}</Text>
              </Text>
            </View>

            <Button
              label={`Save ${svc}`}
              onPress={() => save(svc)}
              loading={saving === svc}
              testID={`save-${svc}`}
              style={{ marginTop: 12 }}
            />
          </View>
        ))}
      </View>

      <View style={styles.tip}>
        <Ionicons name="information-circle" size={18} color="#111" />
        <Text style={styles.tipText}>
          Changes take effect immediately for new rides. Historical rides keep the fare that was quoted at booking time.
        </Text>
      </View>
    </ScrollView>
  );
}

const FormRow: React.FC<{ label: string; value: number; onChange: (v: string) => void; testID: string }> = ({ label, value, onChange, testID }) => (
  <View style={styles.formRow}>
    <Text style={styles.formLabel}>{label}</Text>
    <TextInput
      style={styles.formInput}
      value={String(value)}
      onChangeText={onChange}
      keyboardType="decimal-pad"
      testID={testID}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { padding: 20, gap: 16 },
  header: { marginBottom: 4 },
  pageTitle: { fontSize: 26, fontWeight: "800", color: "#111", letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 4 },
  emptyText: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 12 },
  errText: { color: theme.colors.error, fontWeight: "700", fontSize: 13 },
  saveMsg: { color: theme.colors.success, fontWeight: "700", fontSize: 13 },
  grid: { gap: 12 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: theme.colors.border },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#111" },
  cardSub: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  formRow: { marginBottom: 10 },
  formLabel: { fontSize: 11, fontWeight: "700", color: theme.colors.onSurfaceSecondary, letterSpacing: 0.4, textTransform: "uppercase" },
  formInput: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
    backgroundColor: theme.colors.surfaceSecondary,
  },
  exampleBlock: {
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  exampleLabel: { fontSize: 10, color: "#BBB", fontWeight: "700", letterSpacing: 0.5 },
  exampleValue: { fontSize: 20, color: "#fff", fontWeight: "800", marginTop: 2 },
  exampleMeta: { fontSize: 11, color: "#F5C518", fontWeight: "700" },
  tip: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    backgroundColor: theme.colors.brandTertiary,
    borderRadius: 12,
    alignItems: "flex-start",
  },
  tipText: { flex: 1, fontSize: 12, color: "#111", lineHeight: 18 },
});
