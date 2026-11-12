import { router } from "expo-router";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { PING_SOUNDS, previewPing, type PingSound } from "../../src/media/sounds";
import type { StringKey } from "../../src/i18n/strings";
import { usePrefs } from "../../src/prefs/Prefs";
import { useSession } from "../../src/session/Session";
import { Header } from "../../src/ui/chrome";

export default function Settings() {
  const { colors, font, t, locale, setLocale, sounds, setSounds, preview, setPreview, pingTone, setPingTone } = usePrefs();
  const { me, signOut } = useSession();
  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <Header title={t("settings")} subtitle={me?.displayName} avatar={{ name: me?.displayName || "Wanas", id: me?.userId ?? "me" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 6, paddingBottom: 32 }}>
        <Section title={t("secProfile")} />
        <Row label={t("codeTitle")} detail={me?.pin ?? undefined} onPress={() => router.push("/code")} />
        {me?.kind !== "child" ? (
          <>
            <Section title={t("contactsInvites")} />
            <Row label={t("contacts")} onPress={() => router.push("/contacts")} />
          </>
        ) : null}
        <Section title={t("secPrivacy")} />
        <Row label={t("security")} onPress={() => router.push("/security")} />
        {me?.kind !== "child" ? (
          <>
            <Section title={t("familySafety")} />
            <Row label={t("familyTitle")} onPress={() => router.push("/family")} />
          </>
        ) : null}
        <Section title={t("secNotifications")} />
        <View style={{ backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 14 }}>
          <Toggle label={t("sounds")} value={sounds} onValueChange={setSounds} />
          <Text style={{ color: colors.text, fontFamily: font("600"), fontSize: 15, paddingTop: 4 }}>{t("pingTone")}</Text>
          {PING_SOUNDS.map((tone) => (
            <PingChoice
              key={tone}
              tone={tone}
              label={t(TONE_KEY[tone])}
              listen={t("listen")}
              selected={pingTone === tone}
              onSelect={() => {
                setPingTone(tone);
                void previewPing(tone);
              }}
            />
          ))}
          <Toggle label={t("preview")} value={preview} onValueChange={setPreview} />
          <Text style={{ color: colors.text3, fontFamily: font("400"), fontSize: 13, paddingBottom: 12 }}>{t("previewHint")}</Text>
        </View>
        <Section title={t("connectedDevices")} />
        <Row label={t("devices")} onPress={() => router.push("/security")} />
        <Section title={t("secLook")} />
        <Row label={t("appearance")} onPress={() => router.push("/appearance")} />
        <Row label={t("language")} detail={locale === "ar" ? t("arabic") : t("english")} onPress={() => setLocale(locale === "ar" ? "en" : "ar")} />
        <Section title={t("recoveryBackups")} />
        <Row label={t("backup")} onPress={() => router.push("/backup")} />
        <Section title={t("aboutImello")} />
        <Row label={t("signOut")} danger onPress={() => void signOut()} />
        <View style={{ alignItems: "center", marginTop: 18, gap: 4 }}>
          <Text style={{ color: colors.text, fontFamily: font("700"), fontSize: 18 }}>Wanas</Text>
          <Text style={{ color: colors.text3, fontFamily: font("400") }}>{t("version")} 1.0.0</Text>
          <Text style={{ color: colors.text3, fontFamily: font("400") }}>{t("developed")}</Text>
          <Text style={{ color: colors.text3, fontFamily: font("400"), textAlign: "center", marginTop: 8 }}>{t("lockNote")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title }: { title: string }) {
  const { colors, font } = usePrefs();
  return <Text accessibilityRole="header" style={{ color: colors.text2, fontFamily: font("600"), fontSize: 13, paddingTop: 14, paddingBottom: 4, paddingHorizontal: 4 }}>{title}</Text>;
}

function Row({ label, detail, onPress, danger }: { label: string; detail?: string; onPress: () => void; danger?: boolean }) {
  const { colors, font } = usePrefs();
  return (
    <Pressable onPress={onPress} style={{ minHeight: 52, backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: 14, flexDirection: "row", alignItems: "center" }}>
      <Text style={{ flex: 1, color: danger ? colors.statusFailed : colors.text, fontFamily: font("500"), fontSize: 16 }}>{label}</Text>
      {detail ? <Text style={{ color: colors.text3, fontFamily: font("400") }}>{detail}</Text> : null}
    </Pressable>
  );
}

const TONE_KEY: Record<PingSound, StringKey> = {
  taps: "toneTaps",
  knock: "toneKnock",
  bell: "toneBell",
  chirp: "toneChirp",
  drum: "toneDrum",
};

function PingChoice({
  tone,
  label,
  listen,
  selected,
  onSelect,
}: {
  tone: PingSound;
  label: string;
  listen: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { colors, font } = usePrefs();
  return (
    <View style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        onPress={onSelect}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          {selected ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary }} /> : null}
        </View>
        <Text style={{ color: colors.text, fontFamily: font("500"), fontSize: 16 }}>{label}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${listen}: ${label}`}
        onPress={() => void previewPing(tone)}
        style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 4 }}
      >
        <Text style={{ color: colors.primary, fontFamily: font("600") }}>{listen}</Text>
      </Pressable>
    </View>
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
