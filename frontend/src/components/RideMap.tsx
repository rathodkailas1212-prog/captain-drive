import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { MockMap } from "@/src/components/MockMap";
import { decodePolyline, GOOGLE_MAPS_ENABLED, LatLng, SERVICE_CENTER } from "@/src/maps";

export type RideMapProps = {
  pickup?: LatLng | null;
  drop?: LatLng | null;
  captain?: LatLng | null;
  polyline?: string | null;
  style?: ViewStyle;
  // Props forwarded to MockMap when Google Maps is not enabled
  mock: React.ComponentProps<typeof MockMap>;
};

// Native: real Google Map when keys are configured, otherwise the existing MockMap.
export const RideMap: React.FC<RideMapProps> = ({ pickup, drop, captain, polyline, style, mock }) => {
  const mapRef = useRef<MapView>(null);
  const path = useMemo(() => {
    if (polyline) return decodePolyline(polyline);
    if (pickup && drop) return [pickup, drop];
    return [];
  }, [polyline, pickup, drop]);

  useEffect(() => {
    if (!GOOGLE_MAPS_ENABLED) return;
    const pts = [pickup, drop, captain].filter(Boolean) as LatLng[];
    if (pts.length > 1) {
      mapRef.current?.fitToCoordinates(
        pts.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: { top: 120, right: 60, bottom: 380, left: 60 }, animated: true },
      );
    }
  }, [pickup, drop, captain]);

  if (!GOOGLE_MAPS_ENABLED) return <MockMap {...mock} style={style} />;

  const center = pickup || SERVICE_CENTER;
  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: 0.06, longitudeDelta: 0.06 }}
        toolbarEnabled={false}
      >
        {pickup && (
          <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} title="Pickup">
            <Pin color={theme.colors.success} icon={<Ionicons name="location" size={14} color="#fff" />} />
          </Marker>
        )}
        {drop && (
          <Marker coordinate={{ latitude: drop.lat, longitude: drop.lng }} title="Drop">
            <Pin color={theme.colors.error} icon={<Ionicons name="flag" size={14} color="#fff" />} />
          </Marker>
        )}
        {captain && (
          <Marker coordinate={{ latitude: captain.lat, longitude: captain.lng }} title="Captain">
            <Pin color={theme.colors.brandPrimary} icon={<MaterialCommunityIcons name="motorbike" size={16} color="#fff" />} />
          </Marker>
        )}
        {path.length > 1 && (
          <Polyline
            coordinates={path.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={theme.colors.brandPrimary}
            strokeWidth={5}
          />
        )}
      </MapView>
    </View>
  );
};

const Pin: React.FC<{ color: string; icon: React.ReactNode }> = ({ color, icon }) => (
  <View style={[styles.pin, { backgroundColor: color }]}>{icon}</View>
);

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.colors.mapBg, overflow: "hidden" },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
});
