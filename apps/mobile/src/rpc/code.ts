import { displayPin, normalizePin } from "@imello/core";

/**
 * What sign-in and "add by code" send to the API.
 *
 * The shape is owned by `@imello/core` (`normalizePin`): `w` plus 4 digits (`w1122`),
 * with the older `mell-` spellings still accepted.
 * This app does not allocate codes and does not parse a second format.
 * When the shared contract changes, this function follows it.
 */
export function normalizeImelloCode(input: string): string | null {
  return normalizePin(input);
}

/** What people read: w1122 (or Mell-447729 for an old number without a code). */
export function formatImelloCode(code: string | null | undefined): string {
  if (!code) return "";
  const normalized = normalizePin(code);
  return normalized ? displayPin(normalized) : code.trim();
}
