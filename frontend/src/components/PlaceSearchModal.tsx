import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { api } from "@/src/api";
import { getCurrentPlace } from "@/src/maps";

export type Place = { name: string; address: string; lat: number; lng: number };

type Props = {
  visible: boolean;
  target: "pickup" | "drop";
  onClose: () => void;
  onSelect: (p: Place) => void;
};

const newToken = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

export const PlaceSearchModal: React.FC<Props> = ({ visible, target, onClose, onSelect }) => {
  const [query, setQuery] = useState("");
  const [local, setLocal] = useState<any[]>([]);
  const [google, setGoogle] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualText, setManualText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const token = useRef(newToken());

  useEffect(() => {
    if (visible) {
      setQuery("");
      setManualText(null);
      setNotice(null);
      token.current = newToken();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.searchPlaces(query, query.trim().length >= 2 ? token.current : undefined, 500);
        setLocal(res.local || []);
        setGoogle(res.google || []);
      } catch {
        setNotice("Couldn't load places. Check your connection.");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, visible]);

  const pick = (p: Place) => {
    token.current = newToken();
    onSelect(p);
  };

  const pickLocal = (v: any) => {
    const area = `${v.name}, ${v.district}`;
    pick({
      name: manualText ? manualText : v.name,
      address: manualText ? `${manualText}, near ${area}` : area,
      lat: v.lat,
      lng: v.lng,
    });
  };

  const pickGoogle = async (g: any) => {
    setBusy(true);
    try {
      const d = await api.placeDetails(g.place_id, token.current);
      if (d.lat != null && d.lng != null) pick({ name: d.name || g.name, address: d.address || g.name, lat: d.lat, lng: d.lng });
    } catch {
      setNotice("Couldn't fetch that place. Please choose a village from the list.");
    } finally {
      setBusy(false);
    }
  };

  const useMyLocation = async () => {
    setBusy(true);
    const p = await getCurrentPlace();
    setBusy(false);
    if (p) pick(p);
    else setNotice("Location not available — type your address or pick your village below.");
  };

  const useManual = async () => {
    const text = query.trim();
    setBusy(true);
    try {
      const g = await api.geocode(text);
      if (g.result) {
        pick({ name: text, address: g.result.address, lat: g.result.lat, lng: g.result.lng });
        return;
      }
    } catch {}
    finally {
      setBusy(false);
    }
    setManualText(text);
    setQuery("");
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} testID="close-search" style={styles.backBtn}>
              <Ionicons name="chevron-back" size={26} color={theme.colors.onSurface} />
            </TouchableOpacity>
            <Text style={styles.title}>{target === "pickup" ? "Set pickup" : "Set destination"}</Text>
            <View style={{ width: 44 }} />
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color={theme.colors.onSurface} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={manualText ? "Search nearest village…" : "Search village, area, landmark…"}
              style={styles.input}
              placeholderTextColor={theme.colors.onSurfaceTertiary}
              autoFocus
              testID="place-search-input"
            />
            {(loading || busy) && <ActivityIndicator size="small" color={theme.colors.onSurface} />}
          </View>

          {manualText && (
            <View style={styles.banner} testID="manual-banner">
              <Ionicons name="information-circle" size={18} color={theme.colors.onSurface} />
              <Text style={styles.bannerText}>
                Pick the nearest village for “{manualText}” so we can calculate distance & fare.
              </Text>
            </View>
          )}
          {notice && !manualText && <Text style={styles.notice}>{notice}</Text>}

          <FlatList
            data={local}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }}
            ListHeaderComponent={
              <>
                {target === "pickup" && !manualText && (
                  <Row icon="navigate" title="Use my location" sub="Set pickup from GPS" onPress={useMyLocation} testID="use-my-location" />
                )}
                {query.trim().length >= 3 && !manualText && (
                  <Row icon="create-outline" title={`Use “${query.trim()}”`} sub="Enter this address manually" onPress={useManual} testID="manual-address" />
                )}
                {google.map((g) => (
                  <Row key={g.place_id} icon="logo-google" title={g.name} sub={g.address} onPress={() => pickGoogle(g)} testID={`g-${g.place_id}`} />
                ))}
                {local.length > 0 && <Text style={styles.section}>Pickup points & villages near Ambajogai</Text>}
              </>
            }
            renderItem={({ item }) => (
              <Row
                icon={
                  item.type === "landmark"
                    ? ({ bus: "bus", rail: "train", temple: "flower", religious: "flower", hospital: "medkit", education: "school" } as any)[item.category] || "business"
                    : item.type === "town" ? "home" : "location"
                }
                title={item.name}
                sub={`${item.name_local ? item.name_local + " · " : ""}${item.district}`}
                right={`${item.distance_from_ambajogai_km} km`}
                onPress={() => pickLocal(item)}
                testID={`dest-${item.name}`}
              />
            )}
            ListEmptyComponent={
              !loading ? (
                <Text style={styles.notice}>No village found. Use “Enter this address manually” above.</Text>
              ) : null
            }
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const Row: React.FC<{ icon: any; title: string; sub?: string; right?: string; onPress: () => void; testID: string }> = ({
  icon, title, sub, right, onPress, testID,
}) => (
  <TouchableOpacity style={styles.row} onPress={onPress} testID={testID}>
    <View style={styles.rowIcon}>
      <Ionicons name={icon} size={18} color={theme.colors.onSurface} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
      {!!sub && <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>}
    </View>
    {!!right && <Text style={styles.rowRight}>{right}</Text>}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8, height: 52 },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 17, fontWeight: "800", color: theme.colors.onSurface },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.surfaceSecondary,
    marginHorizontal: 16,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 54,
    marginBottom: 8,
  },
  input: { flex: 1, fontSize: 15, color: theme.colors.onSurface, fontWeight: "600" },
  banner: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.accent,
    marginBottom: 4,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: "600", color: theme.colors.onSurface },
  notice: { marginHorizontal: 20, marginVertical: 8, fontSize: 13, color: theme.colors.onSurfaceSecondary },
  section: {
    fontSize: 12, fontWeight: "700", color: theme.colors.onSurfaceTertiary,
    marginTop: 14, marginBottom: 2, letterSpacing: 0.5, textTransform: "uppercase",
  },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: 12 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700", color: theme.colors.onSurface },
  rowSub: { fontSize: 12, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  rowRight: { fontSize: 13, fontWeight: "700", color: theme.colors.onSurfaceSecondary },
});
