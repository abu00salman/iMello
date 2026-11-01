import { describe, expect, it } from "vitest";
import ar from "./locales/ar.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };
import { direction, negotiateLocale, translate } from "./index";

describe("localization", () => {
  it("Arabic catalog has exactly the same keys as English", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it("no translation is empty", () => {
    for (const [key, value] of [...Object.entries(en), ...Object.entries(ar)]) {
      expect(value.trim(), key).not.toBe("");
    }
  });

  it("placeholders match between languages", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ar[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("interpolates variables", () => {
    expect(translate("en", "chat.invitedYou", { name: "Mona" })).toBe("Mona invited you to chat");
    expect(translate("ar", "chat.invitedYou", { name: "منى" })).toBe("دعاك منى إلى محادثة");
  });

  it("reports direction", () => {
    expect(direction("ar")).toBe("rtl");
    expect(direction("en")).toBe("ltr");
  });

  it("negotiates locale", () => {
    expect(negotiateLocale(["ar-SA", "en-US"])).toBe("ar");
    expect(negotiateLocale(["fr-FR"])).toBe("en");
    expect(negotiateLocale(undefined)).toBe("en");
  });
});
