import { MIN_PASSWORD_LENGTH } from "@imello/core";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Share, Text } from "react-native";
import { usePrefs } from "../../src/prefs";
import { useSession } from "../../src/session";
import { Body, Button, Card, Input, Title } from "../../src/ui";

export default function Settings() {
  const { t, locale, setLocale, colors } = usePrefs();
  const { me, signOut, protectAccount } = useSession();
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unprotected = me?.credential === "device";

  async function protect() {
    setMsg(null);
    if (pw1.length < MIN_PASSWORD_LENGTH) return setMsg(t("auth.passwordHint"));
    if (pw1 !== pw2) return setMsg(t("protect.mismatch"));
    setBusy(true);
    try {
      await protectAccount(pw1);
      setPw1("");
      setPw2("");
      setMsg(t("protect.done"));
    } catch {
      setMsg(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  function confirmSignOut() {
    const go = () => void signOut().then(() => router.replace("/sign-in"));
    if (!unprotected) return go();
    Alert.alert(t("protect.title"), t("protect.body"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("auth.signOut"), style: "destructive", onPress: go },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Title>{me?.displayName ?? ""}</Title>
        {me?.pin ? (
          <>
            <Body muted>{t("me.yourNumber")}</Body>
            <Text selectable style={{ fontSize: 32, fontWeight: "700", color: colors.accent, letterSpacing: 1, textAlign: "center", fontVariant: ["tabular-nums"] }}>
              {me.pin}
            </Text>
            <Button variant="secondary" title={t("common.copy")} onPress={() => void Share.share({ message: me.pin! })} />
            <Body muted>{t("me.shareNumber")}</Body>
          </>
        ) : (
          <Body muted>{me?.userId ?? ""}</Body>
        )}
      </Card>

      {(unprotected || msg === t("protect.done")) && (
        <Card>
          <Title>🔐 {t("protect.title")}</Title>
          {msg === t("protect.done") ? (
            <Body>{msg}</Body>
          ) : (
            <>
              <Body muted>{t("protect.body")}</Body>
              <Input label={t("protect.newPassword")} value={pw1} onChangeText={setPw1} secureTextEntry textContentType="newPassword" />
              <Input label={t("protect.confirm")} value={pw2} onChangeText={setPw2} secureTextEntry textContentType="newPassword" />
              {msg && <Body>{msg}</Body>}
              <Button title={t("protect.title")} onPress={() => void protect()} busy={busy} />
            </>
          )}
        </Card>
      )}

      <Card>
        <Body>{t("settings.language")}</Body>
        <Button variant={locale === "en" ? "primary" : "secondary"} title="English" onPress={() => setLocale("en")} />
        <Button variant={locale === "ar" ? "primary" : "secondary"} title="العربية" onPress={() => setLocale("ar")} />
      </Card>
      <Card>
        <Button variant="secondary" title={t("auth.signOut")} onPress={confirmSignOut} />
      </Card>
      <Body muted center>{`${t("app.name")} ${Constants.expoConfig?.version ?? ""} · ${t("app.signature")}`}</Body>
    </ScrollView>
  );
}
