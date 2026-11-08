import { describe, expect, it } from "vitest";
import { shellFollowsKeyboard } from "./viewport";

describe("shellFollowsKeyboard", () => {
  it("leaves the shell alone during a normal pan", () => {
    expect(shellFollowsKeyboard(844, 844)).toBe(false);
    expect(shellFollowsKeyboard(844, 780)).toBe(false);
  });

  it("follows the visual viewport only when the keyboard has shrunk it", () => {
    expect(shellFollowsKeyboard(844, 500)).toBe(true);
  });
});
