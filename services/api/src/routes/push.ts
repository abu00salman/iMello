import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../app";
import type { PushPayload } from "../push";
import { decidePair, getAccount } from "../repo";

const subscriptionBody = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine((u) => u.startsWith("https://"), "https only"),
  keys: z.object({ p256dh: z.string().min(16).max(256), auth: z.string().min(8).max(64) }),
});

/** Matrix Push Gateway API request (https://spec.matrix.org/v1.11/push-gateway-api/). */
const notifyBody = z.object({
  notification: z.object({
    event_id: z.string().max(255).optional(),
    room_id: z.string().max(255).optional(),
    type: z.string().max(255).optional(),
    counts: z.object({ unread: z.number().int().nonnegative().optional() }).partial().optional(),
    devices: z
      .array(
        z.object({
          app_id: z.string().max(64),
          pushkey: z.string().max(512),
          tweaks: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .max(50),
  }),
});

type Row = { pushkey: string; endpoint: string; p256dh: string; auth: string };

export async function registerPushRoutes(app: FastifyInstance) {
  const { db, push } = app.deps;

  async function deliver(rows: Row[], payload: PushPayload, urgency: "high" | "normal", ttl: number) {
    const gone: string[] = [];
    await Promise.all(
      rows.map(async (row) => {
        const result = await push.send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, payload, { urgency, ttl });
        if (result === "gone") gone.push(row.pushkey);
        else if (result === "ok") await db.query("UPDATE push_subscriptions SET last_used_at = now() WHERE pushkey = $1", [row.pushkey]);
      }),
    );
    if (gone.length) await db.query("DELETE FROM push_subscriptions WHERE pushkey = ANY($1)", [gone]);
    return gone;
  }

  app.get("/v1/push/key", async () => ({ publicKey: await push.publicKey(), gatewayUrl: app.deps.config.PUSH_GATEWAY_URL ?? null }));

  /** Register this device's push subscription; returns the pushkey to give the homeserver pusher. */
  app.post("/v1/push/subscriptions", { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async (req) => {
    const me = await app.requireAccount(req);
    const body = subscriptionBody.parse(req.body);
    const existing = await db.query<{ pushkey: string }>("SELECT pushkey FROM push_subscriptions WHERE endpoint = $1", [body.endpoint]);
    // The same browser re-subscribing (or another account signing in on it) gets a fresh pushkey,
    // so an old account's pusher can't keep notifying this device.
    if (existing.rows[0]) await db.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [body.endpoint]);
    const pushkey = randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO push_subscriptions (pushkey, user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4, $5)",
      [pushkey, me.user_id, body.endpoint, body.keys.p256dh, body.keys.auth],
    );
    return { pushkey };
  });

  app.delete<{ Params: { pushkey: string } }>("/v1/push/subscriptions/:pushkey", async (req, reply) => {
    const me = await app.requireAccount(req);
    await db.query("DELETE FROM push_subscriptions WHERE pushkey = $1 AND user_id = $2", [req.params.pushkey, me.user_id]);
    return reply.status(204).send();
  });

  /**
   * Push gateway endpoint called by the homeserver's HTTP pusher. Unauthenticated per the Matrix
   * spec; the 256-bit pushkey is the capability. Unknown pushkeys are reported as rejected so the
   * homeserver removes that pusher.
   */
  app.post("/_matrix/push/v1/notify", { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } }, async (req) => {
    const { notification: n } = notifyBody.parse(req.body);
    const keys = n.devices.map((d) => d.pushkey);
    if (!keys.length) return { rejected: [] };
    const rows = (await db.query<Row>("SELECT pushkey, endpoint, p256dh, auth FROM push_subscriptions WHERE pushkey = ANY($1)", [keys])).rows;
    const known = new Set(rows.map((r) => r.pushkey));
    const rejected = keys.filter((k) => !known.has(k));
    // Count-only updates (no event) just refresh the badge; skip them to save battery/data.
    if (n.event_id && rows.length) {
      const ring = n.devices.some((d) => d.tweaks?.sound === "ring");
      const gone = await deliver(rows, { t: ring ? "call" : "msg", r: n.room_id, u: n.counts?.unread }, ring ? "high" : "normal", ring ? 60 : 24 * 3600);
      rejected.push(...gone);
    }
    return { rejected };
  });

  /**
   * Ring a contact's devices for an incoming call. Call setup events are end-to-end encrypted,
   * so the homeserver can't tell a call from a message; the caller's own client asks for the ring.
   * Only allowed between people the family-safety policy lets talk to each other.
   */
  app.post("/v1/push/ring", { config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const me = await app.requireAccount(req);
    const body = z.object({ userId: z.string().max(255), roomId: z.string().max(255), video: z.boolean().default(false) }).parse(req.body);
    if (body.userId === me.user_id) throw new HttpError(400, "invalid_request");
    const decision = await decidePair(db, me.user_id, body.userId);
    // Same answer whether or not the person exists or allows it: no probing.
    if (!decision.allow) return reply.status(202).send({ status: "sent" });
    const callee = await getAccount(db, body.userId);
    if (!callee) return reply.status(202).send({ status: "sent" });
    const rows = (await db.query<Row>("SELECT pushkey, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1", [body.userId])).rows;
    await deliver(rows, { t: "call", r: body.roomId, v: body.video, n: me.display_name ?? me.username }, "high", 45);
    return reply.status(202).send({ status: "sent" });
  });
}
