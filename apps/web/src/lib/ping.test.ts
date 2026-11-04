import { beforeEach, describe, expect, it, vi } from "vitest";
import { PING_COOLDOWN_MS, PING_MARKER, isPingBody, markPingSent, pingCooldownLeft } from "./ping";

beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  });
});

describe("ping marker", () => {
  it("recognises only messages that carry the marker", () => {
    expect(isPingBody(null)).toBe(false);
    expect(isPingBody("نكزة!")).toBe(false);
    expect(isPingBody(PING_MARKER)).toBe(true);
    expect(isPingBody(`hello ${PING_MARKER}`)).toBe(true);
  });

  it("enforces one ping per 15 seconds in a chat", () => {
    const room = "room-1";
    markPingSent(room, 1_000);
    expect(pingCooldownLeft(room, 1_000)).toBe(PING_COOLDOWN_MS);
    expect(pingCooldownLeft(room, 1_000 + PING_COOLDOWN_MS)).toBe(0);
    expect(pingCooldownLeft("other", 1_000)).toBe(0);
  });
});
