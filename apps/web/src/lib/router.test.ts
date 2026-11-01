import { describe, expect, it } from "vitest";
import { href, parseRoute } from "./router";

describe("router", () => {
  it("parses routes", () => {
    expect(parseRoute("")).toEqual({ name: "chats" });
    expect(parseRoute("#/chats/!abc%3Aimello")).toEqual({ name: "chats", roomId: "!abc:imello" });
    expect(parseRoute("#/family")).toEqual({ name: "family" });
    expect(parseRoute("#/i/" + "A".repeat(43))).toEqual({ name: "invite", token: "A".repeat(43) });
    expect(parseRoute("#/unknown")).toEqual({ name: "chats" });
  });
  it("round-trips room ids with special characters", () => {
    const route = { name: "chats" as const, roomId: "!x/y:z" };
    expect(parseRoute(href(route))).toEqual(route);
  });
});
