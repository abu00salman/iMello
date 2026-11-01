import { createTranslator, direction, negotiateLocale, type Locale, type MessageKey } from "@imello/localization";
import { darkScheme, lightScheme, type ColorScheme } from "@imello/ui";
import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nManager, useColorScheme } from "react-native";

interface Prefs {
  locale: Locale;
  setLocale: (l: Locale) => void;
  colors: ColorScheme;
  dark: boolean;
  rtl: boolean;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<Prefs | null>(null);
const LOCALE_KEY = "imello.locale";

export function PrefsProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [locale, setLocaleState] = useState<Locale>(() => negotiateLocale(getLocales().map((l) => l.languageTag)));

  useEffect(() => {
    void SecureStore.getItemAsync(LOCALE_KEY).then((v) => (v === "en" || v === "ar") && setLocaleState(v));
  }, []);

  const rtl = direction(locale) === "rtl";
  useEffect(() => {
    // Direction is handled in JS (textAlign / writingDirection / row order) so switching language is
    // instant. Native RTL mirroring is disabled: when a device is set to Arabic, Android would otherwise
    // flip left/right a second time and invert every alignment.
    I18nManager.allowRTL(false);
    I18nManager.forceRTL(false);
  }, []);

  const value = useMemo<Prefs>(() => {
    const dark = scheme === "dark";
    return {
      locale,
      setLocale: (l) => {
        setLocaleState(l);
        void SecureStore.setItemAsync(LOCALE_KEY, l);
      },
      colors: dark ? darkScheme : lightScheme,
      dark,
      rtl,
      t: createTranslator(locale),
    };
  }, [locale, scheme, rtl]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePrefs outside PrefsProvider");
  return v;
}
