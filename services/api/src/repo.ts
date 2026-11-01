import { createHash, randomBytes } from "node:crypto";
import {
  decideCommunication,
  decideRoomMembership,
  requiredChildApprovals,
  type AccountKind,
  type ContactStatus,
  type FamilyRole,
  type PairFacts,
  type PolicyAccount,
  type PolicyDecision,
} from "@imello/core";
import type { Queryable } from "./db";

export interface AccountRow {
  user_id: string;
  username: string;
  display_name: string;
  kind: AccountKind;
  status: "active" | "deactivated";
  locale: string;
  created_at: Date;
}

export function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function audit(
  db: Queryable,
  eventType: string,
  actorId: string | null,
  targetId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.query("INSERT INTO audit_events (event_type, actor_id, target_id, metadata) VALUES ($1, $2, $3, $4)", [
    eventType,
    actorId,
    targetId,
    JSON.stringify(metadata),
  ]);
}

export async function getAccount(db: Queryable, userId: string): Promise<AccountRow | null> {
  const r = await db.query<AccountRow>("SELECT * FROM accounts WHERE user_id = $1", [userId]);
  return r.rows[0] ?? null;
}

export async function getAccounts(db: Queryable, userIds: string[]): Promise<Map<string, AccountRow>> {
  if (userIds.length === 0) return new Map();
  const r = await db.query<AccountRow>("SELECT * FROM accounts WHERE user_id = ANY($1)", [userIds]);
  return new Map(r.rows.map((row) => [row.user_id, row]));
}

export function toPolicyAccount(row: AccountRow | null | undefined): PolicyAccount | null {
  return row ? { userId: row.user_id, kind: row.kind, status: row.status } : null;
}

export async function insertAccount(
  db: Queryable,
  a: { userId: string; username: string; displayName: string; kind: AccountKind; locale: string },
): Promise<void> {
  await db.query(
    "INSERT INTO accounts (user_id, username, display_name, kind, locale) VALUES ($1, $2, $3, $4, $5)",
    [a.userId, a.username, a.displayName, a.kind, a.locale],
  );
}

export async function guardiansOf(db: Queryable, childId: string): Promise<string[]> {
  const r = await db.query<{ guardian_id: string }>("SELECT guardian_id FROM guardianships WHERE child_id = $1", [childId]);
  return r.rows.map((x) => x.guardian_id);
}

export async function isGuardianOf(db: Queryable, guardianId: string, childId: string): Promise<boolean> {
  const r = await db.query("SELECT 1 FROM guardianships WHERE guardian_id = $1 AND child_id = $2", [guardianId, childId]);
  return (r.rowCount ?? 0) > 0;
}

/** Gather every fact the policy needs about a pair of users in one round-trip. */
export async function pairFacts(db: Queryable, a: string, b: string): Promise<PairFacts> {
  const [low, high] = orderedPair(a, b);
  const r = await db.query<{
    a_row: AccountRow | null;
    b_row: AccountRow | null;
    blocked: boolean;
    guardian: boolean;
    contact_status: ContactStatus | null;
  }>(
    `SELECT
       (SELECT row_to_json(x) FROM accounts x WHERE x.user_id = $1) AS a_row,
       (SELECT row_to_json(x) FROM accounts x WHERE x.user_id = $2) AS b_row,
       EXISTS (SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)) AS blocked,
       EXISTS (SELECT 1 FROM guardianships WHERE (guardian_id = $1 AND child_id = $2) OR (guardian_id = $2 AND child_id = $1)) AS guardian,
       (SELECT status FROM contacts WHERE user_low = $3 AND user_high = $4) AS contact_status`,
    [a, b, low, high],
  );
  const row = r.rows[0]!;
  return {
    a: toPolicyAccount(row.a_row),
    b: toPolicyAccount(row.b_row),
    blocked: row.blocked,
    guardianRelationship: row.guardian,
    contactStatus: row.contact_status,
  };
}

export async function decidePair(db: Queryable, a: string, b: string): Promise<PolicyDecision> {
  return decideCommunication(await pairFacts(db, a, b));
}

/** Policy for homeserver invites: inviter↔invitee must be permitted, and invitee must be allowed among existing members. */
export async function decideInvite(
  db: Queryable,
  inviter: string,
  invitee: string,
  roomMembers: string[],
): Promise<PolicyDecision> {
  const direct = await decidePair(db, inviter, invitee);
  if (!direct.allow) return direct;
  const room = await decideJoin(db, invitee, roomMembers.filter((m) => m !== inviter));
  return room.allow ? direct : room;
}

export async function decideJoin(db: Queryable, userId: string, roomMembers: string[]): Promise<PolicyDecision> {
  const members = [...new Set(roomMembers.filter((m) => m !== userId))];
  const accounts = await getAccounts(db, [userId, ...members]);
  const memberAccounts = new Map(members.map((m) => [m, toPolicyAccount(accounts.get(m))]));
  const facts = new Map<string, PairFacts>();
  for (const m of members) facts.set(m, await pairFacts(db, userId, m));
  return decideRoomMembership(
    toPolicyAccount(accounts.get(userId)),
    members,
    (_a, b) => facts.get(b)!,
    memberAccounts,
  );
}

/**
 * Create (or upgrade) a contact relationship between two accounts and the
 * guardian approvals it requires. `preApprovedBy` records a guardian who is
 * creating the relationship themselves (e.g. adding their child to a family).
 */
export async function establishContact(
  db: Queryable,
  initiatedBy: string,
  a: AccountRow,
  b: AccountRow,
  preApprovedBy: string | null = null,
): Promise<{ contactId: string; status: ContactStatus }> {
  const [low, high] = orderedPair(a.user_id, b.user_id);
  const existing = await db.query<{ id: string; status: ContactStatus }>(
    "SELECT id, status FROM contacts WHERE user_low = $1 AND user_high = $2",
    [low, high],
  );
  if (existing.rows[0]?.status === "accepted") return { contactId: existing.rows[0].id, status: "accepted" };

  const guardianPairs = await db.query<{ guardian_id: string; child_id: string }>(
    "SELECT guardian_id, child_id FROM guardianships WHERE child_id = ANY($1)",
    [[a.user_id, b.user_id]],
  );
  const isG = (g: string, c: string) => guardianPairs.rows.some((r) => r.guardian_id === g && r.child_id === c);
  let needed = requiredChildApprovals(toPolicyAccount(a)!, toPolicyAccount(b)!, isG);
  if (preApprovedBy) needed = needed.filter((childId) => !isG(preApprovedBy, childId));
  const status: ContactStatus = needed.length === 0 ? "accepted" : "pending_guardian";

  const contact = await db.query<{ id: string }>(
    `INSERT INTO contacts (user_low, user_high, status, initiated_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_low, user_high) DO UPDATE SET status = EXCLUDED.status, initiated_by = EXCLUDED.initiated_by, updated_at = now()
     RETURNING id`,
    [low, high, status, initiatedBy],
  );
  const contactId = contact.rows[0]!.id;
  await db.query("DELETE FROM contact_approvals WHERE contact_id = $1", [contactId]);
  for (const childId of needed) {
    await db.query("INSERT INTO contact_approvals (contact_id, child_id) VALUES ($1, $2)", [contactId, childId]);
  }
  return { contactId, status };
}

export async function familyRole(db: Queryable, familyId: string, userId: string): Promise<FamilyRole | null> {
  const r = await db.query<{ role: FamilyRole }>("SELECT role FROM family_members WHERE family_id = $1 AND user_id = $2", [
    familyId,
    userId,
  ]);
  return r.rows[0]?.role ?? null;
}

export async function familyMembers(db: Queryable, familyId: string) {
  const r = await db.query<{ user_id: string; display_name: string; role: FamilyRole; kind: AccountKind }>(
    `SELECT m.user_id, a.display_name, m.role, a.kind FROM family_members m
     JOIN accounts a ON a.user_id = m.user_id WHERE m.family_id = $1 AND a.status = 'active' ORDER BY m.joined_at`,
    [familyId],
  );
  return r.rows.map((m) => ({ userId: m.user_id, displayName: m.display_name, role: m.role, kind: m.kind }));
}
