import React from "react";
import { ViewStyle } from "react-native";
import { MockMap } from "@/src/components/MockMap";
import { LatLng } from "@/src/maps";

export type RideMapProps = {
  pickup?: LatLng | null;
  drop?: LatLng | null;
  captain?: LatLng | null;
  polyline?: string | null;
  style?: ViewStyle;
  mock: React.ComponentProps<typeof MockMap>;
};

// Web preview: react-native-maps is native-only, so always use MockMap.
export const RideMap: React.FC<RideMapProps> = ({ style, mock }) => <MockMap {...mock} style={style} />;
