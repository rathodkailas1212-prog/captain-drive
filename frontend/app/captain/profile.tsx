import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { theme } from "@/src/theme";
import { Button } from "@/src/components/Button";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function Profile() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [vehicleNumber, setVehicleNumber] = useState(user?.vehicle_number || "");
  const [vehicleType, setVehicleType] = useState<"ZipBike" | "ZipDelivery">((user?.vehicle_type as any) || "ZipBike");
  const [aadhaar, setAadhaar] = useState<string>("");
  const [dl, setDl] = useState<string>("");
  const [rc, setRc] = useState<string>("");
  const [aadhaarUploaded, setAadhaarUploaded] = useState(false);
  const [dlUploaded, setDlUploaded] = useState(false);
  const [rcUploaded, setRcUploaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setVehicleNumber(user.vehicle_number || "");
      setVehicleType((user.vehicle_type as any) || "ZipBike");
      setAadhaarUploaded(!!(user as any).aadhaar);
      setDlUploaded(!!(user as any).driving_license);
      setRcUploaded(!!(user as any).vehicle_rc);
    }
  }, [user]);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateProfile({
        name,
        vehicle_number: vehicleNumber,
        vehicle_type: vehicleType,
        aadhaar: aadhaar || (aadhaarUploaded ? "verified" : undefined),
        driving_license: dl || (dlUploaded ? "verified" : undefined),
        vehicle_rc: rc || (rcUploaded ? "verified" : undefined),
      });
      await refresh();
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    } catch (e) {
      console.log(e);
    }
    setSaving(false);
  };

  const upload = (doc: "aadhaar" | "dl" | "rc") => {
    // MOCKED file upload
    if (doc === "aadhaar") {
      setAadhaar(`aadhaar-doc-${Date.now()}`);
      setAadhaarUploaded(true);
    }
    if (doc === "dl") {
      setDl(`dl-doc-${Date.now()}`);
      setDlUploaded(true);
    }
    if (doc === "rc") {
      setRc(`rc-doc-${Date.now()}`);
      setRcUploaded(true);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarBlock}>
            <View style={styles.avatar}>
              <MaterialCommunityIcons name="motorbike" size={40} color="#F5C518" />
            </View>
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={styles.name}>{name || "Captain"}</Text>
              <Text style={styles.phone}>+91 {user?.phone}</Text>
              <View style={styles.kycRow}>
                <Ionicons
                  name={user?.kyc_verified ? "shield-checkmark" : "shield-outline"}
                  size={14}
                  color={user?.kyc_verified ? theme.colors.success : "#777"}
                />
                <Text style={[styles.kycText, { color: user?.kyc_verified ? theme.colors.success : "#777" }]}>
                  {user?.kyc_verified ? "KYC Verified" : "KYC Pending"}
                </Text>
              </View>
            </View>
          </View>

          <Text style={styles.section}>Personal details</Text>
          <Field label="Full name">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#999"
              testID="profile-name"
            />
          </Field>
          <Field label="Vehicle number">
            <TextInput
              style={styles.input}
              value={vehicleNumber}
              onChangeText={(t) => setVehicleNumber(t.toUpperCase())}
              placeholder="KA-01-AB-1234"
              placeholderTextColor="#999"
              autoCapitalize="characters"
              testID="profile-vehicle-number"
            />
          </Field>
          <Field label="Vehicle type">
            <View style={styles.pickerRow}>
              {(["ZipBike", "ZipDelivery"] as const).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.pickerChip, vehicleType === v && styles.pickerChipOn]}
                  onPress={() => setVehicleType(v)}
                  testID={`vehicle-type-${v}`}
                >
                  <Text style={[styles.pickerText, vehicleType === v && { color: "#fff" }]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          <Text style={styles.section}>Document verification</Text>
          <DocCard title="Aadhaar Card" desc="Government ID for background check" uploaded={aadhaarUploaded} onUpload={() => upload("aadhaar")} testID="upload-aadhaar" />
          <DocCard title="Driving License" desc="Valid two-wheeler license" uploaded={dlUploaded} onUpload={() => upload("dl")} testID="upload-dl" />
          <DocCard title="Vehicle RC" desc="Registration certificate" uploaded={rcUploaded} onUpload={() => upload("rc")} testID="upload-rc" />

          <Button testID="save-profile-btn" label="Save Profile" onPress={save} loading={saving} style={{ marginTop: 20 }} />
          {savedMsg && <Text style={styles.savedMsg}>✓ Profile saved</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <View style={{ marginBottom: 12 }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {children}
  </View>
);

const DocCard: React.FC<{ title: string; desc: string; uploaded: boolean; onUpload: () => void; testID: string }> = ({
  title,
  desc,
  uploaded,
  onUpload,
  testID,
}) => (
  <View style={styles.doc}>
    <View style={styles.docIcon}>
      <Ionicons name={uploaded ? "checkmark-circle" : "document"} size={24} color={uploaded ? theme.colors.success : "#111"} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.docTitle}>{title}</Text>
      <Text style={styles.docDesc}>{desc}</Text>
      {uploaded && <Text style={styles.docStatus}>✓ Uploaded (mock)</Text>}
    </View>
    <TouchableOpacity style={styles.docBtn} onPress={onUpload} testID={testID}>
      <Text style={styles.docBtnText}>{uploaded ? "Replace" : "Upload"}</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 52,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#111" },
  avatarBlock: { flexDirection: "row", alignItems: "center", padding: 16, backgroundColor: theme.colors.surfaceSecondary, borderRadius: 16, marginBottom: 8 },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#111", alignItems: "center", justifyContent: "center" },
  name: { fontSize: 18, fontWeight: "800", color: "#111" },
  phone: { fontSize: 13, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  kycRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  kycText: { fontSize: 12, fontWeight: "700" },
  section: { fontSize: 12, fontWeight: "700", letterSpacing: 0.5, color: "#777", marginTop: 20, marginBottom: 10, textTransform: "uppercase" },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: theme.colors.onSurfaceSecondary, marginBottom: 4, letterSpacing: 0.3 },
  input: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "600",
    color: "#111",
  },
  pickerRow: { flexDirection: "row", gap: 8 },
  pickerChip: {
    flex: 1,
    height: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerChipOn: { backgroundColor: theme.colors.brandPrimary, borderColor: theme.colors.brandPrimary },
  pickerText: { fontSize: 13, fontWeight: "700", color: "#111" },
  doc: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceSecondary,
    marginBottom: 8,
    gap: 12,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  docTitle: { fontSize: 14, fontWeight: "800", color: "#111" },
  docDesc: { fontSize: 11, color: theme.colors.onSurfaceSecondary, marginTop: 2 },
  docStatus: { fontSize: 11, fontWeight: "700", color: theme.colors.success, marginTop: 4 },
  docBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 999,
    backgroundColor: "#111",
    alignItems: "center",
    justifyContent: "center",
  },
  docBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  savedMsg: { textAlign: "center", marginTop: 12, color: theme.colors.success, fontWeight: "700" },
});
