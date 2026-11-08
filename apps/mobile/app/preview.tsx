import { useLocalSearchParams } from "expo-router";
import { fixtureLocale, fixtureScreen } from "../src/ui/fixture-data";
import { FixtureView } from "../src/ui/fixture";

/** Deep link only: imello://preview?lang=ar&screen=chats|chat|ping|signin. No account data. */
export default function Preview() {
  const params = useLocalSearchParams<{ lang?: string; screen?: string }>();
  const lang = fixtureLocale(typeof params.lang === "string" ? params.lang : undefined);
  const screen = fixtureScreen(typeof params.screen === "string" ? params.screen : undefined);
  return <FixtureView locale={lang} screen={screen} />;
}
