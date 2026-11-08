import { displayPin, normalizePin } from "@imello/core";

/**
 * What sign-in and "add by code" send to the API.
 *
 * The shape is owned by `@imello/core` (`normalizePin`): `mell-` plus 4 digits
 * (`mell-1122`, shown as Mell-1122) or the older 6 digits (`mell-447729`).
 * This app does not allocate codes and does not parse a second format.
 * When the shared contract changes, this function follows it.
 */
export function normalizeImelloCode(input: string): string | null {
  return normalizePin(input);
}

/** What people read: Mell-1122 or Mell-447729. */
export function formatImelloCode(code: string | null | undefined): string {
  if (!code) return "";
  const normalized = normalizePin(code);
  return normalized ? displayPin(normalized) : code.trim();
}
