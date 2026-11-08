import { extractInviteToken, normalizePin } from "@imello/core";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { usePrefs } from "../src/prefs/Prefs";
import { useSession } from "../src/session/Session";
import { Header, Icon, IconButton } from "../src/ui/chrome";

export default function Scan() {
  const { colors, font, t } = usePrefs();
  const { api } = useSession();
  const [permission, request] = useCameraPermissions();
  const [done, setDone] = useState<string | null>(null);
  const [lock, setLock] = useState(false);

  async function onScan(value: string) {
    if (lock) return;
    setLock(true);
    const pin = normalizePin(value);
    const token = extractInviteToken(value);
    try {
      if (pin) {
        const res = await api.sendContactRequest(pin);
        setDone(res.status === "already_contact" ? t("alreadyContact") : t("requestSent"));
      } else if (token) {
        const res = await api.redeemInvite(token);
        setDone(res.contact?.status === "pending_guardian" ? t("guardianWait") : t("contactAdded"));
      } else setDone(t("invalidCode"));
    } catch {
      setDone(t("invalidCode"));
      setLock(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Header
        title={t("scan")}
        leading={<IconButton label={t("cancel")} onPress={() => router.back()}><Icon ios="chevron.backward" android="arrow_back" color="#fff" mirror /></IconButton>}
      />
      {done ? (
        <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
          <Text style={{ color: colors.text, fontFamily: font("600"), fontSize: 18, textAlign: "center" }}>{done}</Text>
          <Pressable onPress={() => router.back()}><Text style={{ color: colors.primary, fontFamily: font("700") }}>{t("contacts")}</Text></Pressable>
        </View>
      ) : !permission?.granted ? (
        <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
          <Text style={{ color: colors.text, fontFamily: font("400"), textAlign: "center" }}>{t("cameraNeed")}</Text>
          <Pressable onPress={() => void request()} style={{ backgroundColor: colors.primaryFill, borderRadius: 6, paddingHorizontal: 18, paddingVertical: 12 }}>
            <Text style={{ color: "#fff", fontFamily: font("600") }}>{t("camera")}</Text>
          </Pressable>
        </View>
      ) : (
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={(event) => void onScan(event.data)}
        />
      )}
      {!done && permission?.granted ? <Text style={{ color: "#fff", textAlign: "center", padding: 16, fontFamily: font("400") }}>{t("scanHint")}</Text> : null}
    </View>
  );
}
