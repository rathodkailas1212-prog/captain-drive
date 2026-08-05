import React, { useEffect, useMemo } from "react";
import { StyleSheet, View, Text, Dimensions, ViewStyle } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { theme } from "@/src/theme";

const { width } = Dimensions.get("window");

export type MapMarker = {
  id: string;
  x: number; // 0..1 relative
  y: number; // 0..1 relative
  kind?: "user" | "captain" | "pickup" | "drop";
  label?: string;
};

type Props = {
  markers?: MapMarker[];
  showRoute?: boolean;
  routeFrom?: { x: number; y: number };
  routeTo?: { x: number; y: number };
  animateCaptain?: boolean;
  captainProgress?: number; // 0..1 along route
  style?: ViewStyle;
  showRadar?: boolean;
};

const PulsingRadar = () => {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withTiming(0, { duration: 1800, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    scale.value = 0;
    opacity.value = 0.5;
    scale.value = withRepeat(withTiming(1, { duration: 1800 }), -1, false);
    opacity.value = withRepeat(withTiming(0, { duration: 1800 }), -1, false);
  }, [scale, opacity]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.4 + scale.value * 1.6 }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: 220,
          height: 220,
          borderRadius: 110,
          backgroundColor: theme.colors.brandPrimary,
        },
        style,
      ]}
    />
  );
};

// A stylized non-native map. Draws faux roads + green blocks. Works everywhere.
export const MockMap: React.FC<Props> = ({
  markers = [],
  showRoute,
  routeFrom,
  routeTo,
  style,
  showRadar,
}) => {
  const roads = useMemo(() => {
    // deterministic pseudo road grid
    return {
      horiz: [0.18, 0.34, 0.55, 0.72, 0.88],
      vert: [0.15, 0.32, 0.5, 0.68, 0.84],
    };
  }, []);

  return (
    <View style={[styles.map, style]}>
      {/* Base */}
      <View style={StyleSheet.absoluteFill}>
        <View style={{ flex: 1, backgroundColor: theme.colors.mapBg }} />
      </View>

      {/* Green blocks */}
      {[
        { top: "5%", left: "5%", w: 90, h: 60 },
        { top: "22%", left: "60%", w: 120, h: 80 },
        { top: "48%", left: "10%", w: 80, h: 70 },
        { top: "65%", left: "55%", w: 130, h: 90 },
        { top: "80%", left: "8%", w: 70, h: 50 },
      ].map((b, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            top: b.top as any,
            left: b.left as any,
            width: b.w,
            height: b.h,
            backgroundColor: theme.colors.mapAccent,
            borderRadius: 8,
            opacity: 0.85,
          }}
        />
      ))}

      {/* Roads horizontal */}
      {roads.horiz.map((y, i) => (
        <View
          key={`h${i}`}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${y * 100}%`,
            height: i % 2 === 0 ? 8 : 4,
            backgroundColor: theme.colors.mapRoad,
          }}
        />
      ))}
      {/* Roads vertical */}
      {roads.vert.map((x, i) => (
        <View
          key={`v${i}`}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${x * 100}%`,
            width: i % 2 === 0 ? 8 : 4,
            backgroundColor: theme.colors.mapRoad,
          }}
        />
      ))}

      {/* Route line (approx as two rectangles) */}
      {showRoute && routeFrom && routeTo && (
        <RouteLine from={routeFrom} to={routeTo} />
      )}

      {/* Radar */}
      {showRadar &&
        markers.find((m) => m.kind === "user") && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: `${(markers.find((m) => m.kind === "user")!.x) * 100}%`,
              top: `${(markers.find((m) => m.kind === "user")!.y) * 100}%`,
              transform: [{ translateX: -110 }, { translateY: -110 }],
            }}
          >
            <PulsingRadar />
          </View>
        )}

      {/* Markers */}
      {markers.map((m) => (
        <Marker key={m.id} marker={m} />
      ))}
    </View>
  );
};

const RouteLine: React.FC<{ from: { x: number; y: number }; to: { x: number; y: number } }> = ({
  from,
  to,
}) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: `${from.x * 100}%`,
        top: `${from.y * 100}%`,
        width: `${length * 100}%`,
        height: 5,
        backgroundColor: theme.colors.brandPrimary,
        borderRadius: 3,
        transform: [{ translateY: -2 }, { rotateZ: `${angle}deg` }],
        transformOrigin: "0% 50%",
      }}
    />
  );
};

const Marker: React.FC<{ marker: MapMarker }> = ({ marker }) => {
  const bg =
    marker.kind === "user"
      ? theme.colors.brandPrimary
      : marker.kind === "pickup"
      ? theme.colors.success
      : marker.kind === "drop"
      ? theme.colors.error
      : theme.colors.brandPrimary;

  const icon =
    marker.kind === "captain" ? (
      <MaterialCommunityIcons name="motorbike" size={16} color="#fff" />
    ) : marker.kind === "user" ? (
      <Ionicons name="person" size={14} color="#fff" />
    ) : marker.kind === "pickup" ? (
      <Ionicons name="location" size={14} color="#fff" />
    ) : marker.kind === "drop" ? (
      <Ionicons name="flag" size={14} color="#fff" />
    ) : (
      <View />
    );

  return (
    <View
      style={{
        position: "absolute",
        left: `${marker.x * 100}%`,
        top: `${marker.y * 100}%`,
        transform: [{ translateX: -18 }, { translateY: -18 }],
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 3,
          borderColor: "#FFFFFF",
          ...theme.shadow.fab,
        }}
      >
        {icon}
      </View>
      {marker.label ? (
        <View
          style={{
            marginTop: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
            backgroundColor: "#111",
            borderRadius: 6,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "600" }}>{marker.label}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  map: {
    flex: 1,
    backgroundColor: theme.colors.mapBg,
    overflow: "hidden",
  },
});
