import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Share, Text, View } from "react-native";
import { usePrefs } from "../src/prefs/Prefs";
import { useSession } from "../src/session/Session";
import { Header, Icon, IconButton } from "../src/ui/chrome";
import { QrCode } from "../src/ui/qr";

export default function Code() {
  const { colors, font, t } = usePrefs();
  const { me, api } = useSession();
  const code = me?.pin || me?.username || "";
  const [copied, setCopied] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const shown = invite ?? code;

  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <Header
        title={t("codeTitle")}
        leading={<IconButton label={t("cancel")} onPress={() => router.back()}><Icon ios="chevron.backward" android="arrow_back" color="#fff" mirror /></IconButton>}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 10, overflow: "hidden", borderBottomWidth: 3, borderBottomColor: colors.barOwn }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 0.5, borderBottomColor: colors.separator }}>
            <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontFamily: font("700"), fontSize: 18 }}>{(me?.displayName || "?").slice(0, 1)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontFamily: font("600"), fontSize: 16 }}>{me?.displayName}</Text>
              <Text style={{ color: colors.text2, fontFamily: font("400"), fontSize: 13 }}>{code}</Text>
            </View>
          </View>
          <View style={{ alignItems: "center", paddingVertical: 18 }}>
            {shown ? <QrCode value={shown} /> : null}
            <Text style={{ color: colors.text2, fontFamily: font("600"), marginTop: 10 }}>{t("codeTitle")}</Text>
            <Text style={{ color: colors.primary, fontFamily: font("700"), fontSize: 28, letterSpacing: 1, writingDirection: "ltr" }}>{code}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={() => { void Clipboard.setStringAsync(code); setCopied(true); }}
            style={{ flex: 1, height: 44, borderRadius: 6, borderWidth: 1, borderColor: colors.separatorStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontFamily: font("600"), color: colors.text }}>{copied ? t("copied") : t("copy")}</Text>
          </Pressable>
          <Pressable onPress={() => void Share.share({ message: code })} style={{ flex: 1, height: 44, borderRadius: 6, backgroundColor: colors.primaryFill, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: font("600"), color: "#fff" }}>{t("share")}</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/scan")} style={{ flex: 1, height: 44, borderRadius: 6, borderWidth: 1, borderColor: colors.separatorStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: font("600"), color: colors.text }}>{t("scan")}</Text>
          </Pressable>
        </View>
        <Text style={{ color: colors.text2, fontFamily: font("400"), textAlign: "center", lineHeight: 20 }}>{t("codeHint")}</Text>
        <Pressable
          onPress={() => void api.createContactInvite().then((inv) => setInvite(inv.token))}
          style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 14 }}
        >
          <Text style={{ color: colors.primary, fontFamily: font("600"), fontSize: 16 }}>{t("newInvite")}</Text>
          <Text style={{ color: colors.text2, fontFamily: font("400"), marginTop: 4 }}>{t("newInviteHint")}</Text>
          {invite ? <Text style={{ color: colors.text, fontFamily: font("500"), marginTop: 8, writingDirection: "ltr" }}>{invite}</Text> : null}
        </Pressable>
      </ScrollView>
    </View>
  );
}
