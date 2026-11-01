import { usePrefs } from "../../src/prefs";
import { Body, Card, Screen, Title } from "../../src/ui";

export default function Calls() {
  const { t } = usePrefs();
  return (
    <Screen>
      <Title>{t("calls.title")}</Title>
      <Card><Body muted>{t("calls.comingSoon")}</Body></Card>
    </Screen>
  );
}
