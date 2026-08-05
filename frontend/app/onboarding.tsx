import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { useAuth } from "@/src/auth";

const { width } = Dimensions.get("window");

const slides = [
  {
    icon: "map-marker-radius" as const,
    title: "Book a ZipBike\nin seconds",
    body:
      "Tap where you want to go and we'll match you with a nearby captain instantly.",
    color: theme.colors.accent,
  },
  {
    icon: "package-variant" as const,
    title: "Send parcels\nacross town",
    body:
      "ZipDelivery gets your packages to their destination fast and safe.",
    color: "#E7F0E9",
  },
  {
    icon: "shield-check" as const,
    title: "Safe rides,\nevery time",
    body:
      "Live tracking, ride OTP, and an SOS button — because your safety comes first.",
    color: "#FCE9CC",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const [idx, setIdx] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const { markOnboarded } = useAuth();

  const goNext = async () => {
    if (idx < slides.length - 1) {
      const n = idx + 1;
      setIdx(n);
      scrollRef.current?.scrollTo({ x: width * n, animated: true });
    } else {
      await markOnboarded();
      router.replace("/role-select");
    }
  };

  const skip = async () => {
    await markOnboarded();
    router.replace("/role-select");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        <Text style={styles.logo}>ZipRide</Text>
        <TouchableOpacity onPress={skip} testID="onboarding-skip">
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          setIdx(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        style={{ flexGrow: 0 }}
      >
        {slides.map((s, i) => (
          <View style={styles.slide} key={i}>
            <View style={[styles.illust, { backgroundColor: s.color }]}>
              <MaterialCommunityIcons name={s.icon} size={110} color="#111" />
            </View>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === idx && { backgroundColor: theme.colors.brandPrimary, width: 24 },
            ]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Button
          label={idx === slides.length - 1 ? "Get Started" : "Next"}
          onPress={goNext}
          testID="onboarding-next-btn"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  logo: { fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  skip: { color: theme.colors.onSurfaceSecondary, fontSize: 15, fontWeight: "600" },
  slide: { width, paddingHorizontal: theme.spacing.xl, alignItems: "center", paddingTop: 20 },
  illust: {
    width: width - 48,
    height: 300,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: theme.colors.onSurface,
    textAlign: "center",
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  body: {
    fontSize: 16,
    color: theme.colors.onSurfaceSecondary,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    marginVertical: 20,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.surfaceTertiary,
  },
  footer: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg },
});
