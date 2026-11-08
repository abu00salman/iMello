import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { fixtureLocale, fixtureScreen } from "../src/ui/fixture-data";
import { FixtureView } from "../src/ui/fixture";
import { markPreviewShown } from "../src/ui/preview-request";

/** Opened by the simulator via Documents/imello-preview.txt. No account data. */
export default function Preview() {
  const params = useLocalSearchParams<{ lang?: string; screen?: string }>();
  const lang = fixtureLocale(typeof params.lang === "string" ? params.lang : undefined);
  const screen = fixtureScreen(typeof params.screen === "string" ? params.screen : undefined);
  useEffect(() => {
    markPreviewShown(lang, screen);
  }, [lang, screen]);
  return <FixtureView locale={lang} screen={screen} />;
}
