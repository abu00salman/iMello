/**
 * Regression: duplicate conversations/invitations (seen in the field as repeated rows for one
 * contact). Conversation identity must be stable no matter how often or from which side a chat
 * is started, and the list must show one row per person.
 */
import { conversations, startDirectChat, waitForRoom } from "@imello/core/messaging";
import { EventType, Preset } from "matrix-js-sdk";
import { afterAll, describe, expect, it } from "vitest";
import { connect, registerAdult, stopAll } from "./harness";

afterAll(stopAll);

async function until(check: () => boolean, ms = 20_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 200));
  }
}

describe("duplicate conversations", () => {
  it("repeated and concurrent 'Message' taps on one side create a single room", async () => {
    const [a, b] = await Promise.all([registerAdult("dupA"), registerAdult("dupB")]);
    await connect(a, b);
    const ids = await Promise.all([startDirectChat(a.client, b.userId), startDirectChat(a.client, b.userId), startDirectChat(a.client, b.userId)]);
    expect(new Set(ids).size).toBe(1);
    expect(await startDirectChat(a.client, b.userId)).toBe(ids[0]);
  });

  it("when the other person already invited you, 'Message' joins their room instead of creating another", async () => {
    const [a, b] = await Promise.all([registerAdult("dupC"), registerAdult("dupD")]);
    await connect(a, b);
    const roomId = await startDirectChat(a.client, b.userId);
    await waitForRoom(b.client, roomId);
    expect(await startDirectChat(b.client, a.userId)).toBe(roomId);
    await until(() => b.client.getRoom(roomId)?.getMyMembership() === "join");
    expect(conversations(b.client).filter((c) => c.otherUserId === a.userId)).toHaveLength(1);
  });

  it("an existing duplicate room is shown once (most recent, joined); nothing is deleted", async () => {
    const [a, b] = await Promise.all([registerAdult("dupE"), registerAdult("dupF")]);
    await connect(a, b);
    const first = await startDirectChat(a.client, b.userId);
    // Simulate the old bug: a second 1:1 room created without checking.
    const { room_id: second } = await a.client.createRoom({
      preset: Preset.TrustedPrivateChat,
      is_direct: true,
      invite: [b.userId],
      initial_state: [{ type: EventType.RoomEncryption, state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await until(() => !!a.client.getRoom(second)?.getMember(b.userId) && !!a.client.getRoom(first)?.getMember(b.userId));
    const rows = conversations(a.client).filter((c) => c.otherUserId === b.userId);
    expect(rows).toHaveLength(1);
    expect(a.client.getRoom(first)?.getMyMembership()).toBe("join");
    expect(a.client.getRoom(second)?.getMyMembership()).toBe("join");
  });
});
