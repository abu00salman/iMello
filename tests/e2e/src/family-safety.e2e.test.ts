/**
 * Mandatory scenario (prompt §31), server-side portion: parent, child,
 * trusted adult and stranger, with guardian approval enforced by the homeserver.
 */
import { acceptInvite, sendText, startDirectChat, waitForMessage, waitForRoom } from "@imello/core/messaging";
import { Preset } from "matrix-js-sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  connect,
  createChild,
  expectMatrixForbidden,
  registerAdult,
  secret,
  serverLogsContain,
  stopAll,
  synapseDbContains,
  type TestUser,
} from "./harness";

let parent: TestUser;
let child: TestUser;
let trusted: TestUser;
let stranger: TestUser;
let familyId: string;
const secrets: string[] = [];

beforeAll(async () => {
  [parent, trusted, stranger] = await Promise.all([
    registerAdult("parent", "Dad"),
    registerAdult("trusted", "Aunt Sara"),
    registerAdult("stranger", "Stranger"),
  ]);
});
afterAll(stopAll);

describe("family & guardian setup", () => {
  it("parent creates a Family Space", async () => {
    const family = await parent.api.createFamily("Our Family");
    familyId = family.familyId;
    expect(family.role).toBe("admin");
  });

  it("parent creates a child account and adds it to the family", async () => {
    child = await createChild(parent, "kid");
    const me = await child.api.me();
    expect(me.kind).toBe("child");
    expect(me.guardians).toEqual([parent.userId]);
    const family = await parent.api.addChildToFamily(familyId, child.userId);
    expect(family.members.map((m) => m.userId)).toEqual(expect.arrayContaining([parent.userId, child.userId]));
  });

  it("a child cannot create a child account or a family", async () => {
    await expect(child.api.createChild({ username: "nope-" + Date.now(), password: "long enough pass", displayName: "x" }))
      .rejects.toMatchObject({ status: 403 });
    await expect(child.api.createFamily("Kids only")).rejects.toMatchObject({ status: 403 });
  });
});

describe("parent ↔ child messaging", () => {
  it("parent messages the child; child receives and replies", async () => {
    const roomId = await startDirectChat(parent.client, child.userId);
    await waitForRoom(child.client, roomId);
    await acceptInvite(child.client, roomId);
    const toChild = secret("dinner-at-seven");
    const toParent = secret("ok-dad");
    secrets.push(toChild, toParent);
    await sendText(parent.client, roomId, toChild);
    await waitForMessage(child.client, roomId, (m) => m.body === toChild);
    await sendText(child.client, roomId, toParent);
    const got = await waitForMessage(parent.client, roomId, (m) => m.body === toParent);
    expect(got.encrypted).toBe(true);
  });
});

describe("unauthorized users cannot contact the child", () => {
  it("a stranger's invite to the child is refused by the homeserver", async () => {
    await expectMatrixForbidden(startDirectChat(stranger.client, child.userId));
  });

  it("a child cannot join a room it was not invited to", async () => {
    const { room_id } = await stranger.client.createRoom({ preset: Preset.PublicChat, name: "Free stuff" });
    await expectMatrixForbidden(child.client.joinRoom(room_id));
  });

  it("a stranger who obtains an invite link still needs guardian approval", async () => {
    const invite = await child.api.createContactInvite();
    const res = await stranger.api.redeemInvite(invite.token);
    expect(res.contact?.status).toBe("pending_guardian");
    await expectMatrixForbidden(startDirectChat(stranger.client, child.userId));
    // The guardian denies it.
    const pending = await parent.api.approvals();
    const forStranger = pending.find((p) => p.requesterUserId === stranger.userId)!;
    expect(forStranger.childUserId).toBe(child.userId);
    expect((await parent.api.decideApproval(forStranger.approvalId, "deny")).contactStatus).toBe("denied");
    await expectMatrixForbidden(startDirectChat(stranger.client, child.userId));
  });

  it("only the child's guardian can decide approvals", async () => {
    const invite = await trusted.api.createContactInvite();
    await child.api.redeemInvite(invite.token);
    expect(await stranger.api.approvals()).toEqual([]);
    const approval = (await parent.api.approvals()).find((a) => a.requesterUserId === trusted.userId)!;
    await expect(stranger.api.decideApproval(approval.approvalId, "approve")).rejects.toMatchObject({ status: 404 });
  });
});

describe("guardian-approved trusted adult", () => {
  let roomId: string;

  it("is refused before approval, then allowed after the guardian approves", async () => {
    await expectMatrixForbidden(startDirectChat(trusted.client, child.userId));
    const approval = (await parent.api.approvals()).find((a) => a.requesterUserId === trusted.userId)!;
    expect((await parent.api.decideApproval(approval.approvalId, "approve")).contactStatus).toBe("accepted");

    roomId = await startDirectChat(trusted.client, child.userId);
    await waitForRoom(child.client, roomId);
    await acceptInvite(child.client, roomId);
    const s = secret("happy-birthday");
    secrets.push(s);
    await sendText(trusted.client, roomId, s);
    await waitForMessage(child.client, roomId, (m) => m.body === s);
  });

  it("parent and trusted adult exchange encrypted messages", async () => {
    await connect(parent, trusted);
    const dm = await startDirectChat(parent.client, trusted.userId);
    await waitForRoom(trusted.client, dm);
    await acceptInvite(trusted.client, dm);
    const s = secret("pickup-at-3");
    secrets.push(s);
    await sendText(parent.client, dm, s);
    await waitForMessage(trusted.client, dm, (m) => m.body === s);
  });

  it("the child can block a contact, which immediately stops new invites", async () => {
    await child.api.block(trusted.userId);
    const { room_id } = await trusted.client.createRoom({ preset: Preset.TrustedPrivateChat });
    await expectMatrixForbidden(trusted.client.invite(room_id, child.userId));
    await child.api.unblock(trusted.userId);
  });
});

describe("group rules", () => {
  it("a stranger cannot be added to a group that contains the child", async () => {
    await connect(parent, stranger); // adults may be contacts with each other
    const { room_id } = await parent.client.createRoom({ preset: Preset.TrustedPrivateChat, invite: [child.userId] });
    await waitForRoom(child.client, room_id);
    await acceptInvite(child.client, room_id);
    await expectMatrixForbidden(parent.client.invite(room_id, stranger.userId));
  });

  it("the child cannot be pulled into a group that contains a stranger", async () => {
    const { room_id } = await parent.client.createRoom({ preset: Preset.TrustedPrivateChat, invite: [stranger.userId] });
    await expectMatrixForbidden(parent.client.invite(room_id, child.userId));
  });

  it("a family invite redeemed by a relative connects them to the child (guardian-issued)", async () => {
    const grandma = await registerAdult("grandma", "Grandma");
    const invite = await parent.api.createFamilyInvite(familyId);
    const res = await grandma.api.redeemInvite(invite.token);
    expect(res.family?.familyId).toBe(familyId);
    const contacts = await grandma.api.contacts();
    expect(contacts.find((c) => c.userId === child.userId)?.status).toBe("accepted");
    const roomId = await startDirectChat(grandma.client, child.userId);
    await waitForRoom(child.client, roomId);
  });

  it("a child cannot redeem a family invite on their own", async () => {
    const invite = await parent.api.createFamilyInvite(familyId);
    await expect(child.api.redeemInvite(invite.token)).rejects.toMatchObject({ status: 403 });
  });
});

describe("privacy evidence", () => {
  it("none of the family's messages appear in the homeserver database or logs", async () => {
    expect(secrets.length).toBeGreaterThanOrEqual(4);
    for (const s of secrets) {
      expect((await synapseDbContains(s)).anyTableHits).toEqual([]);
      expect(await serverLogsContain(s)).toEqual([]);
    }
  });
});
