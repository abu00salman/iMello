import { normalizePin } from "@imello/core";
/**
 * Plan an iMello Code alias without changing the Matrix username.
 * The account id, history, and the old number used to sign in all stay.
 * Dry-run by default. This module does not open a database.
 */
export interface CodeAccount {
  userId: string;
  username: string;
  code: string | null;
}

export interface RemapPlan {
  ok: boolean;
  reason: string;
  userId?: string;
  /** The Matrix username is never part of the write. */
  usernameUnchanged?: string;
  previousCode?: string | null;
  code?: string;
  sql?: string;
  rollback?: string;
}

const CODE_RE = /^w\d{4}$/;

export function planCodeAlias(rows: readonly CodeAccount[], fromUsername: string, toCode: string): RemapPlan {
  const from = fromUsername.trim().toLowerCase();
  const target = normalizePin(toCode) ?? toCode.trim().toLowerCase();
  if (!CODE_RE.test(target)) return { ok: false, reason: "target must look like w1122 (4 digits)" };
  const owner = rows.find((row) => row.username === from);
  if (!owner) return { ok: false, reason: `no account with username ${from}` };
  const taken = rows.find((row) => row.userId !== owner.userId && (row.username === target || row.code === target));
  if (taken) return { ok: false, reason: `${target} already belongs to ${taken.userId}` };
  if (owner.code === target) {
    return {
      ok: true,
      reason: "already aliased; nothing to write",
    userId: owner.userId,
    usernameUnchanged: owner.username,
    previousCode: owner.code,
    code: target,
    sql: "-- no change",
      rollback: "-- no change",
    };
  }
  const previous = owner.code;
  const sql = `UPDATE accounts SET code = '${target}' WHERE user_id = '${owner.userId}' AND username = '${owner.username}';`;
  const rollback = previous
    ? `UPDATE accounts SET code = '${previous}' WHERE user_id = '${owner.userId}' AND username = '${owner.username}';`
    : `UPDATE accounts SET code = NULL WHERE user_id = '${owner.userId}' AND username = '${owner.username}' AND code = '${target}';`;
  return {
    ok: true,
    reason: `alias ${target} for ${owner.username}; username and history stay`,
    userId: owner.userId,
    usernameUnchanged: owner.username,
    previousCode: previous,
    code: target,
    sql,
    rollback,
  };
}
