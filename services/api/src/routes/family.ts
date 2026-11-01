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
} from "../repo";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function registerFamilyRoutes(app: FastifyInstance) {
  const { db, config } = app.deps;

  async function familyView(familyId: string, userId: string) {
    const f = (await db.query("SELECT id, name, created_at FROM families WHERE id = $1", [familyId])).rows[0];
    const role = await familyRole(db, familyId, userId);
    if (!f || !role) throw new HttpError(404, "family_not_found");
    return { familyId: f.id, name: f.name, role, members: await familyMembers(db, familyId), createdAt: f.created_at.toISOString() };
  }

  app.post("/v1/families", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const me = await app.requireAccount(req);
    if (me.kind !== "adult") throw new HttpError(403, "adults_only");
    const { name } = z.object({ name: z.string().trim().min(1).max(64) }).parse(req.body);
    const familyId = await withTransaction(db, async (tx) => {
      const f = await tx.query<{ id: string }>("INSERT INTO families (name, created_by) VALUES ($1, $2) RETURNING id", [name, me.user_id]);
      const id = f.rows[0]!.id;
      await tx.query("INSERT INTO family_members (family_id, user_id, role) VALUES ($1, $2, 'admin')", [id, me.user_id]);
      await audit(tx, "family.created", me.user_id, null, { familyId: id });
      return id;
    });
    return reply.status(201).send(await familyView(familyId, me.user_id));
  });

  app.get("/v1/families", async (req) => {
    const me = await app.requireAccount(req);
    const r = await db.query<{ family_id: string }>("SELECT family_id FROM family_members WHERE user_id = $1", [me.user_id]);
    return { families: await Promise.all(r.rows.map((x) => familyView(x.family_id, me.user_id))) };
  });

  app.post<{ Params: { familyId: string } }>(
    "/v1/families/:familyId/invites",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const me = await app.requireAccount(req);
      const familyId = z.uuid().parse(req.params.familyId);
      const role = await familyRole(db, familyId, me.user_id);
      if (role !== "admin" && role !== "guardian") throw new HttpError(403, "family_admin_required");
      const token = newInviteToken();
      const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
      await db.query(
        "INSERT INTO invites (token_hash, kind, creator_id, family_id, expires_at) VALUES ($1, 'family', $2, $3, $4)",
        [hashToken(token), me.user_id, familyId, expiresAt],
      );
      await audit(db, "invite.created", me.user_id, null, { kind: "family", familyId });
      return reply
        .status(201)
        .send({ token, kind: "family", familyId, expiresAt: expiresAt.toISOString(), link: `${config.PUBLIC_WEB_URL}/#/i/${token}` });
    },
  );

  /** A guardian adds their own child to a family they administer. Their action is the guardian approval. */
  app.post<{ Params: { familyId: string } }>("/v1/families/:familyId/children", async (req) => {
    const me = await app.requireAccount(req);
    const familyId = z.uuid().parse(req.params.familyId);
    const { childUserId } = z.object({ childUserId: z.string().max(255) }).parse(req.body);
    const role = await familyRole(db, familyId, me.user_id);
    if (role !== "admin" && role !== "guardian") throw new HttpError(403, "family_admin_required");
    if (!(await isGuardianOf(db, me.user_id, childUserId))) throw new HttpError(403, "not_guardian");
    const child = await getAccount(db, childUserId);
    if (!child || child.status !== "active") throw new HttpError(404, "child_not_found");
    await withTransaction(db, async (tx) => {
      await tx.query(
        "INSERT INTO family_members (family_id, user_id, role) VALUES ($1, $2, 'child') ON CONFLICT DO NOTHING",
        [familyId, childUserId],
      );
      const members = await familyMembers(tx, familyId);
      const accounts = await getAccounts(tx, members.map((m) => m.userId));
      for (const m of members) {
        const other = accounts.get(m.userId);
        if (!other || other.user_id === childUserId) continue;
        await establishContact(tx, me.user_id, child, other, me.user_id);
      }
      await audit(tx, "family.child_added", me.user_id, childUserId, { familyId });
    });
    return familyView(familyId, me.user_id);
  });
}
