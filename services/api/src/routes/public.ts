import { normalizeDisplayName, validatePassword, validateUsername } from "@imello/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../app";
import { withTransaction } from "../db";
import { HomeserverError } from "../homeserver";
import { audit, guardiansOf, insertAccount } from "../repo";

export const registerBody = z.object({
  username: z.string().max(64),
  password: z.string().max(1024),
  displayName: z.string().max(256),
  locale: z.enum(["en", "ar"]).default("en"),
});

/** Create an account on the homeserver, then record it. Shared by self-registration and guardian-created child accounts. */
export async function createAccount(
  app: FastifyInstance,
  input: z.infer<typeof registerBody>,
  kind: "adult" | "child",
) {
  const username = input.username.trim().toLowerCase();
  const usernameProblem = validateUsername(username);
  if (usernameProblem) throw new HttpError(400, `username_${usernameProblem}`);
  const passwordProblem = validatePassword(input.password);
  if (passwordProblem) throw new HttpError(400, `password_${passwordProblem}`);
  const displayName = normalizeDisplayName(input.displayName);
  if (!displayName) throw new HttpError(400, "display_name_invalid");

  let userId: string;
  try {
    ({ userId } = await app.deps.homeserver.registerUser(username, input.password, displayName));
  } catch (err) {
    if (err instanceof HomeserverError && (err.errcode === "M_USER_IN_USE" || err.errcode === "M_EXCLUSIVE")) {
      throw new HttpError(409, "username_unavailable");
    }
    if (err instanceof HomeserverError && err.errcode === "M_INVALID_USERNAME") throw new HttpError(400, "username_characters");
    throw err;
  }
  await insertAccount(app.deps.db, { userId, username, displayName, kind, locale: input.locale });
  return { userId, username, displayName };
}

export async function registerPublicRoutes(app: FastifyInstance) {
  const { config, db } = app.deps;

  app.get("/v1/config", async () => ({
    homeserverUrl: config.PUBLIC_HOMESERVER_URL,
    serverName: config.MATRIX_SERVER_NAME,
  }));

  app.post(
    "/v1/auth/register",
    { config: { rateLimit: { max: config.REGISTRATION_RATE_LIMIT, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const body = registerBody.parse(req.body);
      const account = await createAccount(app, body, "adult");
      await audit(db, "account.registered", account.userId, null, { kind: "adult" });
      return reply.status(201).send({
        userId: account.userId,
        homeserverUrl: config.PUBLIC_HOMESERVER_URL,
        serverName: config.MATRIX_SERVER_NAME,
      });
    },
  );

  app.get("/v1/me", async (req) => {
    const me = await app.requireAccount(req);
    return {
      userId: me.user_id,
      username: me.username,
      displayName: me.display_name,
      kind: me.kind,
      locale: me.locale,
      createdAt: me.created_at.toISOString(),
      guardians: await guardiansOf(db, me.user_id),
    };
  });

  app.patch("/v1/me", async (req) => {
    const me = await app.requireAccount(req);
    const body = z.object({ displayName: z.string().max(256).optional(), locale: z.enum(["en", "ar"]).optional() }).parse(req.body);
    const displayName = body.displayName === undefined ? me.display_name : normalizeDisplayName(body.displayName);
    if (!displayName) throw new HttpError(400, "display_name_invalid");
    const r = await db.query(
      "UPDATE accounts SET display_name = $2, locale = $3 WHERE user_id = $1 RETURNING *",
      [me.user_id, displayName, body.locale ?? me.locale],
    );
    const row = r.rows[0];
    return {
      userId: row.user_id, username: row.username, displayName: row.display_name, kind: row.kind,
      locale: row.locale, createdAt: row.created_at.toISOString(), guardians: await guardiansOf(db, me.user_id),
    };
  });

  /** Export everything iMello's policy service stores about the caller. */
  app.get("/v1/me/export", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (req) => {
    const me = await app.requireAccount(req);
    const q = (sql: string) => db.query(sql, [me.user_id]).then((r) => r.rows);
    return {
      exportedAt: new Date().toISOString(),
      note: "Messages are end-to-end encrypted on the homeserver and are not part of this export.",
      account: me,
      contacts: await q("SELECT * FROM contacts WHERE user_low = $1 OR user_high = $1"),
      guardianships: await q("SELECT * FROM guardianships WHERE guardian_id = $1 OR child_id = $1"),
      families: await q("SELECT f.*, m.role FROM families f JOIN family_members m ON m.family_id = f.id WHERE m.user_id = $1"),
      blocks: await q("SELECT blocked_id, created_at FROM blocks WHERE blocker_id = $1"),
      reportsFiled: await q("SELECT reported_id, reason, created_at FROM reports WHERE reporter_id = $1"),
      securityEvents: await q("SELECT event_type, created_at FROM audit_events WHERE actor_id = $1 ORDER BY id DESC LIMIT 500"),
    };
  });

  /**
   * Delete iMello policy data and deactivate the account in the policy layer
   * (so the homeserver immediately refuses new conversations with it). The
   * client then deactivates the homeserver account itself, which requires the
   * user's password.
   */
  app.delete("/v1/me", async (req) => {
    const me = await app.requireAccount(req);
    await withTransaction(db, async (tx) => {
      await tx.query("DELETE FROM contacts WHERE user_low = $1 OR user_high = $1", [me.user_id]);
      await tx.query("DELETE FROM invites WHERE creator_id = $1", [me.user_id]);
      await tx.query("DELETE FROM family_members WHERE user_id = $1", [me.user_id]);
      await tx.query("DELETE FROM blocks WHERE blocker_id = $1", [me.user_id]);
      await tx.query("DELETE FROM guardianships WHERE guardian_id = $1 OR child_id = $1", [me.user_id]);
      await tx.query(
        "UPDATE accounts SET status = 'deactivated', deactivated_at = now(), display_name = 'Deleted account' WHERE user_id = $1",
        [me.user_id],
      );
      await audit(tx, "account.deleted", me.user_id, null);
    });
    return { deleted: true };
  });
}
