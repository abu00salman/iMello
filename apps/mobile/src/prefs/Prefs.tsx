import { reloadAppAsync } from "expo";
import { File, Paths } from "expo-file-system";
import { useFonts } from "expo-font";
import { getLocales } from "expo-localization";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nManager, useColorScheme } from "react-native";
import { t as translate, type StringKey } from "../i18n/strings";
import { isPingSound, type PingSound } from "../media/ping-tones";
import { fontFor } from "./fonts";
import { resolveColors, type ClassicColors, type ModePref, type PaletteName } from "../theme/themes";

function appearanceFile(): File {
  return new File(Paths.document, "imello-appearance.json");
}

export interface StatusPref {
  availability: "available" | "busy";
  message: string;
}

interface PrefState {
  palette: PaletteName;
  mode: ModePref;
  locale: "en" | "ar";
  sounds: boolean;
  preview: boolean;
  pingTone: PingSound;
  status: StatusPref;
}

const fallbackLocale = (): "en" | "ar" => (getLocales()[0]?.languageCode === "ar" ? "ar" : "en");

const DEFAULTS: PrefState = {
  palette: "classic-blue",
  mode: "system",
  locale: "en",
  sounds: true,
  preview: false,
  pingTone: "taps",
  status: { availability: "available", message: "" },
};

interface PrefsApi extends PrefState {
  ready: boolean;
  colors: ClassicColors;
  rtl: boolean;
  font: (weight?: "400" | "500" | "600" | "700") => string;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  setPalette: (palette: PaletteName) => void;
  setMode: (mode: ModePref) => void;
  setLocale: (locale: "en" | "ar") => void;
  setSounds: (on: boolean) => void;
  setPreview: (on: boolean) => void;
  setPingTone: (tone: PingSound) => void;
  setStatus: (status: StatusPref) => void;
}

const Ctx = createContext<PrefsApi | null>(null);

export { fontFor } from "./fonts";

export function PrefsProvider({ children }: { children: ReactNode }) {
  const systemDark = useColorScheme() === "dark";
  const [pref, setPref] = useState<PrefState>({ ...DEFAULTS, locale: fallbackLocale() });
  const [hydrated, setHydrated] = useState(false);
  const [fontsGaveUp, setFontsGaveUp] = useState(false);
  const [fontsLoaded] = useFonts({
    Inter: require("../../assets/fonts/Inter-Regular.ttf"),
    "Inter-Medium": require("../../assets/fonts/Inter-Medium.ttf"),
    "Inter-SemiBold": require("../../assets/fonts/Inter-SemiBold.ttf"),
    "Inter-Bold": require("../../assets/fonts/Inter-Bold.ttf"),
    Plex: require("../../assets/fonts/IBMPlexSansArabic-Regular.ttf"),
    "Plex-Medium": require("../../assets/fonts/IBMPlexSansArabic-Medium.ttf"),
    "Plex-SemiBold": require("../../assets/fonts/IBMPlexSansArabic-SemiBold.ttf"),
    "Plex-Bold": require("../../assets/fonts/IBMPlexSansArabic-Bold.ttf"),
  });

  useEffect(() => {
    const id = setTimeout(() => setFontsGaveUp(true), 20_000);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    void (async () => {
      const store = appearanceFile();
      try {
        if (store.exists) {
          const saved = JSON.parse(await store.text()) as Partial<PrefState>;
          const pingTone = typeof saved.pingTone === "string" && isPingSound(saved.pingTone) ? saved.pingTone : undefined;
          setPref((prev) => ({
            ...prev,
            ...saved,
            pingTone: pingTone ?? prev.pingTone,
            status: { ...prev.status, ...saved.status },
          }));
        }
      } catch {
        /* keep defaults */
      }
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const store = appearanceFile();
    try {
      if (!store.exists) store.create();
      store.write(JSON.stringify(pref));
    } catch {
      /* appearance is not required to send messages */
    }
  }, [pref, hydrated]);

  const rtl = pref.locale === "ar";
  useEffect(() => {
    if (!hydrated || I18nManager.isRTL === rtl) return;
    I18nManager.allowRTL(true);
    I18nManager.swapLeftAndRightInRTL(true);
    I18nManager.forceRTL(rtl);
    void reloadAppAsync();
  }, [hydrated, rtl]);

  const colors = resolveColors(pref.palette, pref.mode, systemDark);
  const value = useMemo<PrefsApi>(
    () => ({
      ...pref,
      ready: hydrated && (fontsLoaded || fontsGaveUp),
      colors,
      rtl,
      font: (weight = "400") => fontFor(rtl, weight),
      t: (key, vars) => translate(pref.locale, key, vars),
      setPalette: (palette) => setPref((p) => ({ ...p, palette })),
      setMode: (mode) => setPref((p) => ({ ...p, mode })),
      setLocale: (locale) => setPref((p) => ({ ...p, locale })),
      setSounds: (sounds) => setPref((p) => ({ ...p, sounds })),
      setPreview: (preview) => setPref((p) => ({ ...p, preview })),
      setPingTone: (pingTone) => setPref((p) => ({ ...p, pingTone })),
      setStatus: (status) => setPref((p) => ({ ...p, status })),
    }),
    [pref, hydrated, fontsLoaded, fontsGaveUp, colors, rtl],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePrefs outside PrefsProvider");
  return ctx;
}
