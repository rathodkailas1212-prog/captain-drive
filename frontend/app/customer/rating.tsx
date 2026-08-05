import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, TextInput, ScrollView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";

const TAGS = ["Polite driving", "Safe route", "Clean bike", "Great music", "Punctual"];

export default function Rating() {
  const router = useRouter();
  const { rideId, method } = useLocalSearchParams<{ rideId: string; method: string }>();
  const [ride, setRide] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getRide(rideId!);
        setRide(res.ride);
      } catch {}
    })();
  }, [rideId]);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.rateRide(rideId!, rating, [...tags, comment].filter(Boolean).join(" · "), method || "cash");
    } catch {}
    router.replace("/customer");
  };

  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  if (!ride) return null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace("/customer")}>
          <Ionicons name="close" size={26} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rate your ride</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View style={styles.capBlock}>
          <Image source={{ uri: ride.captain.photo }} style={styles.capImg} />
          <Text style={styles.capName}>{ride.captain.name}</Text>
          <Text style={styles.capVeh}>{ride.captain.vehicle_number}</Text>
        </View>

        <Text style={styles.question}>How was your ride?</Text>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setRating(n)} testID={`star-${n}`}>
              <Ionicons
                name={n <= rating ? "star" : "star-outline"}
                size={44}
                color={n <= rating ? theme.colors.accent : theme.colors.borderStrong}
                style={{ marginHorizontal: 4 }}
              />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.section}>What went well?</Text>
        <View style={styles.tagRow}>
          {TAGS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tag, tags.includes(t) && styles.tagOn]}
              onPress={() => toggleTag(t)}
              testID={`tag-${t}`}
            >
              <Text style={[styles.tagText, tags.includes(t) && { color: "#fff" }]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.section}>Leave a note (optional)</Text>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="Say thanks or share feedback…"
          multiline
          style={styles.commentBox}
          placeholderTextColor="#999"
          testID="rating-comment"
        />
      </ScrollView>

      <Button label="Submit Rating" onPress={submit} loading={submitting} testID="submit-rating-btn" />
      <TouchableOpacity onPress={() => router.replace("/customer")} style={{ marginTop: 12, alignSelf: "center" }}>
        <Text style={{ color: theme.colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" }}>Skip for now</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingHorizontal: theme.spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 52 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#111" },
  capBlock: { alignItems: "center", marginTop: 16, marginBottom: 12 },
  capImg: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#eee" },
  capName: { fontSize: 20, fontWeight: "800", color: "#111", marginTop: 12 },
  capVeh: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  question: { fontSize: 18, fontWeight: "800", color: "#111", textAlign: "center", marginTop: 24 },
  stars: { flexDirection: "row", justifyContent: "center", marginTop: 12 },
  section: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#777",
    marginTop: 24,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceSecondary,
  },
  tagOn: { backgroundColor: theme.colors.brandPrimary },
  tagText: { fontSize: 13, fontWeight: "600", color: "#111" },
  commentBox: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    height: 90,
    textAlignVertical: "top",
    color: "#111",
  },
});
