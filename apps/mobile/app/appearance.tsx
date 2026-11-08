import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { usePrefs } from "../src/prefs/Prefs";
import { resolveColors, type ModePref, type PaletteName } from "../src/theme/themes";
import { Header, Icon, IconButton } from "../src/ui/chrome";

const PALETTES: PaletteName[] = ["classic-blue", "coral"];
const MODES: ModePref[] = ["system", "dark", "light"];

export default function Appearance() {
  const { colors, font, t, palette, mode, setPalette, setMode, rtl } = usePrefs();
  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <Header
        title={t("appearance")}
        leading={<IconButton label={t("cancel")} onPress={() => router.back()}><Icon ios="chevron.backward" android="arrow_back" color="#fff" mirror /></IconButton>}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text style={{ color: colors.text2, fontFamily: font("600"), paddingHorizontal: 4 }}>{t("themeSection")}</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          {PALETTES.map((name) => {
            const sample = resolveColors(name, "light", false);
            const on = palette === name;
            return (
              <Pressable key={name} onPress={() => setPalette(name)} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 8, borderWidth: on ? 2.5 : 1, borderColor: on ? colors.primary : colors.separator }}>
                <View style={{ height: 132, borderRadius: 6, overflow: "hidden", backgroundColor: sample.wallpaper }}>
                  <View style={{ height: 28, backgroundColor: sample.headerBg }} />
                  <View style={{ padding: 8, gap: 6 }}>
                    <Mini line="…" bar={sample.barOwn} own={false} card={sample.cardBg} text={sample.cardText} />
                    <Mini line="R" bar={sample.barOwn} own card={sample.cardBg} text={sample.cardText} read={sample.statusRead} />
                  </View>
                  <View style={{ height: 18, backgroundColor: sample.tabBg, marginTop: "auto" }} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, paddingHorizontal: 4 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: on ? colors.primary : colors.text3, alignItems: "center", justifyContent: "center" }}>
                    {on ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
                  </View>
                  <Text style={{ flex: 1, color: colors.text, fontFamily: font("600"), fontSize: 15 }}>{name === "coral" ? t("coral") : t("classicBlue")}</Text>
                </View>
                {name === "classic-blue" ? <Text style={{ alignSelf: rtl ? "flex-start" : "flex-end", color: colors.text2, fontFamily: font("700"), fontSize: 11, marginTop: 4 }}>{t("defaultTag")}</Text> : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: colors.text2, fontFamily: font("600"), paddingHorizontal: 4 }}>{t("mode")}</Text>
        <View style={{ flexDirection: "row", backgroundColor: colors.surface2, borderRadius: 8, padding: 3 }}>
          {MODES.map((item) => {
            const on = mode === item;
            const label = item === "system" ? t("auto") : item === "dark" ? t("dark") : t("light");
            return (
              <Pressable key={item} onPress={() => setMode(item)} style={{ flex: 1, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.surface : "transparent" }}>
                <Text style={{ color: on ? colors.text : colors.text2, fontFamily: font(on ? "600" : "500") }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: colors.text2, fontFamily: font("400"), fontSize: 13, lineHeight: 20 }}>{t("themeNote")}</Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: 10, minHeight: 52, paddingHorizontal: 14, flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, color: colors.text, fontFamily: font("500"), fontSize: 16 }}>{t("appIcon")}</Text>
          <Text style={{ color: colors.text2, fontFamily: font("400") }}>{t("iconFollows")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Mini({ line, bar, own, card, text, read }: { line: string; bar: string; own: boolean; card: string; text: string; read?: string }) {
  return (
    <View style={{ alignSelf: own ? "flex-end" : "flex-start", backgroundColor: card, borderBottomWidth: 2, borderBottomColor: bar, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3, maxWidth: "80%" }}>
      <Text style={{ fontSize: 10, color: text }}>{line} {read ? <Text style={{ color: read, fontWeight: "800" }}>R</Text> : null}</Text>
    </View>
  );
}
