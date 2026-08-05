import React, { useEffect } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { useRouter } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { useAuth } from "@/src/auth";

export default function Splash() {
  const router = useRouter();
  const { loading, user, hasSeenOnboarding } = useAuth();

  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withTiming(1, { duration: 700 });
    opacity.value = withDelay(200, withTiming(1, { duration: 600 }));
  }, [scale, opacity]);

  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      if (user) {
        if (user.role === "admin") router.replace("/admin");
        else if (user.role === "captain") router.replace("/captain");
        else router.replace("/customer");
      } else if (!hasSeenOnboarding) {
        router.replace("/onboarding");
      } else {
        router.replace("/role-select");
      }
    }, 1400);
    return () => clearTimeout(t);
  }, [loading, user, hasSeenOnboarding, router]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.container} testID="splash-screen">
      <Animated.View style={[styles.logoWrap, iconStyle]}>
        <View style={styles.logo}>
          <MaterialCommunityIcons name="motorbike" size={54} color="#111" />
        </View>
      </Animated.View>
      <Animated.View style={textStyle}>
        <Text style={styles.brand}>ZipRide</Text>
        <Text style={styles.tag}>Fast. Reliable. Right at your fingertips.</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: { marginBottom: 24 },
  logo: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    color: "#fff",
    fontSize: 44,
    fontWeight: "800",
    letterSpacing: -1,
    textAlign: "center",
  },
  tag: {
    color: "#BBB",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
    letterSpacing: 0.2,
  },
});
