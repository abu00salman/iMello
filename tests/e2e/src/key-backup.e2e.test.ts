/** On-device key backup: a new device can read earlier messages only after importing the user's own file. */
import { acceptInvite, exportKeysToFile, importKeysFromFile, roomMessages, sendText, startDirectChat, waitForMessage, waitForRoom } from "@imello/core/messaging";
import { afterAll, describe, expect, it } from "vitest";
import { connect, registerAdult, secret, signIn, stopAll } from "./harness";

afterAll(stopAll);

describe("on-device key backup", () => {
  it("restores access to earlier messages on a new device, and only with the right passphrase", async () => {
    const [a, b] = await Promise.all([registerAdult("bka"), registerAdult("bkb")]);
    await connect(a, b);
    const roomId = await startDirectChat(a.client, b.userId);
    await waitForRoom(b.client, roomId);
    await acceptInvite(b.client, roomId);
    const old = secret("old-message");
    await sendText(a.client, roomId, old);
    await waitForMessage(b.client, roomId, (m) => m.body === old);

    const file = await exportKeysToFile(b.client, "family backup pass");
    expect(file).toContain("BEGIN MEGOLM SESSION DATA");
    expect(file).not.toContain(old);

    const laptop = await signIn(b.username, "bkb laptop");
    await laptop.client.scrollback(laptop.client.getRoom(roomId)!, 50);
    expect(roomMessages(laptop.client, roomId).some((m) => m.body === old)).toBe(false);

    await expect(importKeysFromFile(laptop.client, file, "wrong pass")).rejects.toThrow(/passphrase/);
    const imported = await importKeysFromFile(laptop.client, file, "family backup pass");
    expect(imported).toBeGreaterThan(0);
    const restored = await waitForMessage(laptop.client, roomId, (m) => m.body === old, 30_000);
    expect(restored.decryptionFailed).toBe(false);
  });
});
