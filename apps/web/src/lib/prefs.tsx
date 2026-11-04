import { sendPrefsToServiceWorker } from "./push";
import { createTranslator, direction, negotiateLocale, type Locale, type MessageKey } from "@imello/localization";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Colour theme. Classic Blue is the default for a new install. */
export type Palette = "classic-blue" | "coral";
/** Light, dark, or follow the OS. */
export type ColorMode = "light" | "dark" | "system";

interface Prefs {
  locale: Locale;
  setLocale: (l: Locale) => void;
  palette: Palette;
  setPalette: (p: Palette) => void;
  mode: ColorMode;
  setMode: (m: ColorMode) => void;
  resolvedTheme: "light" | "dark";
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  dir: "rtl" | "ltr";
}

const PrefsContext = createContext<Prefs | null>(null);

const LOCALE_KEY = "imello.locale";
const PALETTE_KEY = "imello.appearance.theme";
const MODE_KEY = "imello.appearance.mode";
const LEGACY_THEME_KEY = "imello.theme";

function initialLocale(): Locale {
  const saved = localStorage.getItem(LOCALE_KEY);
  if (saved === "en" || saved === "ar") return saved;
  return negotiateLocale(navigator.languages);
}

function initialAppearance(): { palette: Palette; mode: ColorMode } {
  const palette = localStorage.getItem(PALETTE_KEY);
  const mode = localStorage.getItem(MODE_KEY);
  if ((palette === "classic-blue" || palette === "coral") && (mode === "light" || mode === "dark" || mode === "system")) {
    return { palette, mode };
  }
  // Older builds stored one value: classic | light | dark | system.
  const legacy = localStorage.getItem(LEGACY_THEME_KEY);
  if (legacy === "light" || legacy === "dark" || legacy === "system") return { palette: "classic-blue", mode: legacy };
  return { palette: "classic-blue", mode: "system" };
}

const LEGACY_VARS: [string, string][] = [
  ["--color-background", "--im-color-bg"],
  ["--color-surface", "--im-color-surface"],
  ["--color-surface-elevated", "--im-color-surface"],
  ["--color-border", "--im-color-separator"],
  ["--color-text-primary", "--im-color-text"],
  ["--color-text-secondary", "--im-color-text-2"],
  ["--color-accent", "--im-color-primary"],
  ["--color-accent-pressed", "--im-color-primary-pressed"],
  ["--color-accent-text", "--im-color-on-primary"],
  ["--color-accent-soft", "--im-color-primary-tint"],
  ["--color-lavender", "--im-color-secondary-tint"],
  ["--color-bubble-outgoing", "--im-k-card-bg"],
  ["--color-bubble-outgoing-text", "--im-k-card-text"],
  ["--color-bubble-incoming", "--im-k-card-bg"],
  ["--color-bubble-incoming-text", "--im-k-card-text"],
  ["--color-success", "--im-k-avail"],
  ["--color-danger", "--im-color-error"],
  ["--color-warning", "--im-k-busy"],
  ["--color-focus-ring", "--im-color-primary"],
];

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [palette, setPaletteState] = useState<Palette>(initialAppearance().palette);
  const [mode, setModeState] = useState<ColorMode>(initialAppearance().mode);
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSystemDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const resolvedTheme: "light" | "dark" = mode === "dark" || (mode === "system" && systemDark) ? "dark" : "light";
  const dir = direction(locale);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    sendPrefsToServiceWorker(locale);
    root.dir = dir;
    root.dataset.theme = palette;
    root.dataset.mode = mode;
    root.style.colorScheme = resolvedTheme;
    const cs = getComputedStyle(root);
    for (const [legacy, token] of LEGACY_VARS) {
      const value = cs.getPropertyValue(token).trim();
      if (value) root.style.setProperty(legacy, value);
    }
    root.style.setProperty("--font-family", cs.getPropertyValue("--im-font-ui").trim());
    const header = cs.getPropertyValue("--im-k-header-bg").trim();
    if (header) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", header);
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "theme", dark: resolvedTheme === "dark" }));
  }, [locale, dir, palette, mode, resolvedTheme]);

  const value = useMemo<Prefs>(
    () => ({
      locale,
      setLocale: (l) => {
        localStorage.setItem(LOCALE_KEY, l);
        setLocaleState(l);
      },
      palette,
      setPalette: (p) => {
        localStorage.setItem(PALETTE_KEY, p);
        setPaletteState(p);
      },
      mode,
      setMode: (m) => {
        localStorage.setItem(MODE_KEY, m);
        setModeState(m);
      },
      resolvedTheme,
      t: createTranslator(locale),
      dir,
    }),
    [locale, palette, mode, resolvedTheme, dir],
  );
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs outside PrefsProvider");
  return ctx;
}
