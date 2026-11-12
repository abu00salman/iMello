/**
 * "Start now" accounts with iMello numbers (mell-xxxxxx): no username/password at sign-up,
 * add by number, encrypted messaging, then protecting the account with a password.
 */
import { randomBytes } from "node:crypto";
import { ImelloApiClient } from "@imello/core";
import { acceptInvite, loginWithPassword, sendText, startDirectChat, waitForMessage, waitForRoom } from "@imello/core/messaging";
import { afterAll, describe, expect, it } from "vitest";
import { env, expectMatrixForbidden, secret, signIn, stopAll, type TestUser } from "./harness";

afterAll(stopAll);

async function startNow(name: string): Promise<TestUser & { pin: string; deviceSecret: string }> {
  const deviceSecret = randomBytes(32).toString("base64url");
  const { pin } = await new ImelloApiClient(env.apiUrl).quickStart({ deviceSecret, displayName: name });
  const user = await signIn(pin, `${name} phone`, deviceSecret);
  return { ...user, pin, deviceSecret };
}

describe("Start now + add by number", () => {
  let a: Awaited<ReturnType<typeof startNow>>;
  let b: Awaited<ReturnType<typeof startNow>>;
  let roomId: string;

  it("creates two accounts instantly, each with its own mell- number", async () => {
    [a, b] = await Promise.all([startNow("Noor"), startNow("Fahad")]);
    expect(a.pin).toMatch(/^w\d{4}$/);
    expect(b.pin).not.toBe(a.pin);
    expect(await a.api.me()).toMatchObject({ pin: a.pin, credential: "device", displayName: "Noor" });
  });

  it("strangers cannot message before the request is accepted", async () => {
    await expectMatrixForbidden(startDirectChat(a.client, b.userId));
  });

  it("A adds B by number (typed loosely), B accepts", async () => {
    expect((await a.api.sendContactRequest(b.pin.replace(/^w/, "W "))).status).toBe("sent");
    const { incoming } = await b.api.contactRequests();
    expect(incoming).toHaveLength(1);
    expect(incoming[0]).toMatchObject({ userId: a.userId, pin: a.pin, displayName: "Noor" });
    expect((await b.api.respondToContactRequest(incoming[0]!.requestId, true)).contactStatus).toBe("accepted");
  });

  it("they exchange end-to-end encrypted messages", async () => {
    roomId = await startDirectChat(a.client, b.userId);
    await waitForRoom(b.client, roomId);
    await acceptInvite(b.client, roomId);
    const hi = secret("salam");
    await sendText(a.client, roomId, hi);
    const got = await waitForMessage(b.client, roomId, (m) => m.body === hi);
    expect(got.encrypted).toBe(true);
  });

  it("protecting the account replaces the device secret with the user's password", async () => {
    const newPassword = "my own password " + randomBytes(3).toString("hex");
    const auth = { type: "m.login.password", identifier: { type: "m.id.user", user: b.userId }, password: b.deviceSecret };
    try {
      await b.client.setPassword(auth as never, newPassword, false);
    } catch (err) {
      const session = (err as { data?: { session?: string } }).data?.session;
      if (!session) throw err;
      await b.client.setPassword({ ...auth, session } as never, newPassword, false);
    }
    expect((await b.api.markProtected()).credential).toBe("password");

    // The old device secret no longer works; number + new password signs in on a new device.
    await expect(loginWithPassword(env.homeserverUrl, b.pin, b.deviceSecret, "x")).rejects.toMatchObject({ httpStatus: 403 });
    const laptop = await signIn(b.pin, "Fahad laptop", newPassword);
    expect(laptop.userId).toBe(b.userId);
    // The existing device keeps working.
    const again = secret("still-here");
    await sendText(a.client, roomId, again);
    await waitForMessage(b.client, roomId, (m) => m.body === again);
  });
});
