import ar from "./locales/ar.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };

export type MessageKey = keyof typeof en;
export type Locale = "en" | "ar";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "ar"] as const;
export const DEFAULT_LOCALE: Locale = "en";

const catalogs: Record<Locale, Record<MessageKey, string>> = {
  en,
  ar: ar as Record<MessageKey, string>,
};

const RTL_LOCALES = new Set<Locale>(["ar"]);

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

export function direction(locale: Locale): "rtl" | "ltr" {
  return isRTL(locale) ? "rtl" : "ltr";
}

/** Pick the best supported locale from a list of BCP-47 tags (e.g. navigator.languages). */
export function negotiateLocale(preferred: readonly string[] | undefined): Locale {
  for (const tag of preferred ?? []) {
    const base = tag.toLowerCase().split("-")[0];
    if (base && (SUPPORTED_LOCALES as readonly string[]).includes(base)) return base as Locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Translate a key. `{name}` placeholders are replaced with values from `vars`.
 * Falls back to English, then to the key itself, so a missing translation never crashes the UI.
 */
export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = catalogs[locale][key] ?? catalogs.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

export function createTranslator(locale: Locale) {
  return (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}

export function formatTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatDay(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { dateStyle: "medium" }).format(date);
}

export const catalogsForTesting = catalogs;
