import { createTranslator, direction, negotiateLocale, type Locale, type MessageKey } from "@imello/localization";
import { darkScheme, lightScheme, schemeToCssVariables, typography } from "@imello/ui";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemePref = "system" | "light" | "dark";

interface Prefs {
  locale: Locale;
  setLocale: (l: Locale) => void;
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  resolvedTheme: "light" | "dark";
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  dir: "rtl" | "ltr";
}

const PrefsContext = createContext<Prefs | null>(null);

// UI preferences are not sensitive, so localStorage is acceptable for them.
const LOCALE_KEY = "imello.locale";
const THEME_KEY = "imello.theme";

function initialLocale(): Locale {
  const saved = localStorage.getItem(LOCALE_KEY);
  if (saved === "en" || saved === "ar") return saved;
  return negotiateLocale(navigator.languages);
}

function initialTheme(): ThemePref {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "light" || saved === "dark" ? saved : "system";
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [theme, setThemeState] = useState<ThemePref>(initialTheme);
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  const dir = direction(locale);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = dir;
    root.dataset.theme = resolvedTheme;
    // CSSOM assignments are permitted under our CSP (no inline <style> needed).
    for (const [k, v] of Object.entries(schemeToCssVariables(resolvedTheme === "dark" ? darkScheme : lightScheme))) {
      root.style.setProperty(k, v);
    }
    root.style.setProperty("--font-family", typography.fontFamily);
    root.style.setProperty("--line-height", String(locale === "ar" ? typography.lineHeight.arabic : typography.lineHeight.latin));
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolvedTheme === "dark" ? darkScheme.background : lightScheme.accent);
  }, [locale, dir, resolvedTheme]);

  const value = useMemo<Prefs>(
    () => ({
      locale,
      setLocale: (l) => {
        localStorage.setItem(LOCALE_KEY, l);
        setLocaleState(l);
      },
      theme,
      setTheme: (t) => {
        localStorage.setItem(THEME_KEY, t);
        setThemeState(t);
      },
      resolvedTheme,
      t: createTranslator(locale),
      dir,
    }),
    [locale, theme, resolvedTheme, dir],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs outside PrefsProvider");
  return ctx;
}
