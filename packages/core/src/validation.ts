export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;
export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "support", "help", "security", "imello", "wanas", "system",
  "moderator", "official", "staff", "abuse", "noreply", "postmaster", "guardian", "service",
]);

export type UsernameProblem = "length" | "characters" | "reserved";

export function validateUsername(username: string): UsernameProblem | null {
  if (username.length < 3 || username.length > 32) return "length";
  if (!USERNAME_RE.test(username)) return "characters";
  if (RESERVED_USERNAMES.has(username) || username.startsWith("imello") || username.startsWith("wanas") || username.startsWith("mell-") || /^w\d/.test(username)) return "reserved";
  return null;
}

/**
 * Wanas Codes: `w` + 4 digits (w1122). The code is what people share. New accounts use it as their
 * Matrix username; older accounts keep their username (mell-1122 / mell-447729) and carry the code beside it.
 * Older spellings are still accepted when typed.
 */
export const PIN_PREFIX = "w";
export const PIN_DIGITS = 4;
export const PIN_RE = /^(w\d{4}|mell-\d{4}|mell-\d{6})$/;

/** How a code is shown to people: "w1122". Old 6-digit numbers without a code show as "Mell-447729". */
export function displayPin(pin: string): string {
  return pin.replace(/\bmell-(\d{4})\b/gi, "w$1").replace(/\bmell-(\d{6})\b/gi, "Mell-$1");
}

/** Accept what people actually type: "w1122", "W 1122", "1122", "Mell-1122", "mell447729", "٤٤٧٧٢٩" (Arabic-Indic digits). */
export function normalizePin(input: string): string | null {
  const western = input.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const compact = western.toLowerCase().replace(/[\s_-]/g, "");
  const digits = compact.startsWith("mell") ? compact.slice(4) : compact.startsWith("w") ? compact.slice(1) : compact;
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 4) return `${PIN_PREFIX}${digits}`;
  if (digits.length === 6 && !compact.startsWith("w")) return `mell-${digits}`;
  return null;
}

export function isPin(username: string): boolean {
  return PIN_RE.test(username);
}

const MEMORABLE_PATTERNS = ["aabb", "abab", "abba"] as const;

/** New codes people can say: 1122, 1212, or 1221. Stored lowercase. */
export function generateMemorablePin(randomInt: (max: number) => number): string {
  const pattern = MEMORABLE_PATTERNS[randomInt(MEMORABLE_PATTERNS.length)]!;
  const a = randomInt(10);
  let b = randomInt(9);
  if (b >= a) b += 1;
  const digits = [...pattern].map((slot) => String(slot === "a" ? a : b)).join("");
  return `${PIN_PREFIX}${digits}`;
}

export function isMemorablePin(pin: string): boolean {
  return /^w(\d)\1(\d)\2$/.test(pin) || /^w(\d)(\d)\1\2$/.test(pin) || /^w(\d)(\d)\2\1$/.test(pin);
}

/** Password a device generates for itself when the user starts without choosing one. */
export const DEVICE_SECRET_MIN_LENGTH = 32;

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 512;

export function validatePassword(password: string): "too_short" | "too_long" | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "too_short";
  if (password.length > MAX_PASSWORD_LENGTH) return "too_long";
  return null;
}

/** Display names: trimmed, 1–64 chars, no control characters or bidi overrides (anti-spoofing). */
export function normalizeDisplayName(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, "").trim();
  if (cleaned.length < 1 || cleaned.length > 64) return null;
  return cleaned;
}

/** Invite tokens are 32 random bytes, base64url (43 chars). */
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Accept a raw token or any URL whose last path segment / `#` fragment is a token. */
export function extractInviteToken(input: string): string | null {
  const trimmed = input.trim();
  if (INVITE_TOKEN_RE.test(trimmed)) return trimmed;
  const match = trimmed.match(/([A-Za-z0-9_-]{43})\/?$/);
  return match?.[1] && INVITE_TOKEN_RE.test(match[1]) ? match[1] : null;
}

export function matrixUserId(username: string, serverName: string): string {
  return `@${username}:${serverName}`;
}

export function usernameFromUserId(userId: string): string {
  return userId.replace(/^@/, "").split(":")[0] ?? userId;
}
