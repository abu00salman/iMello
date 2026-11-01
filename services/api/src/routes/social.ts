import { INVITE_TOKEN_RE } from "@imello/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../app";
import { withTransaction } from "../db";
import {
  audit,
  establishContact,
  familyMembers,
  familyRole,
  getAccount,
  getAccounts,
  hashToken,
  isGuardianOf,
  newInviteToken,
  orderedPair,
  type AccountRow,
} from "../repo";
import { createAccount, registerBody } from "./public";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const tokenSchema = z.object({ token: z.string().regex(INVITE_TOKEN_RE) });
const userIdSchema = z.string().regex(/^@[a-z0-9._=/-]+:[A-Za-z0-9.:-]+$/).max(255);

interface InviteRow {
  id: string;
  kind: "contact" | "family";
  creator_id: string;
  family_id: string | null;
  expires_at: Date;
  max_uses: number;
  uses: number;
  revoked_at: Date | null;
}

export async function registerSocialRoutes(app: FastifyInstance) {
  const { db, config } = app.deps;

  // ── Invitations ────────────────────────────────────────────────────────────
  app.post("/v1/invites", { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } }, async (req, reply) => {
    const me = await app.requireAccount(req);
    z.object({ kind: z.literal("contact") }).parse(req.body);
    const token = newInviteToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await db.query("INSERT INTO invites (token_hash, kind, creator_id, expires_at) VALUES ($1, 'contact', $2, $3)", [
      hashToken(token),
      me.user_id,
      expiresAt,
    ]);
    await audit(db, "invite.created", me.user_id, null, { kind: "contact" });
    return reply.status(201).send({ token, kind: "contact", expiresAt: expiresAt.toISOString(), link: `${config.PUBLIC_WEB_URL}/#/i/${token}` });
  });

  /** Show who an invite is from before accepting. Requires the unguessable token, so it cannot be used for enumeration. */
  app.post("/v1/invites/preview", { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async (req) => {
    await app.requireAccount(req);
    const { token } = tokenSchema.parse(req.body);
    const invite = await findUsableInvite(token);
    const creator = await getAccount(db, invite.creator_id);
    const family = invite.family_id
      ? (await db.query("SELECT name FROM families WHERE id = $1", [invite.family_id])).rows[0]
      : null;
    return {
      kind: invite.kind,
      inviterDisplayName: creator?.display_name ?? "",
      familyName: family?.name ?? null,
      expiresAt: invite.expires_at.toISOString(),
    };
  });

  app.post("/v1/invites/redeem", { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async (req) => {
    const me = await app.requireAccount(req);
    const { token } = tokenSchema.parse(req.body);
    return withTransaction(db, async (tx) => {
      // Lock the invite row so concurrent redemptions cannot exceed max_uses.
      const r = await tx.query<InviteRow>("SELECT * FROM invites WHERE token_hash = $1 FOR UPDATE", [hashToken(token)]);
      const invite = assertUsable(r.rows[0]);
      if (invite.creator_id === me.user_id) throw new HttpError(400, "own_invite");
      const creator = await getAccount(tx, invite.creator_id);
      if (!creator || creator.status !== "active") throw new HttpError(404, "invite_not_found");
      await tx.query("UPDATE invites SET uses = uses + 1 WHERE id = $1", [invite.id]);

      if (invite.kind === "contact") {
        const contact = await establishContact(tx, me.user_id, creator, me);
        await audit(tx, "contact.redeemed", me.user_id, creator.user_id, { status: contact.status });
        return { contact: { contactId: contact.contactId, userId: creator.user_id, status: contact.status } };
      }

      // Family invite: join the family, and become a contact of each member.
      const familyId = invite.family_id!;
      // A child cannot add themselves to a family through a link; a guardian must add them.
      if (me.kind === "child") throw new HttpError(403, "child_requires_guardian");
      // Only family admins/guardians can create family invites; re-check in case their role changed.
      const creatorRole = await familyRole(tx, familyId, invite.creator_id);
      if (creatorRole !== "admin" && creatorRole !== "guardian") throw new HttpError(404, "invite_not_found");
      await tx.query(
        "INSERT INTO family_members (family_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING",
        [familyId, me.user_id],
      );
      const members = await familyMembers(tx, familyId);
      const accounts = await getAccounts(tx, members.map((m) => m.userId));
      for (const m of members) {
        if (m.userId === me.user_id) continue;
        const other = accounts.get(m.userId);
        if (!other) continue;
        // The invite creator is a family admin; if they are this child's guardian, their invite is their approval.
        await establishContact(tx, me.user_id, me, other, invite.creator_id);
      }
      const family = (await tx.query("SELECT id, name FROM families WHERE id = $1", [familyId])).rows[0];
      await audit(tx, "family.joined", me.user_id, null, { familyId });
      return { family: { familyId: family.id, name: family.name } };
    });
  });

  async function findUsableInvite(token: string): Promise<InviteRow> {
    const r = await db.query<InviteRow>("SELECT * FROM invites WHERE token_hash = $1", [hashToken(token)]);
    return assertUsable(r.rows[0]);
  }

  function assertUsable(invite: InviteRow | undefined): InviteRow {
    // Every failure mode returns the same response, so an invalid token reveals nothing.
    if (!invite || invite.revoked_at || invite.expires_at.getTime() < Date.now() || invite.uses >= invite.max_uses) {
      throw new HttpError(404, "invite_not_found");
    }
    return invite;
  }

  // ── Contacts ───────────────────────────────────────────────────────────────
  app.get("/v1/contacts", async (req) => {
    const me = await app.requireAccount(req);
    const r = await db.query<{ id: string; other: string; status: string; created_at: Date; display_name: string; kind: string }>(
      `SELECT c.id, CASE WHEN c.user_low = $1 THEN c.user_high ELSE c.user_low END AS other, c.status, c.created_at,
              a.display_name, a.kind
       FROM contacts c
       JOIN accounts a ON a.user_id = CASE WHEN c.user_low = $1 THEN c.user_high ELSE c.user_low END
       WHERE (c.user_low = $1 OR c.user_high = $1) AND c.status <> 'denied' AND a.status = 'active'
       ORDER BY a.display_name`,
      [me.user_id],
    );
    // Guardians and their children are always contacts of each other.
    const g = await db.query<{ user_id: string; display_name: string; kind: string; created_at: Date }>(
      `SELECT a.user_id, a.display_name, a.kind, gs.created_at FROM guardianships gs
       JOIN accounts a ON a.user_id = CASE WHEN gs.guardian_id = $1 THEN gs.child_id ELSE gs.guardian_id END
       WHERE (gs.guardian_id = $1 OR gs.child_id = $1) AND a.status = 'active'`,
      [me.user_id],
    );
    const contacts = r.rows.map((c) => ({
      contactId: c.id, userId: c.other, displayName: c.display_name, kind: c.kind, status: c.status, createdAt: c.created_at.toISOString(),
    }));
    for (const x of g.rows) {
      if (!contacts.some((c) => c.userId === x.user_id)) {
        contacts.push({ contactId: `guardian:${x.user_id}`, userId: x.user_id, displayName: x.display_name, kind: x.kind, status: "accepted", createdAt: x.created_at.toISOString() });
      }
    }
    return { contacts };
  });

  app.delete<{ Params: { userId: string } }>("/v1/contacts/:userId", async (req) => {
    const me = await app.requireAccount(req);
    const other = userIdSchema.parse(req.params.userId);
    const [low, high] = orderedPair(me.user_id, other);
    await db.query("DELETE FROM contacts WHERE user_low = $1 AND user_high = $2", [low, high]);
    await audit(db, "contact.removed", me.user_id, other);
    return { removed: true };
  });

  // ── Blocking & reporting ───────────────────────────────────────────────────
  app.post("/v1/blocks", async (req) => {
    const me = await app.requireAccount(req);
    const { userId } = z.object({ userId: userIdSchema }).parse(req.body);
    if (userId === me.user_id) throw new HttpError(400, "cannot_block_self");
    await db.query("INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [me.user_id, userId]);
    await audit(db, "user.blocked", me.user_id, userId);
    return { blocked: true };
  });

  app.delete<{ Params: { userId: string } }>("/v1/blocks/:userId", async (req) => {
    const me = await app.requireAccount(req);
    const userId = userIdSchema.parse(req.params.userId);
    await db.query("DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2", [me.user_id, userId]);
    await audit(db, "user.unblocked", me.user_id, userId);
    return { unblocked: true };
  });

  app.post("/v1/reports", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const me = await app.requireAccount(req);
    const body = z
      .object({
        userId: userIdSchema,
        reason: z.enum(["spam", "harassment", "impersonation", "inappropriate_content", "child_safety", "other"]),
        details: z.string().max(2000).optional(),
      })
      .parse(req.body);
    await db.query("INSERT INTO reports (reporter_id, reported_id, reason, details) VALUES ($1, $2, $3, $4)", [
      me.user_id, body.userId, body.reason, body.details ?? null,
    ]);
    await audit(db, "user.reported", me.user_id, body.userId, { reason: body.reason });
    return reply.status(201).send({ reported: true });
  });

  // ── Guardian controls ──────────────────────────────────────────────────────
  app.post("/v1/guardian/children", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const me = await requireAdult(req);
    const body = registerBody.parse(req.body);
    const child = await createAccount(app, body, "child");
    await withTransaction(db, async (tx) => {
      await tx.query("INSERT INTO guardianships (guardian_id, child_id) VALUES ($1, $2)", [me.user_id, child.userId]);
      // Any family the guardian administers gains the child automatically.
      await audit(tx, "child.created", me.user_id, child.userId);
    });
    return reply.status(201).send({ userId: child.userId, username: child.username, displayName: child.displayName, createdAt: new Date().toISOString() });
  });

  app.get("/v1/guardian/children", async (req) => {
    const me = await app.requireAccount(req);
    const r = await db.query<AccountRow>(
      `SELECT a.* FROM guardianships g JOIN accounts a ON a.user_id = g.child_id
       WHERE g.guardian_id = $1 AND a.status = 'active' ORDER BY a.created_at`,
      [me.user_id],
    );
    return {
      children: r.rows.map((c) => ({ userId: c.user_id, username: c.username, displayName: c.display_name, createdAt: c.created_at.toISOString() })),
    };
  });

  app.get("/v1/guardian/approvals", async (req) => {
    const me = await app.requireAccount(req);
    const r = await db.query(
      `SELECT ap.id, ap.contact_id, ap.child_id, ca.display_name AS child_name, ap.created_at,
              CASE WHEN c.user_low = ap.child_id THEN c.user_high ELSE c.user_low END AS requester,
              ra.display_name AS requester_name
       FROM contact_approvals ap
       JOIN guardianships g ON g.child_id = ap.child_id AND g.guardian_id = $1
       JOIN contacts c ON c.id = ap.contact_id
       JOIN accounts ca ON ca.user_id = ap.child_id
       JOIN accounts ra ON ra.user_id = CASE WHEN c.user_low = ap.child_id THEN c.user_high ELSE c.user_low END
       WHERE ap.decision = 'pending'
       ORDER BY ap.created_at`,
      [me.user_id],
    );
    return {
      approvals: r.rows.map((a) => ({
        approvalId: a.id, contactId: a.contact_id, childUserId: a.child_id, childDisplayName: a.child_name,
        requesterUserId: a.requester, requesterDisplayName: a.requester_name, createdAt: a.created_at.toISOString(),
      })),
    };
  });

  app.post<{ Params: { approvalId: string } }>("/v1/guardian/approvals/:approvalId", async (req) => {
    const me = await app.requireAccount(req);
    const approvalId = z.uuid().parse(req.params.approvalId);
    const { decision } = z.object({ decision: z.enum(["approve", "deny"]) }).parse(req.body);
    return withTransaction(db, async (tx) => {
      const r = await tx.query("SELECT * FROM contact_approvals WHERE id = $1 FOR UPDATE", [approvalId]);
      const approval = r.rows[0];
      if (!approval || !(await isGuardianOf(tx, me.user_id, approval.child_id))) throw new HttpError(404, "approval_not_found");
      if (approval.decision !== "pending") throw new HttpError(409, "already_decided");
      await tx.query("UPDATE contact_approvals SET decision = $2, decided_by = $3, decided_at = now() WHERE id = $1", [
        approvalId, decision === "approve" ? "approved" : "denied", me.user_id,
      ]);
      const all = await tx.query<{ decision: string }>("SELECT decision FROM contact_approvals WHERE contact_id = $1", [approval.contact_id]);
      const status = all.rows.some((x) => x.decision === "denied")
        ? "denied"
        : all.rows.every((x) => x.decision === "approved")
          ? "accepted"
          : "pending_guardian";
      await tx.query("UPDATE contacts SET status = $2, updated_at = now() WHERE id = $1", [approval.contact_id, status]);
      await audit(tx, `guardian.contact_${decision}`, me.user_id, approval.child_id, { contactId: approval.contact_id });
      return { contactStatus: status };
    });
  });

  async function requireAdult(req: Parameters<typeof app.requireAccount>[0]) {
    const me = await app.requireAccount(req);
    if (me.kind !== "adult") throw new HttpError(403, "adults_only");
    return me;
  }
}
