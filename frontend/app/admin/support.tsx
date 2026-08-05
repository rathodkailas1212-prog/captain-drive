import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Modal, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";

export default function AdminSupport() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.adminComplaints();
      setComplaints(res.complaints);
    } catch {}
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = complaints.filter((c) =>
    filter === "open" ? !c.resolved : filter === "resolved" ? c.resolved : true,
  );

  const resolve = async () => {
    if (!selected || !resolution.trim()) return;
    setBusy(true);
    try {
      await api.adminResolveComplaint(selected.id, resolution.trim());
      setSelected(null);
      setResolution("");
      await load();
    } catch {}
    setBusy(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>Support Tickets</Text>
          <Text style={styles.pageSub}>SOS alerts & user complaints — respond fast.</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={{ gap: 8, alignItems: "center" }}>
        {(
          [
            { k: "open" as const, l: `Open (${complaints.filter((c) => !c.resolved).length})` },
            { k: "resolved" as const, l: `Resolved (${complaints.filter((c) => c.resolved).length})` },
            { k: "all" as const, l: "All" },
          ]
        ).map((f) => (
          <TouchableOpacity
            key={f.k}
            style={[styles.chip, filter === f.k && styles.chipOn]}
            onPress={() => setFilter(f.k)}
            testID={`ticket-filter-${f.k}`}
          >
            <Text style={[styles.chipText, filter === f.k && { color: "#fff" }]}>{f.l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ padding: 12, gap: 10 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {filtered.length === 0 && !loading ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle" size={44} color="#CCC" />
            <Text style={styles.emptyText}>No tickets in this bucket.</Text>
          </View>
        ) : (
          filtered.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.ticket, c.resolved && { opacity: 0.7 }]}
              onPress={() => {
                setSelected(c);
                setResolution(c.resolution || "");
              }}
              testID={`ticket-${c.id}`}
            >
              <View style={styles.sevIcon}>
                <Ionicons name="alert-circle" size={20} color={theme.colors.error} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.ticketTitle}>{c.user?.name || `+91 ${c.user?.phone || "unknown"}`}</Text>
                  <View style={styles.rolePill}>
                    <Text style={styles.rolePillText}>{c.user?.role}</Text>
                  </View>
                  {c.resolved ? (
                    <View style={styles.resolvedPill}>
                      <Text style={styles.resolvedPillText}>Resolved</Text>
                    </View>
                  ) : (
                    <View style={styles.openPill}>
                      <Text style={styles.openPillText}>Open</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.ticketMsg} numberOfLines={2}>
                  {c.message || "SOS activated"}
                </Text>
                <Text style={styles.ticketMeta}>
                  {new Date(c.created_at).toLocaleString()} · {c.ride?.pickup_address ? `Ride: ${c.ride.pickup_address}` : "No ride linked"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#777" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ticket details</Text>
              <TouchableOpacity onPress={() => setSelected(null)} testID="ticket-close">
                <Ionicons name="close" size={22} color="#111" />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <View style={styles.tHead}>
                  <View style={styles.tHeadIcon}>
                    <Ionicons name="alert-circle" size={26} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tHeadTitle}>SOS Alert</Text>
                    <Text style={styles.tHeadMeta}>{new Date(selected.created_at).toLocaleString()}</Text>
                  </View>
                  {selected.resolved && (
                    <View style={styles.resolvedPill}>
                      <Text style={styles.resolvedPillText}>Resolved</Text>
                    </View>
                  )}
                </View>

                <View style={styles.detailCard}>
                  <DetailRow label="Reporter" v={`${selected.user?.name || "—"}  ·  +91 ${selected.user?.phone || "—"}  (${selected.user?.role})`} />
                  <DetailRow label="Message" v={selected.message || "—"} />
                  <DetailRow label="Location" v={`${selected.lat?.toFixed(4)}, ${selected.lng?.toFixed(4)}`} />
                  <DetailRow label="Ride" v={selected.ride?.pickup_address ? `${selected.ride.pickup_address} → ${selected.ride.drop_address}` : "N/A"} />
                  {selected.ride?.fare ? <DetailRow label="Fare" v={`₹${selected.ride.fare}`} /> : null}
                  {selected.resolved ? <DetailRow label="Resolution" v={selected.resolution || "—"} /> : null}
                </View>

                {!selected.resolved && (
                  <>
                    <TextInput
                      style={styles.resInput}
                      placeholder="Resolution notes (e.g. Contacted user, false alarm, escalated to authorities)"
                      placeholderTextColor="#999"
                      multiline
                      value={resolution}
                      onChangeText={setResolution}
                      testID="resolution-input"
                    />
                    <Button
                      label={busy ? "Resolving…" : "Mark as Resolved"}
                      onPress={resolve}
                      loading={busy}
                      disabled={!resolution.trim()}
                      testID="resolve-btn"
                    />
                  </>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const DetailRow: React.FC<{ label: string; v: string }> = ({ label, v }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailVal}>{v}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { marginBottom: 12 },
  pageTitle: { fontSize: 26, fontWeight: "800", color: "#111", letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: "#fff", flexShrink: 0 },
  chipRow: { flexGrow: 0, height: 56, marginBottom: 12 },
  chipOn: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#111" },
  list: { flex: 1, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border },
  empty: { alignItems: "center", padding: 40, gap: 10 },
  emptyText: { fontSize: 13, color: theme.colors.onSurfaceSecondary },
  ticket: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12, borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary },
  sevIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#FDECEA",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  ticketTitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  ticketMsg: { fontSize: 12, color: "#111", marginTop: 4 },
  ticketMeta: { fontSize: 11, color: theme.colors.onSurfaceSecondary, marginTop: 4 },
  rolePill: { backgroundColor: "#111", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  rolePillText: { color: "#fff", fontSize: 9, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  openPill: { backgroundColor: theme.colors.error, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  openPillText: { color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  resolvedPill: { backgroundColor: theme.colors.success, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  resolvedPillText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "88%" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: { fontSize: 15, fontWeight: "800", color: "#111" },
  tHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  tHeadIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: theme.colors.error,
    alignItems: "center",
    justifyContent: "center",
  },
  tHeadTitle: { fontSize: 18, fontWeight: "800", color: "#111" },
  tHeadMeta: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  detailCard: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: 12, padding: 12, gap: 8 },
  detailRow: { flexDirection: "column", paddingVertical: 3 },
  detailLabel: { fontSize: 10, fontWeight: "700", color: theme.colors.onSurfaceSecondary, letterSpacing: 0.4, textTransform: "uppercase" },
  detailVal: { fontSize: 13, fontWeight: "600", color: "#111", marginTop: 2 },
  resInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    height: 90,
    textAlignVertical: "top",
    color: "#111",
  },
});
