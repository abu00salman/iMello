/**
 * Phase 2 acceptance: two independent accounts exchange real end-to-end
 * encrypted messages through the real homeserver and policy service.
 */
import {
  acceptInvite,
  listDevices,
  revokeDevice,
  roomMessages,
  sendText,
  startDirectChat,
  waitForMessage,
  waitForRoom,
} from "@imello/core/messaging";
import { ClientEvent, EventType, Preset, SyncState } from "matrix-js-sdk";
import { createFlakyProxy } from "./flaky-proxy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  connect,
  env,
  expectMatrixForbidden,
  registerAdult,
  secret,
  serverLogsContain,
  signIn,
  stopAll,
  synapseDbContains,
  type TestUser,
} from "./harness";

let alice: TestUser;
let bob: TestUser;
let mallory: TestUser;
let roomId: string;
const firstSecret = secret("hello-bob");
const replySecret = secret("hi-alice");

beforeAll(async () => {
  [alice, bob, mallory] = await Promise.all([registerAdult("alice"), registerAdult("bob"), registerAdult("mallory")]);
});
afterAll(stopAll);

describe("closed network", () => {
  it("a stranger cannot start a conversation (homeserver refuses the invite)", async () => {
    const code = await expectMatrixForbidden(startDirectChat(mallory.client, bob.userId));
    expect(code).toBe("M_FORBIDDEN");
  });

  it("an invite link makes two adults contacts", async () => {
    const result = await connect(alice, bob);
    expect(result.contact?.status).toBe("accepted");
    expect(result.contact?.userId).toBe(alice.userId);
    const contacts = await bob.api.contacts();
    expect(contacts.map((c) => c.userId)).toContain(alice.userId);
  });

  it("invite links are single-use", async () => {
    const invite = await alice.api.createContactInvite();
    await mallory.api.redeemInvite(invite.token);
    await expect(bob.api.redeemInvite(invite.token)).rejects.toMatchObject({ status: 404, code: "invite_not_found" });
  });
});

describe("one-to-one end-to-end encrypted messaging", () => {
  it("creates an encrypted conversation and the contact accepts it", async () => {
    roomId = await startDirectChat(alice.client, bob.userId);
    await waitForRoom(bob.client, roomId);
    await acceptInvite(bob.client, roomId);
    expect(await bob.client.getCrypto()!.isEncryptionEnabledInRoom(roomId)).toBe(true);
  });

  it("Alice → Bob: message is delivered and decrypted", async () => {
    await sendText(alice.client, roomId, firstSecret);
    const received = await waitForMessage(bob.client, roomId, (m) => m.body === firstSecret);
    expect(received.sender).toBe(alice.userId);
    expect(received.encrypted).toBe(true);
    expect(received.decryptionFailed).toBe(false);
  });

  it("Bob → Alice: reply with a reply reference", async () => {
    const original = roomMessages(bob.client, roomId).find((m) => m.body === firstSecret)!;
    await sendText(bob.client, roomId, replySecret, { replyToEventId: original.id });
    const got = await waitForMessage(alice.client, roomId, (m) => m.body === replySecret);
    expect(got.replyTo).toBe(original.id);
  });

  it("the event stored by the homeserver is Megolm ciphertext", async () => {
    const res = await mallory.client.http.authedRequest(
      "GET" as never,
      `/rooms/${encodeURIComponent(roomId)}/messages`,
      { dir: "b", limit: "10" },
    ).catch((e: { httpStatus?: number }) => e);
    // Mallory is not a member: the server will not even give her the ciphertext.
    expect((res as { httpStatus?: number }).httpStatus).toBe(403);

    const raw = await alice.client.createMessagesRequest(roomId, null, 20, "b" as never);
    const msgs = raw.chunk.filter((e) => e.type === EventType.RoomMessageEncrypted || e.type === EventType.RoomMessage);
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    for (const e of msgs) {
      expect(e.type).toBe(EventType.RoomMessageEncrypted);
      expect(e.content.algorithm).toBe("m.megolm.v1.aes-sha2");
      expect(JSON.stringify(e)).not.toContain(firstSecret);
    }
  });

  it("plaintext never reaches the homeserver database or server logs", async () => {
    for (const s of [firstSecret, replySecret]) {
      const db = await synapseDbContains(s);
      expect(db.eventJsonHits).toBe(0);
      expect(db.anyTableHits).toEqual([]);
      expect(await serverLogsContain(s)).toEqual([]);
    }
  });

  it("the homeserver encrypts every new room by default, even without an explicit request", async () => {
    const { room_id } = await alice.client.createRoom({ preset: Preset.PrivateChat });
    await new Promise((r) => setTimeout(r, 300));
    expect(await alice.client.getCrypto()!.isEncryptionEnabledInRoom(room_id)).toBe(true);
  });

  it("retrying a request with the same transaction ID is idempotent on the server", async () => {
    // Matrix makes sends idempotent per (device, txnId): a retry after a timeout returns
    // the original event instead of creating a duplicate. Verified at the HTTP layer
    // with a content-free event so nothing unencrypted carries user data.
    const txnId = "retry-" + Date.now();
    const path = `/rooms/${encodeURIComponent(roomId)}/send/org.imello.ping/${txnId}`;
    const first = await alice.client.http.authedRequest<{ event_id: string }>("PUT" as never, path, undefined, {});
    const second = await alice.client.http.authedRequest<{ event_id: string }>("PUT" as never, path, undefined, {});
    expect(second.event_id).toBe(first.event_id);
  });

  it("the SDK refuses to queue two local messages with the same transaction ID", async () => {
    const txnId = "local-" + Date.now();
    await sendText(alice.client, roomId, secret("once"), { txnId });
    await expect(sendText(alice.client, roomId, secret("twice"), { txnId })).rejects.toThrow(/known txnId/);
  });

});

describe("offline & reconnection", () => {
  it("a client that loses its connection catches up, in order, after reconnecting", async () => {
    const proxy = await createFlakyProxy(env.homeserverUrl);
    try {
      const carol = await registerAdult("carol", "carol", proxy.url);
      await connect(alice, carol);
      const dm = await startDirectChat(alice.client, carol.userId);
      await waitForRoom(carol.client, dm);
      await acceptInvite(carol.client, dm);

      const sawError = new Promise<void>((resolve) => {
        carol.client.on(ClientEvent.Sync, (state) => {
          if (state === SyncState.Error || state === SyncState.Reconnecting) resolve();
        });
      });
      proxy.setOnline(false);
      await sawError;

      const missed = [secret("while-offline-1"), secret("while-offline-2"), secret("while-offline-3")];
      for (const m of missed) await sendText(alice.client, dm, m);

      proxy.setOnline(true);
      for (const m of missed) await waitForMessage(carol.client, dm, (x) => x.body === m, 60_000);
      const order = roomMessages(carol.client, dm).map((m) => m.body).filter((b) => missed.includes(b!));
      expect(order).toEqual(missed);
    } finally {
      await proxy.close();
    }
  });
});

describe("devices", () => {
  let bobLaptop: TestUser;
  const beforeLink = secret("before-new-device");

  it("a newly added device does not silently get access to earlier messages", async () => {
    await sendText(alice.client, roomId, beforeLink);
    await waitForMessage(bob.client, roomId, (m) => m.body === beforeLink);

    bobLaptop = await signIn(bob.username, "bob laptop");
    // Load history on the new device.
    await bobLaptop.client.scrollback(bobLaptop.client.getRoom(roomId)!, 50);
    const history = roomMessages(bobLaptop.client, roomId);
    expect(history.length).toBeGreaterThan(0);
    expect(history.some((m) => m.body === beforeLink)).toBe(false);
    expect(history.every((m) => m.decryptionFailed)).toBe(true);
  });

  it("the new device can read messages sent after it was added", async () => {
    const after = secret("after-new-device");
    // Alice's client must learn about Bob's new device; the SDK re-queries device lists on change.
    await sendText(alice.client, roomId, after);
    const got = await waitForMessage(bobLaptop.client, roomId, (m) => m.body === after);
    expect(got.decryptionFailed).toBe(false);
  });

  it("lists the account's devices", async () => {
    const devices = await listDevices(bob.client);
    expect(devices.map((d) => d.deviceId)).toEqual(expect.arrayContaining([bob.session.deviceId, bobLaptop.session.deviceId]));
    expect(devices.find((d) => d.isCurrent)?.deviceId).toBe(bob.session.deviceId);
  });

  it("revoking a device ends its session and future messages are not encrypted to it", async () => {
    await revokeDevice(bob.client, bobLaptop.session.deviceId, (await import("./harness")).PASSWORD);
    bobLaptop.client.stopClient();

    const who = await fetch(`${env.homeserverUrl}/_matrix/client/v3/account/whoami`, {
      headers: { authorization: `Bearer ${bobLaptop.session.accessToken}` },
    });
    expect(who.status).toBe(401);
    await expect(bobLaptop.api.me()).rejects.toMatchObject({ status: 401 });

    // Alice's view of Bob's devices no longer includes the revoked one.
    const crypto = alice.client.getCrypto()!;
    let ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      const map = await crypto.getUserDeviceInfo([bob.userId], true);
      ids = [...(map.get(bob.userId)?.keys() ?? [])];
      if (!ids.includes(bobLaptop.session.deviceId)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(ids).toContain(bob.session.deviceId);
    expect(ids).not.toContain(bobLaptop.session.deviceId);
  });
});
