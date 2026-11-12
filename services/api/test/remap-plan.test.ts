import { describe, expect, it } from "vitest";
import { planCodeAlias, type CodeAccount } from "../src/remap-plan";

const owner: CodeAccount = { userId: "user-ceo", username: "mell-872864", code: null };
const other: CodeAccount = { userId: "user-other", username: "mell-1000", code: "w1122" };

describe("planCodeAlias", () => {
  it("plans w1122 as an alias and leaves the old username in place", () => {
    const plan = planCodeAlias([owner], "mell-872864", "w1122");
    expect(plan.ok).toBe(true);
    expect(plan.usernameUnchanged).toBe("mell-872864");
    expect(plan.code).toBe("w1122");
    expect(plan.sql).toContain("SET code = 'w1122'");
    expect(plan.sql).not.toMatch(/SET username/);
    expect(plan.rollback).toContain("SET code = NULL");
    expect(plan.rollback).toContain("mell-872864");
  });

  it("refuses a code that already belongs to someone else", () => {
    const plan = planCodeAlias([owner, other], "mell-872864", "w1122");
    expect(plan.ok).toBe(false);
    expect(plan.reason).toContain("user-other");
    expect(plan.sql).toBeUndefined();
  });

  it("does nothing when the alias is already set", () => {
    const plan = planCodeAlias([{ ...owner, code: "w1122" }], "mell-872864", "w1122");
    expect(plan.ok).toBe(true);
    expect(plan.sql).toBe("-- no change");
  });
});
