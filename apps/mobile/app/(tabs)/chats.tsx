import { Linking } from "react-native";
import { usePrefs } from "../../src/prefs";
import { useSession } from "../../src/session";
import { Body, Button, Card, Screen, Title } from "../../src/ui";

/**
 * Honest placeholder: encrypted messaging on native mobile requires the
 * matrix-rust-sdk native bindings, which are not integrated yet. We do not show
 * fake conversations.
 */
export default function Chats() {
  const { t } = usePrefs();
  const { me } = useSession();
  return (
    <Screen>
      <Title>{me?.kind === "child" ? t("kids.hello", { name: me.displayName }) : t("nav.chats")}</Title>
      <Card>
        <Body>🔒 {t("mobile.messagingUnavailable")}</Body>
        <Button variant="secondary" title="iMello Web" onPress={() => void Linking.openURL("https://github.com/abu00salman/iMello#readme")} />
      </Card>
    </Screen>
  );
}
