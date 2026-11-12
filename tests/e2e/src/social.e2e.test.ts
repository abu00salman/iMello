/** Status updates and call history at the protocol level (real homeserver, encrypted rooms). */
import { acceptInvite, acceptStatusInvites, conversations, postStatus, startDirectChat, statusUpdates, waitForRoom, isStatusRoom } from "@imello/core/messaging";
import { afterAll, describe, expect, it } from "vitest";
import { connect, registerAdult, stopAll } from "./harness";

afterAll(stopAll);

async function until(check: () => boolean, ms = 30_000, what = "condition") {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe("status updates", () => {
  it("reach a contact, are joined automatically, and are not listed as chats", async () => {
    const [a, b] = await Promise.all([registerAdult("stA", "Aisha"), registerAdult("stB", "Bader")]);
    await connect(a, b);
    const dm = await startDirectChat(a.client, b.userId);
    await waitForRoom(b.client, dm);
    await acceptInvite(b.client, dm);
    await until(() => a.client.getRoom(dm)?.getMember(b.userId)?.membership === "join", 30_000, "dm join");

    await postStatus(a.client, "hello from my status");
    await until(() => b.client.getRooms().some((r) => r.getMyMembership() === "invite"), 30_000, "status invite at B");
    const inv = b.client.getRooms().find((r) => r.getMyMembership() === "invite")!;
    expect(isStatusRoom(inv)).toBe(true);
    await acceptStatusInvites(b.client);
    await until(() => statusUpdates(b.client).some((g) => g.posts.some((p) => p.body === "hello from my status")), 30_000, "status post at B");
    expect(conversations(b.client).some((c) => c.roomId === inv.roomId)).toBe(false);
  });
});
