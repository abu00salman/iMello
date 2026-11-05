import { normalizePin } from "@imello/core";

/**
 * Accept the account id the server stores today (`mell-` and six digits) and the
 * shorter `Mell-XXXX` form. The result is the lowercase username to send to the API.
 */
export function normalizeImelloCode(input: string): string | null {
  const legacy = normalizePin(input);
  if (legacy) return legacy;
  const western = input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s_]/g, "");
  const match = /^mell-([a-z0-9]{4})$/i.exec(western);
  if (!match?.[1]) return null;
  return `mell-${match[1].toLowerCase()}`;
}

/** What people read: Mell-123456 or Mell-AB12. */
export function formatImelloCode(code: string | null | undefined): string {
  if (!code) return "";
  const match = /^mell-(.+)$/i.exec(code.trim());
  if (!match?.[1]) return code;
  const body = /^\d+$/.test(match[1]) ? match[1] : match[1].toUpperCase();
  return `Mell-${body}`;
}
