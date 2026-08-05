import React from "react";
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from "react-native";
import { theme } from "@/src/theme";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  icon?: React.ReactNode;
};

export const Button: React.FC<Props> = ({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
  testID,
  icon,
}) => {
  const bg =
    variant === "primary"
      ? theme.colors.brandPrimary
      : variant === "secondary"
      ? theme.colors.surfaceSecondary
      : variant === "danger"
      ? theme.colors.error
      : "transparent";
  const color =
    variant === "primary" || variant === "danger"
      ? theme.colors.onBrandPrimary
      : theme.colors.onSurface;
  const border =
    variant === "outline"
      ? { borderWidth: 1.5, borderColor: theme.colors.brandPrimary }
      : {};

  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.btn, { backgroundColor: bg }, border, (disabled || loading) && { opacity: 0.5 }, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, { color, marginLeft: icon ? 8 : 0 }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    height: 54,
    borderRadius: theme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: theme.spacing.lg,
  },
  label: {
    fontSize: theme.font.lg,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
