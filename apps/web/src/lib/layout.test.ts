import { describe, expect, it } from "vitest";
import { isPhoneLayout, type LayoutSignals } from "./layout";

const desktop: LayoutSignals = {
  width: 1440,
  hoverNone: false,
  pointerCoarse: false,
  maxTouchPoints: 0,
  platform: "Linux x86_64",
  ua: "Mozilla/5.0 (X11; Linux x86_64)",
};

describe("isPhoneLayout", () => {
  it("uses the mobile layout for a narrow window", () => {
    expect(isPhoneLayout({ ...desktop, width: 390 })).toBe(true);
  });

  it("uses the mobile layout for a coarse touch phone even when the viewport is reported wide", () => {
    expect(isPhoneLayout({ ...desktop, width: 980, hoverNone: true, pointerCoarse: true, maxTouchPoints: 5 })).toBe(true);
  });

  it("uses the mobile layout for an iPhone that requested the desktop website", () => {
    expect(
      isPhoneLayout({
        ...desktop,
        width: 980,
        platform: "MacIntel",
        maxTouchPoints: 5,
        ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      }),
    ).toBe(true);
  });

  it("keeps a wide mouse desktop on the desktop layout", () => {
    expect(isPhoneLayout(desktop)).toBe(false);
  });
});
