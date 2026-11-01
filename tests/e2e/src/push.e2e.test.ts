/**
 * Background push: the homeserver's HTTP pusher (format event_id_only) reaches the iMello push
 * gateway when a new encrypted message arrives, and the gateway accepts the pushkey.
 * Real delivery to Apple/Google push services can't run in CI; the gateway's Web Push sending is
 * covered with a fake sender in services/api tests.
 */
import { randomBytes } from "node:crypto";
import { ImelloApiClient } from "@imello/core";
import { acceptInvite, sendText, startDirectChat, waitForRoom } from "@imello/core/messaging";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { env, secret, signIn, stopAll } from "./harness";

afterAll(stopAll);

async function startNow(name: string) {
  const deviceSecret = randomBytes(32).toString("base64url");
  const { pin } = await new ImelloApiClient(env.apiUrl).quickStart({ deviceSecret, displayName: name });
  return { ...(await signIn(pin, `${name} phone`, deviceSecret)), pin };
}

async function pusherLastSuccess(pushkey: string): Promise<number | null> {
  const db = new pg.Client({ connectionString: env.synapseDbUrl });
  await db.connect();
  try {
    const r = await db.query<{ last_success: string | null }>("SELECT last_success FROM pushers WHERE pushkey = $1", [pushkey]);
    return r.rows[0]?.last_success ? Number(r.rows[0].last_success) : null;
  } finally {
    await db.end();
  }
}

describe("background push via the homeserver pusher", () => {
  it("a new message makes Synapse call the iMello push gateway for the recipient's device", async () => {
    const [a, b] = await Promise.all([startNow("Sara"), startNow("Omar")]);
    await a.api.sendContactRequest(b.pin);
    const { incoming } = await b.api.contactRequests();
    await b.api.respondToContactRequest(incoming[0]!.requestId, true);

    const { gatewayUrl } = await b.api.pushKey();
    expect(gatewayUrl).toMatch(/\/_matrix\/push\/v1\/notify$/);
    const { pushkey } = await b.api.registerPush({
      endpoint: `https://push.invalid/${randomBytes(8).toString("hex")}`,
      keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
    });
    await b.client.setPusher({
      kind: "http",
      app_id: "com.imello.web",
      app_display_name: "iMello",
      device_display_name: "test",
      pushkey,
      lang: "en",
      data: { url: gatewayUrl!, format: "event_id_only" },
    } as never);
    expect((await b.client.getPushers()).pushers.map((p) => p.pushkey)).toContain(pushkey);

    const roomId = await startDirectChat(a.client, b.userId);
    await waitForRoom(b.client, roomId);
    await acceptInvite(b.client, roomId);
    await sendText(a.client, roomId, secret("ping"));

    await expect.poll(() => pusherLastSuccess(pushkey), { timeout: 30_000, interval: 500 }).not.toBeNull();
  });
});
