import { describe, expect, it } from "vitest";
import { PING_SOUNDS } from "../media/ping-tones";
import { FIXTURE_PROFILE, FIXTURE_ROWS, FIXTURE_THREAD, fixtureLocale, fixtureScreen } from "./fixture-data";

describe("layout fixture", () => {
  it("stays on the public demo cast", () => {
    const blob = JSON.stringify({ FIXTURE_PROFILE, FIXTURE_ROWS, FIXTURE_THREAD });
    expect(blob).not.toMatch(/Ameer|Dhafer|mell-\d|rrrr/i);
    expect(FIXTURE_ROWS.some((row) => row.kind === "locked")).toBe(true);
    expect(FIXTURE_THREAD.some((msg) => msg.locked)).toBe(true);
    expect(FIXTURE_ROWS.some((row) => row.kind === "ping")).toBe(true);
  });

  it("defaults the deep link to Arabic chats", () => {
    expect(fixtureLocale(undefined)).toBe("ar");
    expect(fixtureLocale("en")).toBe("en");
    expect(fixtureScreen(undefined)).toBe("chats");
    expect(fixtureScreen("ping")).toBe("ping");
    expect(fixtureScreen("nope")).toBe("chats");
  });

  it("offers the same five Ping choices as the web client", () => {
    expect(PING_SOUNDS).toEqual(["taps", "knock", "bell", "chirp", "drum"]);
  });
});
