import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, TextInput, Modal, useWindowDimensions } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";

type Filter = "all" | "customers" | "captains" | "pending_kyc" | "blocked";

export default function AdminUsers() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<Filter>((params.filter as Filter) === "pending_kyc" ? "pending_kyc" : "all");
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [action, setAction] = useState<"" | "kyc" | "block">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const load = useCallback(async () => {
    setLoading(true);
    const opts: any = {};
    if (filter === "customers") opts.role = "customer";
    else if (filter === "captains") opts.role = "captain";
    else if (filter === "pending_kyc") opts.filter = "pending_kyc";
    else if (filter === "blocked") opts.filter = "blocked";
    if (q.trim()) opts.q = q.trim();
    try {
      const res = await api.adminUsers(opts);
      setUsers(res.users);
    } catch {}
    setLoading(false);
  }, [filter, q]);

  useEffect(() => {
    load();
  }, [load]);

  const kycAction = async (approved: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.adminKYC(selected.id, approved, reason || undefined);
      setSelected(null);
      setReason("");
      setAction("");
      await load();
    } catch {}
    setBusy(false);
  };

  const blockAction = async (block: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.adminBlockUser(selected.id, block, reason || undefined);
      setSelected(null);
      setReason("");
      setAction("");
      await load();
    } catch {}
    setBusy(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>Users & Captains</Text>
          <Text style={styles.pageSub}>Manage customers, captains, and KYC verifications</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="#777" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, phone, vehicle number…"
            placeholderTextColor="#999"
            value={q}
            onChangeText={setQ}
            onSubmitEditing={load}
            returnKeyType="search"
            testID="user-search"
          />
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={{ gap: 8, alignItems: "center" }}>
        {(
          [
            { k: "all", l: "All" },
            { k: "customers", l: "Customers" },
            { k: "captains", l: "Captains" },
            { k: "pending_kyc", l: "Pending KYC" },
            { k: "blocked", l: "Blocked" },
          ] as { k: Filter; l: string }[]
        ).map((f) => (
          <TouchableOpacity
            key={f.k}
            style={[styles.chip, filter === f.k && styles.chipOn]}
            onPress={() => setFilter(f.k)}
            testID={`filter-${f.k}`}
          >
            <Text style={[styles.chipText, filter === f.k && { color: "#fff" }]}>{f.l}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 12, gap: 8 }}
      >
        {users.length === 0 && !loading ? (
          <Text style={styles.emptyText}>No users match this filter.</Text>
        ) : (
          users.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={[styles.userRow, u.blocked && styles.userRowBlocked]}
              onPress={() => setSelected(u)}
              testID={`user-${u.id}`}
            >
              <View style={[styles.avatar, u.role === "captain" ? { backgroundColor: "#111" } : { backgroundColor: "#EEE" }]}>
                {u.role === "captain" ? (
                  <MaterialCommunityIcons name="motorbike" size={16} color="#F5C518" />
                ) : (
                  <Ionicons name="person" size={16} color="#111" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.name}>{u.name || `+91 ${u.phone}`}</Text>
                  {u.role === "captain" && u.kyc_verified && (
                    <Ionicons name="shield-checkmark" size={12} color={theme.colors.success} />
                  )}
                  {u.blocked && (
                    <View style={styles.blockedChip}>
                      <Text style={styles.blockedText}>BLOCKED</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.meta}>
                  {u.role} · +91 {u.phone} {u.vehicle_number ? `· ${u.vehicle_number}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#777" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* User Detail Modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isDesktop && { maxWidth: 520 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>User details</Text>
              <TouchableOpacity onPress={() => setSelected(null)} testID="user-modal-close">
                <Ionicons name="close" size={22} color="#111" />
              </TouchableOpacity>
            </View>
            {selected && (
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <View style={styles.modalUserHead}>
                  <View style={[styles.bigAvatar, selected.role === "captain" ? { backgroundColor: "#111" } : { backgroundColor: theme.colors.accent }]}>
                    {selected.role === "captain" ? (
                      <MaterialCommunityIcons name="motorbike" size={30} color="#F5C518" />
                    ) : (
                      <Ionicons name="person" size={28} color="#111" />
                    )}
                  </View>
                  <View>
                    <Text style={styles.modalUserName}>{selected.name || "Unnamed"}</Text>
                    <Text style={styles.modalUserMeta}>+91 {selected.phone} · {selected.role}</Text>
                    {selected.blocked ? <Text style={styles.blockedNote}>Blocked{selected.blocked_reason ? `: ${selected.blocked_reason}` : ""}</Text> : null}
                  </View>
                </View>

                {selected.role === "captain" && (
                  <View style={styles.kycBlock}>
                    <View style={styles.kycRow}>
                      <Text style={styles.kycLabel}>KYC Status</Text>
                      <View style={[styles.kycChip, selected.kyc_verified ? styles.kycOn : styles.kycOff]}>
                        <Ionicons name={selected.kyc_verified ? "shield-checkmark" : "shield-half"} size={12} color={selected.kyc_verified ? "#fff" : "#111"} />
                        <Text style={[styles.kycChipText, selected.kyc_verified && { color: "#fff" }]}>
                          {selected.kyc_verified ? "Verified" : "Pending"}
                        </Text>
                      </View>
                    </View>
                    <DocRow label="Aadhaar" v={selected.aadhaar} />
                    <DocRow label="Driving License" v={selected.driving_license} />
                    <DocRow label="Vehicle RC" v={selected.vehicle_rc} />
                    {selected.vehicle_number ? <DocRow label="Vehicle" v={selected.vehicle_number} /> : null}
                  </View>
                )}

                <View style={styles.stats}>
                  <StatItem label="Total rides" value={`${selected.total_rides || 0}`} />
                  <StatItem label="Rating" value={`★ ${(selected.rating || 4.8).toFixed(1)}`} />
                  {selected.role === "captain" && (
                    <StatItem label="Earnings" value={`₹${(selected.total_earnings || 0).toFixed(0)}`} />
                  )}
                  {selected.role === "customer" && (
                    <StatItem label="Wallet" value={`₹${(selected.wallet_balance || 0).toFixed(0)}`} />
                  )}
                </View>

                {action ? (
                  <View style={{ gap: 10 }}>
                    <TextInput
                      style={styles.reasonInput}
                      placeholder="Reason (optional)"
                      placeholderTextColor="#999"
                      value={reason}
                      onChangeText={setReason}
                      testID="action-reason"
                    />
                    {action === "kyc" && !selected.kyc_verified && (
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Button label="Approve KYC" onPress={() => kycAction(true)} loading={busy} style={{ flex: 1 }} testID="kyc-approve" />
                        <Button label="Reject" variant="danger" onPress={() => kycAction(false)} loading={busy} style={{ flex: 1 }} testID="kyc-reject" />
                      </View>
                    )}
                    {action === "block" && (
                      <Button
                        label={selected.blocked ? "Unblock user" : "Block user"}
                        variant="danger"
                        onPress={() => blockAction(!selected.blocked)}
                        loading={busy}
                        testID="block-confirm"
                      />
                    )}
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => { setAction(""); setReason(""); }}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {selected.role === "captain" && !selected.kyc_verified && (
                      <ActionBtn icon="shield-checkmark" label="Review KYC" onPress={() => setAction("kyc")} testID="open-kyc" />
                    )}
                    <ActionBtn
                      icon={selected.blocked ? "checkmark-circle" : "ban"}
                      label={selected.blocked ? "Unblock" : "Block"}
                      onPress={() => setAction("block")}
                      testID="open-block"
                      danger={!selected.blocked}
                    />
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const DocRow: React.FC<{ label: string; v?: string }> = ({ label, v }) => (
  <View style={styles.docRow}>
    <Text style={styles.docLabel}>{label}</Text>
    <Text style={[styles.docVal, !v && { color: theme.colors.onSurfaceTertiary, fontStyle: "italic" }]}>{v || "Not uploaded"}</Text>
  </View>
);

const StatItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.statItem}>
    <Text style={styles.statLbl}>{label}</Text>
    <Text style={styles.statVal}>{value}</Text>
  </View>
);

const ActionBtn: React.FC<{ icon: any; label: string; onPress: () => void; testID: string; danger?: boolean }> = ({ icon, label, onPress, testID, danger }) => (
  <TouchableOpacity style={[styles.actionBtn, danger && { backgroundColor: "#FDECEA" }]} onPress={onPress} testID={testID}>
    <Ionicons name={icon} size={16} color={danger ? theme.colors.error : "#111"} />
    <Text style={[styles.actionText, danger && { color: theme.colors.error }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { marginBottom: 12 },
  pageTitle: { fontSize: 26, fontWeight: "800", color: "#111", letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  controls: { marginBottom: 12 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#111", fontWeight: "600" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: "#fff", flexShrink: 0 },
  chipRow: { flexGrow: 0, height: 56, marginBottom: 12 },
  chipOn: { backgroundColor: "#111", borderColor: "#111" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#111" },
  list: { flex: 1, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border },
  emptyText: { fontSize: 13, color: theme.colors.onSurfaceSecondary, textAlign: "center", padding: 24 },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  userRowBlocked: { opacity: 0.6 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: "800", color: "#111" },
  meta: { fontSize: 11, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  blockedChip: { backgroundColor: "#FDECEA", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  blockedText: { fontSize: 9, fontWeight: "800", color: theme.colors.error, letterSpacing: 0.5 },
  // Modal
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "88%", alignSelf: "stretch" },
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
  modalUserHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  bigAvatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  modalUserName: { fontSize: 18, fontWeight: "800", color: "#111" },
  modalUserMeta: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  blockedNote: { fontSize: 12, color: theme.colors.error, marginTop: 4, fontWeight: "700" },
  kycBlock: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  kycRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  kycLabel: { fontSize: 12, fontWeight: "800", color: "#111" },
  kycChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  kycOn: { backgroundColor: theme.colors.success },
  kycOff: { backgroundColor: theme.colors.accent },
  kycChipText: { fontSize: 11, fontWeight: "800", color: "#111" },
  docRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  docLabel: { fontSize: 12, color: theme.colors.onSurfaceSecondary, fontWeight: "600" },
  docVal: { fontSize: 12, fontWeight: "700", color: "#111", maxWidth: 220, textAlign: "right" },
  stats: { flexDirection: "row", gap: 8 },
  statItem: { flex: 1, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 12, padding: 12 },
  statLbl: { fontSize: 10, color: theme.colors.onSurfaceSecondary, fontWeight: "700", letterSpacing: 0.4 },
  statVal: { fontSize: 16, fontWeight: "800", color: "#111", marginTop: 4 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  actionText: { fontSize: 12, fontWeight: "800", color: "#111" },
  reasonInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 13,
    color: "#111",
  },
  cancelBtn: { alignItems: "center", padding: 10 },
  cancelText: { fontSize: 13, color: theme.colors.onSurfaceSecondary, fontWeight: "700" },
});
