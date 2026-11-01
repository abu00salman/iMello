import { describe, expect, it } from "vitest";
import { extractInviteToken, normalizeDisplayName, validatePassword, validateUsername } from "./validation";

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
