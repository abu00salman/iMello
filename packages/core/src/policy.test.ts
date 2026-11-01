import { describe, expect, it } from "vitest";
import { decideCommunication, decideRoomMembership, requiredChildApprovals, type PairFacts } from "./policy";
import type { PolicyAccount } from "./types";

const adult = (id: string): PolicyAccount => ({ userId: id, kind: "adult", status: "active" });
const child = (id: string): PolicyAccount => ({ userId: id, kind: "child", status: "active" });
const facts = (p: Partial<PairFacts>): PairFacts => ({
  a: adult("@a:x"), b: adult("@b:x"), blocked: false, guardianRelationship: false, contactStatus: null, ...p,
});

describe("decideCommunication", () => {
  it("denies strangers (closed by default)", () => {
    expect(decideCommunication(facts({}))).toEqual({ allow: false, reason: "not_a_contact" });
  });
  it("allows accepted contacts", () => {
    expect(decideCommunication(facts({ contactStatus: "accepted" })).allow).toBe(true);
  });
  it("denies while guardian approval is pending", () => {
    expect(decideCommunication(facts({ b: child("@c:x"), contactStatus: "pending_guardian" })))
      .toEqual({ allow: false, reason: "awaiting_guardian_approval" });
  });
  it("denies a guardian-denied contact", () => {
    expect(decideCommunication(facts({ contactStatus: "denied" })).reason).toBe("contact_denied");
  });
  it("blocking overrides an accepted contact and a guardian relationship", () => {
    expect(decideCommunication(facts({ contactStatus: "accepted", blocked: true })).reason).toBe("blocked");
    expect(decideCommunication(facts({ guardianRelationship: true, blocked: true })).reason).toBe("blocked");
  });
  it("allows guardian and child", () => {
    expect(decideCommunication(facts({ b: child("@c:x"), guardianRelationship: true })).allow).toBe(true);
  });
  it("fails closed on unknown or deactivated accounts", () => {
    expect(decideCommunication(facts({ b: null })).reason).toBe("unknown_account");
    expect(decideCommunication(facts({ b: { ...adult("@b:x"), status: "deactivated" }, contactStatus: "accepted" })).reason)
      .toBe("deactivated");
  });
});

describe("requiredChildApprovals", () => {
  const noGuardians = () => false;
  it("adult ↔ adult needs no approval", () => {
    expect(requiredChildApprovals(adult("@a:x"), adult("@b:x"), noGuardians)).toEqual([]);
  });
  it("adult ↔ child needs the child's guardian", () => {
    expect(requiredChildApprovals(adult("@a:x"), child("@c:x"), noGuardians)).toEqual(["@c:x"]);
    expect(requiredChildApprovals(child("@c:x"), adult("@a:x"), noGuardians)).toEqual(["@c:x"]);
  });
  it("child ↔ child needs both guardians", () => {
    expect(requiredChildApprovals(child("@c1:x"), child("@c2:x"), noGuardians)).toEqual(["@c1:x", "@c2:x"]);
  });
  it("a guardian connecting to their own child needs no approval", () => {
    const isG = (g: string, c: string) => g === "@p:x" && c === "@c:x";
    expect(requiredChildApprovals(adult("@p:x"), child("@c:x"), isG)).toEqual([]);
  });
});

describe("decideRoomMembership", () => {
  const accounts = new Map<string, PolicyAccount | null>([
    ["@p:x", adult("@p:x")], ["@c:x", child("@c:x")], ["@s:x", adult("@s:x")], ["@t:x", adult("@t:x")],
  ]);
  const pair = (a: string, b: string): PairFacts => {
    const key = [a, b].sort().join("|");
    const guardian = key === "@c:x|@p:x";
    const accepted = key === "@p:x|@t:x" || key === "@s:x|@t:x";
    return { a: accounts.get(a) ?? null, b: accounts.get(b) ?? null, blocked: false, guardianRelationship: guardian, contactStatus: accepted ? "accepted" : null };
  };
  it("lets a child join a room with only permitted members", () => {
    expect(decideRoomMembership(child("@c:x"), ["@p:x"], pair, accounts).allow).toBe(true);
  });
  it("stops a child joining a group containing a stranger", () => {
    expect(decideRoomMembership(child("@c:x"), ["@p:x", "@s:x"], pair, accounts))
      .toEqual({ allow: false, reason: "room_member_not_permitted" });
  });
  it("stops a stranger joining a group containing a child", () => {
    expect(decideRoomMembership(adult("@s:x"), ["@p:x", "@c:x"], pair, accounts).allow).toBe(false);
  });
  it("adults-only rooms are not constrained by the child rule", () => {
    expect(decideRoomMembership(adult("@s:x"), ["@t:x", "@p:x"], pair, accounts).allow).toBe(true);
  });
  it("treats unknown members as requiring a permitted relationship", () => {
    expect(decideRoomMembership(adult("@s:x"), ["@ghost:x"], pair, accounts).allow).toBe(false);
  });
});
