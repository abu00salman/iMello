import { describe, expect, it } from "vitest";
import { displayPin, extractInviteToken, generateMemorablePin, isMemorablePin, normalizeDisplayName, normalizePin, validatePassword, validateUsername } from "./validation";

describe("validation", () => {
  it("validates usernames", () => {
    expect(validateUsername("mona.k")).toBeNull();
    expect(validateUsername("ab")).toBe("length");
    expect(validateUsername("Mona")).toBe("characters");
    expect(validateUsername("mona!")).toBe("characters");
    expect(validateUsername(".mona")).toBe("characters");
    expect(validateUsername("admin")).toBe("reserved");
    expect(validateUsername("imello-team")).toBe("reserved");
  });
  it("reserves the mell- prefix for generated numbers", () => {
    expect(validateUsername("mell-123456")).toBe("reserved");
  });
  it("reserves code-shaped usernames but not ordinary names starting with w", () => {
    expect(validateUsername("w1122")).toBe("reserved");
    expect(validateUsername("wael")).toBeNull();
  });
  it("normalizes Wanas codes (w1122) and older numbers", () => {
    expect(normalizePin("w1122")).toBe("w1122");
    expect(normalizePin("W 1122")).toBe("w1122");
    expect(normalizePin("1122")).toBe("w1122");
    expect(normalizePin("w447729")).toBeNull();
    expect(displayPin("mell-1122")).toBe("w1122");
    expect(displayPin("mell-447729")).toBe("Mell-447729");
    expect(normalizePin("mell-447729")).toBe("mell-447729");
    expect(normalizePin("MELL-447 729")).toBe("mell-447729");
    expect(normalizePin("447729")).toBe("mell-447729");
    expect(normalizePin("mell447729")).toBe("mell-447729");
    expect(normalizePin("٤٤٧٧٢٩")).toBe("mell-447729");
    expect(normalizePin("mell-4477")).toBe("w4477");
    expect(normalizePin("Mell-1122")).toBe("w1122");
    expect(normalizePin("mell-44771")).toBeNull();
    expect(normalizePin("hello")).toBeNull();
  });
  it("issues memorable 4-digit codes", () => {
    let n = 0;
    const randomInt = (max: number) => {
      n += 1;
      return n % max;
    };
    const pin = generateMemorablePin(randomInt);
    expect(pin).toMatch(/^w\d{4}$/);
    expect(isMemorablePin(pin)).toBe(true);
    expect(isMemorablePin("w1122")).toBe(true);
    expect(isMemorablePin("mell-447729")).toBe(false);
  });
  it("validates passwords", () => {
    expect(validatePassword("short")).toBe("too_short");
    expect(validatePassword("long enough pass")).toBeNull();
  });
  it("strips bidi overrides and control chars from display names", () => {
    expect(normalizeDisplayName("  Mona‮ ")).toBe("Mona");
    expect(normalizeDisplayName("\u0000")).toBeNull();
    expect(normalizeDisplayName("منى")).toBe("منى");
  });
  it("extracts invite tokens from links", () => {
    const t = "A".repeat(43);
    expect(extractInviteToken(t)).toBe(t);
    expect(extractInviteToken(`https://app.imello.example/#/i/${t}`)).toBe(t);
    expect(extractInviteToken("not a token")).toBeNull();
  });
});
