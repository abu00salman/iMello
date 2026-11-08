import * as Clipboard from "expo-clipboard";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { StringKey } from "../src/i18n/strings";
import { usePrefs } from "../src/prefs/Prefs";
import { useSession } from "../src/session/Session";
import { takePreviewRequest } from "../src/ui/preview-request";

const STAGE_KEY: Record<string, StringKey> = {
  asset: "stageAsset",
  webview: "stageWebview",
  hello: "stageHello",
  session: "stageSession",
};

export default function Index() {
  const { ready, colors, font, t } = usePrefs();
  const { phase, bootStage, bootError, logs, diagnostics, retryBoot } = useSession();
  const [copied, setCopied] = useState(false);
  const [previewHref, setPreviewHref] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    void takePreviewRequest().then(setPreviewHref);
  }, []);
  if (previewHref) return <Redirect href={previewHref} />;
  if (previewHref === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.headerBg, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: "#fff", fontFamily: font("700"), fontSize: 34 }}>iMello</Text>
        <Text style={{ color: colors.headerSub, fontFamily: font("400"), fontSize: 16, marginTop: 8 }}>{t("comingUp")}</Text>
      </View>
    );
  }
  if (phase === "error") {
    const stageName = STAGE_KEY[bootStage] ? t(STAGE_KEY[bootStage]!) : bootStage;
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 28, gap: 14, flexGrow: 1, justifyContent: "center" }}>
        <Text style={{ color: colors.text, fontFamily: font("700"), fontSize: 28, textAlign: "center" }}>iMello</Text>
        <Text style={{ color: colors.text, fontFamily: font("600"), fontSize: 18, textAlign: "center" }}>{t("engineFailed")}</Text>
        <Text style={{ color: colors.text2, fontFamily: font("400"), textAlign: "center" }}>{t("bootStage", { stage: stageName })}</Text>
        {bootError ? <Text style={{ color: colors.statusFailed, fontFamily: font("500"), textAlign: "center" }}>{bootError}</Text> : null}
        <Pressable accessibilityRole="button" onPress={retryBoot} style={{ backgroundColor: colors.primaryFill, borderRadius: 6, paddingVertical: 12, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontFamily: font("600"), fontSize: 16 }}>{t("retry")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void Clipboard.setStringAsync(diagnostics).then(() => setCopied(true));
          }}
          style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.separatorStrong, paddingVertical: 12, alignItems: "center" }}
        >
          <Text style={{ color: colors.text, fontFamily: font("600") }}>{copied ? t("diagnosticsCopied") : t("copyDiagnostics")}</Text>
        </Pressable>
        <Text style={{ color: colors.text3, fontFamily: font("400"), fontSize: 12 }} selectable>
          {logs.slice(-8).join("\n")}
        </Text>
      </ScrollView>
    );
  }
  if (!ready || phase === "booting") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.headerBg, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <Text style={{ color: "#fff", fontFamily: font("700"), fontSize: 34 }}>iMello</Text>
        <Text style={{ color: colors.headerSub, fontFamily: font("400"), fontSize: 16, marginTop: 8 }}>{t("comingUp")}</Text>
      </View>
    );
  }
  if (phase === "out") return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href="/(app)/chats" />;
}
