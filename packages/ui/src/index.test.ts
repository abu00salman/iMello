import { describe, expect, it } from "vitest";
import { contrastRatio, darkScheme, lightScheme, schemeToCssVariables } from "./index";

describe("design tokens", () => {
  for (const [name, scheme] of [["light", lightScheme], ["dark", darkScheme]] as const) {
    it(`${name}: body text meets WCAG AA (4.5:1)`, () => {
      expect(contrastRatio(scheme.textPrimary, scheme.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(scheme.textPrimary, scheme.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(scheme.bubbleIncomingText, scheme.bubbleIncoming)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(scheme.textSecondary, scheme.surface)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${name}: outgoing bubble text meets AA large/UI (3:1) and button text 4.5:1`, () => {
      expect(contrastRatio(scheme.bubbleOutgoingText, scheme.bubbleOutgoing)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(scheme.accentText, scheme.accent)).toBeGreaterThanOrEqual(3);
    });
  }

  it("maps camelCase keys to CSS variables", () => {
    expect(schemeToCssVariables(lightScheme)["--color-bubble-outgoing"]).toBe(lightScheme.bubbleOutgoing);
  });
});
