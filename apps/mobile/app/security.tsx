import { MIN_PASSWORD_LENGTH } from "@imello/core";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { DeviceRow } from "../src/rpc/wire";
import { usePrefs } from "../src/prefs/Prefs";
import { useSession } from "../src/session/Session";
import { Field, Header, Icon, IconButton, PrimaryButton } from "../src/ui/chrome";

export default function Security() {
  const { colors, font, t, locale } = usePrefs();
  const { devices, revokeDevice, protect, me, api, signOut } = useSession();
  const [list, setList] = useState<DeviceRow[]>([]);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const unprotected = me?.credential === "device";

  useEffect(() => {
    void devices().then(setList).catch(() => undefined);
  }, [devices]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <Header title={t("security")} leading={<IconButton label={t("cancel")} onPress={() => router.back()}><Icon ios="chevron.backward" android="arrow_back" color="#fff" mirror /></IconButton>} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {unprotected ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 14, gap: 10 }}>
            <Text style={{ fontFamily: font("700"), fontSize: 18, color: colors.text }}>{t("protectTitle")}</Text>
            <Text style={{ color: colors.text2, fontFamily: font("400") }}>{t("protectBody")}</Text>
            <Field value={password} onChangeText={setPassword} placeholder={t("password")} secure ltr />
            <Field value={again} onChangeText={setAgain} placeholder={t("confirmPass")} secure ltr />
            <PrimaryButton
              label={t("protectAction")}
              onPress={() => {
                if (password.length < MIN_PASSWORD_LENGTH) return setNote(t("tooShort"));
                if (password !== again) return setNote(t("mismatch"));
                void protect(password).then(() => setNote(t("protected"))).catch(() => setNote(t("serverDown")));
              }}
            />
          </View>
        ) : null}
        <Text style={{ fontFamily: font("700"), color: colors.text }}>{t("devices")}</Text>
        {list.map((device) => (
          <View key={device.deviceId} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontFamily: font("500") }}>{device.displayName || device.deviceId}</Text>
              <Text style={{ color: colors.text3, fontFamily: font("400"), fontSize: 12 }}>{device.isCurrent ? t("thisDevice") : device.lastSeenTs ? new Date(device.lastSeenTs).toLocaleString(locale === "ar" ? "ar-u-nu-latn" : "en") : ""}</Text>
            </View>
            {device.isCurrent ? null : (
              <Pressable onPress={() => void revokeDevice(device.deviceId).then(() => devices().then(setList))}>
                <Text style={{ color: colors.statusFailed, fontFamily: font("600") }}>{t("signOutDevice")}</Text>
              </Pressable>
            )}
          </View>
        ))}
        {note ? <Text style={{ color: colors.primary, fontFamily: font("500") }}>{note}</Text> : null}
        <Text style={{ color: colors.text2, fontFamily: font("400"), lineHeight: 20 }}>{t("lockNote")}</Text>
        <Pressable
          onPress={() => {
            void api.deleteMe().then(() => signOut());
          }}
          style={{ marginTop: 12 }}
        >
          <Text style={{ color: colors.statusFailed, fontFamily: font("600") }}>{t("deleteAccount")}</Text>
          <Text style={{ color: colors.text3, fontFamily: font("400"), marginTop: 4 }}>{t("deleteConfirm")}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
