import Constants from "expo-constants";
import { router } from "expo-router";
import { usePrefs } from "../../src/prefs";
import { useSession } from "../../src/session";
import { Body, Button, Card, Screen, Title } from "../../src/ui";

export default function Settings() {
  const { t, locale, setLocale } = usePrefs();
  const { me, signOut } = useSession();
  return (
    <Screen>
      <Card>
        <Title>{me?.displayName ?? ""}</Title>
        <Body muted>{me?.userId ?? ""}</Body>
      </Card>
      <Card>
        <Body>{t("settings.language")}</Body>
        <Button variant={locale === "en" ? "primary" : "secondary"} title="English" onPress={() => setLocale("en")} />
        <Button variant={locale === "ar" ? "primary" : "secondary"} title="العربية" onPress={() => setLocale("ar")} />
      </Card>
      <Card>
        <Button variant="secondary" title={t("auth.signOut")} onPress={() => void signOut().then(() => router.replace("/sign-in"))} />
      </Card>
      <Body muted>{`${t("app.name")} ${Constants.expoConfig?.version ?? ""} · ${t("app.signature")}`}</Body>
    </Screen>
  );
}
