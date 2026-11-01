/**
 * Web Push delivery for background notifications.
 *
 * Privacy: payloads never contain message text, sender names or event content — only what kind
 * of alert it is ("message" / "call"), the room to open, and an unread count. The homeserver
 * pusher uses the `event_id_only` format, so not even the event body reaches this service.
 */
import webpush from "web-push";
import type { Queryable } from "./db";

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  t: "msg" | "call";
  /** room to open when tapped */
  r?: string;
  /** unread count for the app badge */
  u?: number;
  /** call kind */
  v?: boolean;
  /** caller display name, only for calls (the caller's own client asked for it to be shown) */
  n?: string;
}

export interface PushSender {
  publicKey(): Promise<string>;
  /** Returns "gone" when the subscription no longer exists (it should be deleted). */
  send(target: PushTarget, payload: PushPayload, opts: { urgency: "high" | "normal"; ttl: number }): Promise<"ok" | "gone" | "error">;
}

async function vapidKeys(db: Queryable, subject: string) {
  const r = await db.query<{ value: string }>("SELECT value FROM server_keys WHERE name = 'vapid'");
  let keys: { publicKey: string; privateKey: string };
  if (r.rows[0]) keys = JSON.parse(r.rows[0].value);
  else {
    keys = webpush.generateVAPIDKeys();
    await db.query("INSERT INTO server_keys (name, value) VALUES ('vapid', $1) ON CONFLICT (name) DO NOTHING", [JSON.stringify(keys)]);
    const again = await db.query<{ value: string }>("SELECT value FROM server_keys WHERE name = 'vapid'");
    keys = JSON.parse(again.rows[0]!.value);
  }
  return { ...keys, subject };
}

export function webPushSender(db: Queryable, subject: string): PushSender {
  let cached: Promise<{ publicKey: string; privateKey: string; subject: string }> | null = null;
  const keys = () => (cached ??= vapidKeys(db, subject).catch((e) => ((cached = null), Promise.reject(e))));
  return {
    publicKey: async () => (await keys()).publicKey,
    async send(target, payload, opts) {
      const k = await keys();
      try {
        await webpush.sendNotification(target, JSON.stringify(payload), {
          vapidDetails: { subject: k.subject, publicKey: k.publicKey, privateKey: k.privateKey },
          TTL: opts.ttl,
          urgency: opts.urgency,
          timeout: 10_000,
        });
        return "ok";
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        return status === 404 || status === 410 ? "gone" : "error";
      }
    },
  };
}
