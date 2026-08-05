import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, useWindowDimensions } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { MockMap, MapMarker } from "@/src/components/MockMap";
import { api } from "@/src/api";

export default function AdminFleet() {
  const [captains, setCaptains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.adminFleet();
      setCaptains(res.captains);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const online = captains.filter((c) => c.is_online);
  const offline = captains.filter((c) => !c.is_online);

  const markers: MapMarker[] = online.slice(0, 10).map((c, i) => {
    const positions = [
      { x: 0.2, y: 0.3 },
      { x: 0.5, y: 0.25 },
      { x: 0.75, y: 0.35 },
      { x: 0.3, y: 0.5 },
      { x: 0.6, y: 0.5 },
      { x: 0.8, y: 0.6 },
      { x: 0.25, y: 0.7 },
      { x: 0.55, y: 0.75 },
      { x: 0.7, y: 0.8 },
      { x: 0.4, y: 0.4 },
    ];
    return {
      id: c.id,
      x: positions[i].x,
      y: positions[i].y,
      kind: "captain",
      label: c.name?.split(" ")[0] || "Cap",
    };
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.pageTitle}>Live Fleet</Text>
          <Text style={styles.pageSub}>{online.length} captains online · {offline.length} offline</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={load} testID="fleet-refresh">
          <Ionicons name="refresh" size={16} color="#111" />
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.split, isDesktop && { flexDirection: "row" }]}>
        <View style={[styles.mapWrap, isDesktop && { flex: 1.7 }]}>
          <MockMap markers={markers} style={StyleSheet.absoluteFillObject} />
          <View style={styles.mapLegend}>
            <View style={styles.legendDot} />
            <Text style={styles.legendText}>Online captain</Text>
          </View>
        </View>

        <ScrollView
          style={[styles.list, isDesktop && { flex: 1, maxWidth: 380 }]}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          contentContainerStyle={{ padding: 12, gap: 8 }}
        >
          <Text style={styles.listHeader}>Online now ({online.length})</Text>
          {online.length === 0 ? (
            <Text style={styles.emptyText}>No captains online right now.</Text>
          ) : (
            online.map((c) => (
              <CaptainRow key={c.id} c={c} selected={selected === c.id} onSelect={() => setSelected(c.id)} />
            ))
          )}
          {offline.length > 0 && (
            <>
              <Text style={[styles.listHeader, { marginTop: 12 }]}>Offline ({offline.length})</Text>
              {offline.slice(0, 30).map((c) => (
                <CaptainRow key={c.id} c={c} selected={selected === c.id} onSelect={() => setSelected(c.id)} />
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const CaptainRow: React.FC<{ c: any; selected: boolean; onSelect: () => void }> = ({ c, selected, onSelect }) => (
  <TouchableOpacity
    style={[styles.capRow, selected && styles.capRowSel, !c.is_online && { opacity: 0.7 }]}
    onPress={onSelect}
    testID={`captain-${c.id}`}
  >
    <View style={[styles.avatar, c.is_online ? { backgroundColor: "#111" } : { backgroundColor: "#EEE" }]}>
      <MaterialCommunityIcons name="motorbike" size={16} color={c.is_online ? "#F5C518" : "#999"} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.capName}>{c.name || `Captain ${c.phone?.slice(-4)}`}</Text>
      <Text style={styles.capMeta}>
        {c.vehicle_number || "No vehicle"} · +91 {c.phone}
      </Text>
    </View>
    <View style={[styles.statusPill, c.is_online ? styles.pillOn : styles.pillOff]}>
      <View style={[styles.statusDot, { backgroundColor: c.is_online ? theme.colors.success : "#999" }]} />
      <Text style={styles.statusText}>{c.is_online ? "Live" : "Offline"}</Text>
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  pageTitle: { fontSize: 26, fontWeight: "800", color: "#111", letterSpacing: -0.5 },
  pageSub: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  refreshText: { fontSize: 12, fontWeight: "700", color: "#111" },
  split: { flex: 1, gap: 12 },
  mapWrap: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 320,
  },
  mapLegend: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.brandPrimary },
  legendText: { fontSize: 11, fontWeight: "700", color: "#111" },
  list: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border },
  listHeader: { fontSize: 11, fontWeight: "800", color: theme.colors.onSurfaceSecondary, letterSpacing: 0.5, textTransform: "uppercase" },
  emptyText: { fontSize: 12, color: theme.colors.onSurfaceSecondary, fontStyle: "italic", paddingVertical: 8 },
  capRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  capRowSel: { borderWidth: 1, borderColor: theme.colors.brandPrimary },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  capName: { fontSize: 13, fontWeight: "800", color: "#111" },
  capMeta: { fontSize: 11, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillOn: { backgroundColor: "#E7F0E9" },
  pillOff: { backgroundColor: "#EEE" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: "800", color: "#111" },
});
