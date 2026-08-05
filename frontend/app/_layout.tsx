import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { LogBox, StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { bootstrapAuth } from "@/src/auth";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync().catch(() => {});

// Safety cap: proceed even if font loading hangs or fails
const FONT_LOAD_TIMEOUT_MS = 8000;

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    bootstrapAuth();
  }, []);

  // Fallback: hide splash + proceed even if useFonts stalls / fails silently
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), FONT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (loaded || error || timedOut) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded, error, timedOut]);

  if (!loaded && !error && !timedOut) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
