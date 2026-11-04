/** A normal text message carrying this marker is shown as a Ping. No custom event type. */
export const PING_MARKER = "\u2063imello-nudge\u2063";
export const PING_COOLDOWN_MS = 15_000;

export function isPingBody(body: string | null | undefined): boolean {
  return typeof body === "string" && body.includes(PING_MARKER);
}

function key(roomId: string): string {
  return `imello.pingAt.${roomId}`;
}

export function markPingSent(roomId: string, now = Date.now()): void {
  try {
    localStorage.setItem(key(roomId), String(now));
  } catch {
    /* private mode */
  }
}

export function pingCooldownLeft(roomId: string, now = Date.now()): number {
  try {
    const at = Number(localStorage.getItem(key(roomId)) ?? 0);
    if (!Number.isFinite(at) || at <= 0) return 0;
    return Math.max(0, PING_COOLDOWN_MS - (now - at));
  } catch {
    return 0;
  }
}
