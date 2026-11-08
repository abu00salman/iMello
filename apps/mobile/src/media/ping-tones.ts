/** The same five Ping choices as the web client. Stored on this device only. */
export const PING_SOUNDS = ["taps", "knock", "bell", "chirp", "drum"] as const;
export type PingSound = (typeof PING_SOUNDS)[number];

export function isPingSound(value: string): value is PingSound {
  return (PING_SOUNDS as readonly string[]).includes(value);
}
