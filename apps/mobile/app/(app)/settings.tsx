import { router } from "expo-router";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { usePrefs } from "../../src/prefs/Prefs";
import { useSession } from "../../src/session/Session";
import { Header } from "../../src/ui/chrome";

export default function Settings() {
  const { colors, font, t, locale, setLocale, sounds, setSounds, preview, setPreview } = usePrefs();
  const { me, signOut } = useSession();
  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <Header title={t("settings")} subtitle={me?.displayName} avatar={{ name: me?.displayName || "iMello", id: me?.userId ?? "me" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Row label={t("appearance")} onPress={() => router.push("/appearance")} />
        <Row label={t("backup")} onPress={() => router.push("/backup")} />
        <Row label={t("security")} onPress={() => router.push("/security")} />
        <Row label={t("codeTitle")} onPress={() => router.push("/code")} />
        <View style={{ backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14 }}>
          <Toggle label={t("sounds")} value={sounds} onValueChange={setSounds} />
          <Toggle label={t("preview")} value={preview} onValueChange={setPreview} />
          <Text style={{ color: colors.text3, fontFamily: font("400"), fontSize: 13, paddingBottom: 12 }}>{t("previewHint")}</Text>
        </View>
        <Row label={t("language")} detail={locale === "ar" ? t("arabic") : t("english")} onPress={() => setLocale(locale === "ar" ? "en" : "ar")} />
        <Row label={t("signOut")} danger onPress={() => void signOut()} />
        <View style={{ alignItems: "center", marginTop: 18, gap: 4 }}>
          <Text style={{ color: colors.text, fontFamily: font("700"), fontSize: 18 }}>iMello</Text>
          <Text style={{ color: colors.text3, fontFamily: font("400") }}>{t("version")} 1.0.0</Text>
          <Text style={{ color: colors.text3, fontFamily: font("400") }}>{t("developed")}</Text>
          <Text style={{ color: colors.text3, fontFamily: font("400"), textAlign: "center", marginTop: 8 }}>{t("lockNote")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ label, detail, onPress, danger }: { label: string; detail?: string; onPress: () => void; danger?: boolean }) {
  const { colors, font } = usePrefs();
  return (
    <Pressable onPress={onPress} style={{ minHeight: 52, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center" }}>
      <Text style={{ flex: 1, color: danger ? colors.statusFailed : colors.text, fontFamily: font("500"), fontSize: 16 }}>{label}</Text>
      {detail ? <Text style={{ color: colors.text3, fontFamily: font("400") }}>{detail}</Text> : null}
    </Pressable>
  );
}

function Toggle({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  const { colors, font } = usePrefs();
  return (
    <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center" }}>
      <Text style={{ flex: 1, color: colors.text, fontFamily: font("500"), fontSize: 16 }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.primary, false: colors.separatorStrong }} />
    </View>
  );
}
