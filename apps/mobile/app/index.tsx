import { reloadAppAsync } from "expo";
import { Redirect } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { usePrefs } from "../src/prefs/Prefs";
import { useSession } from "../src/session/Session";

export default function Index() {
  const { ready, colors, font, t } = usePrefs();
  const { phase } = useSession();
  if (!ready || phase === "booting") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.headerBg, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: "#fff", fontFamily: font("700"), fontSize: 34 }}>iMello</Text>
        <Text style={{ color: colors.headerSub, fontFamily: font("400"), fontSize: 16, marginTop: 8 }}>{t("comingUp")}</Text>
      </View>
    );
  }
  if (phase === "error") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 28, gap: 16 }}>
        <Text style={{ color: colors.text, fontFamily: font("600"), fontSize: 18, textAlign: "center" }}>{t("engineFailed")}</Text>
        <Pressable onPress={() => void reloadAppAsync()} style={{ backgroundColor: colors.primaryFill, borderRadius: 6, paddingHorizontal: 22, paddingVertical: 12 }}>
          <Text style={{ color: "#fff", fontFamily: font("600") }}>{t("retry")}</Text>
        </Pressable>
      </View>
    );
  }
  if (phase === "out") return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href="/(app)/chats" />;
}
