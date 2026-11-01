import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { constantTimeEqual, HttpError } from "../app";
import { audit, decideInvite, decideJoin, getAccount } from "../repo";

/**
 * Endpoints called synchronously by the Synapse `imello_policy` module before
 * it accepts an invite or a join. The homeserver fails closed if these are
 * unreachable. They must never be exposed to the public internet: protect with
 * network policy *and* the shared secret.
 */
export async function registerInternalRoutes(app: FastifyInstance) {
  const { db, config } = app.deps;

  function requireInternal(req: FastifyRequest) {
    const presented = req.headers["x-imello-policy-secret"];
    if (typeof presented !== "string" || !constantTimeEqual(presented, config.POLICY_INTERNAL_SECRET)) {
      throw new HttpError(401, "unauthorized");
    }
  }

  const members = z.array(z.string().max(255)).max(5000).default([]);
  const internalOpts = { config: { rateLimit: false as const } };

  app.post("/internal/policy/invite", internalOpts, async (req) => {
    requireInternal(req);
    const body = z.object({ inviter: z.string(), invitee: z.string(), roomId: z.string(), roomMembers: members }).parse(req.body);
    const decision = await decideInvite(db, body.inviter, body.invitee, body.roomMembers);
    if (!decision.allow) await audit(db, "policy.invite_denied", body.inviter, body.invitee, { reason: decision.reason });
    return decision;
  });

  app.post("/internal/policy/join", internalOpts, async (req) => {
    requireInternal(req);
    const body = z.object({ userId: z.string(), roomId: z.string(), isInvited: z.boolean(), roomMembers: members }).parse(req.body);
    const account = await getAccount(db, body.userId);
    if (account?.kind === "child" && !body.isInvited) {
      await audit(db, "policy.join_denied", body.userId, null, { reason: "child_requires_invite" });
      return { allow: false, reason: "child_requires_invite" };
    }
    const decision = await decideJoin(db, body.userId, body.roomMembers);
    if (!decision.allow) await audit(db, "policy.join_denied", body.userId, null, { reason: decision.reason });
    return decision;
  });
}
