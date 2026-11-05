import { isPin, normalizePin } from "@imello/core";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../app";
import { withTransaction } from "../db";
import { audit, establishContact, getAccount, orderedPair, type AccountRow } from "../repo";

/**
 * Contact requests by iMello number (BBM-style "add by PIN").
 *
 * Privacy & safety rules:
 *  - The response to "send" is identical whether or not the number exists, is blocked, or
 *    belongs to a child, so numbers cannot be probed.
 *  - Requests to a child never reach the child: they go straight to the child's guardians as a
 *    pending approval (the same flow as invite links).
 *  - Accepting creates the contact through establishContact, so a child on either side still
 *    needs guardian approval before any conversation is allowed.
 */
export async function registerRequestRoutes(app: FastifyInstance) {
  const { db } = app.deps;

  app.post("/v1/contact-requests", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req, reply) => {
    const me = await app.requireAccount(req);
    const { pin: raw } = z.object({ pin: z.string().max(64) }).parse(req.body);
    const pin = normalizePin(raw);
    if (!pin) throw new HttpError(400, "invalid_number");
    if (pin === me.username || pin === me.code) throw new HttpError(400, "own_number");

    const sent = () => reply.status(202).send({ status: "sent" });
    const target = await db.query<AccountRow>("SELECT * FROM accounts WHERE (username = $1 OR code = $1) AND status = 'active'", [pin]);
    const to = target.rows[0];
    if (!to) return sent();

    const blocked = await db.query(
      "SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)",
      [me.user_id, to.user_id],
    );
    if (blocked.rowCount) return sent();

    const [low, high] = orderedPair(me.user_id, to.user_id);
    const existing = await db.query<{ status: string }>("SELECT status FROM contacts WHERE user_low = $1 AND user_high = $2", [low, high]);
    if (existing.rows[0]?.status === "accepted") return reply.status(200).send({ status: "already_contact" });
    if (existing.rows[0]) return sent(); // pending guardian decision or denied: nothing new to do

    await withTransaction(db, async (tx) => {
      if (to.kind === "child") {
        // Children never see requests from people they don't know; their guardian decides.
        await establishContact(tx, me.user_id, me, to);
        await audit(tx, "contact_request.to_guardian", me.user_id, to.user_id);
        return;
      }
      // If they already asked us, sending back means "accept".
      const reverse = await tx.query<{ id: string }>(
        "SELECT id FROM contact_requests WHERE from_id = $1 AND to_id = $2 AND status = 'pending' FOR UPDATE",
        [to.user_id, me.user_id],
      );
      if (reverse.rows[0]) {
        await tx.query("UPDATE contact_requests SET status = 'accepted', responded_at = now() WHERE id = $1", [reverse.rows[0].id]);
        await establishContact(tx, me.user_id, to, me);
        await audit(tx, "contact_request.accepted", me.user_id, to.user_id);
        return;
      }
      await tx.query(
        "INSERT INTO contact_requests (from_id, to_id) VALUES ($1, $2) ON CONFLICT (from_id, to_id) WHERE status = 'pending' DO NOTHING",
        [me.user_id, to.user_id],
      );
      await audit(tx, "contact_request.sent", me.user_id, to.user_id);
    });
    return sent();
  });

  app.get("/v1/contact-requests", async (req) => {
    const me = await app.requireAccount(req);
    // Only incoming requests: listing outgoing ones would reveal whether a number exists (and its name).
    const rows = await db.query<{ id: string; other: string; display_name: string; username: string; code: string | null; created_at: Date }>(
      `SELECT r.id, a.user_id AS other, a.display_name, a.username, a.code, r.created_at
       FROM contact_requests r
       JOIN accounts a ON a.user_id = r.from_id
       WHERE r.to_id = $1 AND r.status = 'pending' AND a.status = 'active'
       ORDER BY r.created_at DESC`,
      [me.user_id],
    );
    const view = (r: (typeof rows.rows)[number]) => ({
      requestId: r.id,
      userId: r.other,
      displayName: r.display_name,
      pin: r.code ?? (isPin(r.username) ? r.username : null),
      createdAt: r.created_at.toISOString(),
    });
    return { incoming: rows.rows.map(view) };
  });

  app.post<{ Params: { requestId: string } }>("/v1/contact-requests/:requestId", async (req) => {
    const me = await app.requireAccount(req);
    const requestId = z.uuid().parse(req.params.requestId);
    const { accept } = z.object({ accept: z.boolean() }).parse(req.body);
    return withTransaction(db, async (tx) => {
      const r = await tx.query<{ id: string; from_id: string; to_id: string; status: string }>(
        "SELECT * FROM contact_requests WHERE id = $1 FOR UPDATE",
        [requestId],
      );
      const request = r.rows[0];
      // Only the recipient can answer; anything else looks like "not found".
      if (!request || request.to_id !== me.user_id || request.status !== "pending") throw new HttpError(404, "request_not_found");
      await tx.query("UPDATE contact_requests SET status = $2, responded_at = now() WHERE id = $1", [
        requestId,
        accept ? "accepted" : "declined",
      ]);
      if (!accept) {
        await audit(tx, "contact_request.declined", me.user_id, request.from_id);
        return { contactStatus: null };
      }
      const from = await getAccount(tx, request.from_id);
      if (!from || from.status !== "active") throw new HttpError(404, "request_not_found");
      const contact = await establishContact(tx, me.user_id, from, me);
      await audit(tx, "contact_request.accepted", me.user_id, from.user_id, { status: contact.status });
      return { contactStatus: contact.status };
    });
  });
}
