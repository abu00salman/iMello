export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;
export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "support", "help", "security", "imello", "system",
  "moderator", "official", "staff", "abuse", "noreply", "postmaster", "guardian", "service",
]);

export type UsernameProblem = "length" | "characters" | "reserved";

export function validateUsername(username: string): UsernameProblem | null {
  if (username.length < 3 || username.length > 32) return "length";
  if (!USERNAME_RE.test(username)) return "characters";
  if (RESERVED_USERNAMES.has(username) || username.startsWith("imello") || username.startsWith(PIN_PREFIX)) return "reserved";
  return null;
}

/** iMello numbers ("PINs"), BBM-style: `mell-` + 6 digits, e.g. mell-447729. They are the account's username. */
export const PIN_PREFIX = "mell-";
export const PIN_DIGITS = 6;
export const PIN_RE = /^mell-\d{6}$/;

/** Accept what people actually type: "MELL-447 729", "mell447729", "447729", "٤٤٧٧٢٩" (Arabic-Indic digits). */
export function normalizePin(input: string): string | null {
  const western = input.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const compact = western.toLowerCase().replace(/[\s_-]/g, "");
  const digits = compact.startsWith("mell") ? compact.slice(4) : compact;
  if (!/^\d+$/.test(digits) || digits.length !== PIN_DIGITS) return null;
  return `${PIN_PREFIX}${digits}`;
}

export function isPin(username: string): boolean {
  return PIN_RE.test(username);
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
