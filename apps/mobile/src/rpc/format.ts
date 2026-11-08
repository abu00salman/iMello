/** Product rules shared by the native UI and the engine. No I/O. */

export const PING_COOLDOWN_MS = 15_000;
export const FAMILY_MEMBER_LIMIT = 30;
export const FAMILY_MEMBER_WARN = 25;

export type Receipt = "pending" | "delivered" | "read" | "failed";

/** Milliseconds until another Ping is allowed. 0 means it can be sent now. */
export function pingRemaining(lastSentAt: number | undefined, now: number): number {
  if (!lastSentAt) return 0;
  return Math.max(0, PING_COOLDOWN_MS - (now - lastSentAt));
}

/**
 * ✓ while the event is still leaving the device, grey D once the server has accepted it,
 * coloured R once someone else has read it.
 */
export function receiptFor(state: "sending" | "sent" | "failed", read: boolean): Receipt {
  if (state === "failed") return "failed";
  if (state === "sending") return "pending";
  return read ? "read" : "delivered";
}

const HONORIFICS = new Set(["أبو", "ابو", "أبي", "ابي", "عمي", "عمة", "أمي", "امي", "أخي", "اختي", "أختي"]);

/** One letter for an avatar. Skips a leading honorific so «أبو سلمان» is س. */
export function displayInitial(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  const word = HONORIFICS.has(first) && parts[1] ? parts[1] : first;
  return [...word][0] ?? "?";
}

/** Stable avatar colour, the same on every device for a given id. */
export function colorIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (Math.imul(hash, 31) + id.charCodeAt(i)) >>> 0;
  return hash % 6;
}

export function formatStamp(ts: number, locale: "en" | "ar", now = Date.now()): string {
  if (!ts) return "";
  const date = new Date(ts);
  const today = new Date(now);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDelta = Math.round((startOf(today) - startOf(date)) / 86_400_000);
  const tag = locale === "ar" ? "ar-u-nu-latn" : "en";
  if (dayDelta <= 0) {
    return new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit" }).format(date);
  }
  if (dayDelta === 1) return locale === "ar" ? "أمس" : "Yesterday";
  if (dayDelta < 7) return new Intl.DateTimeFormat(tag, { weekday: "long" }).format(date);
  return new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" }).format(date);
}

export function formatClock(ts: number, locale: "en" | "ar"): string {
  if (!ts) return "";
  const tag = locale === "ar" ? "ar-u-nu-latn" : "en";
  return new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit" }).format(new Date(ts));
}
