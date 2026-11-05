/**
 * API integration tests: real PostgreSQL (TEST_DATABASE_URL), in-memory fake homeserver.
 * The full homeserver-enforced behaviour is covered by tests/e2e.
 */
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createPool, type Db } from "../src/db";
import { HomeserverError, type Homeserver } from "../src/homeserver";
import { migrateDown, migrateUp } from "../src/migrate";
import type { PushPayload, PushSender, PushTarget } from "../src/push";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://imello:imello@127.0.0.1:5432/imello_test";
const POLICY_SECRET = "p".repeat(40);

class FakeHomeserver implements Homeserver {
  users = new Map<string, string>(); // username -> password
  tokens = new Map<string, string>(); // token -> userId
  async whoami(token: string) {
    const userId = this.tokens.get(token);
    return userId ? { userId, deviceId: "DEV" } : null;
  }
  async registerUser(username: string, password: string) {
    if (this.users.has(username)) throw new HomeserverError(400, "M_USER_IN_USE");
    this.users.set(username, password);
    return { userId: `@${username}:test.local` };
  }
  issueToken(userId: string) {
    const t = randomBytes(16).toString("hex");
    this.tokens.set(t, userId);
    return t;
  }
}

class FakePush implements PushSender {
  sent: { endpoint: string; payload: PushPayload; urgency: string }[] = [];
  goneEndpoints = new Set<string>();
  async publicKey() {
    return "BPUBLICKEY";
  }
  async send(target: PushTarget, payload: PushPayload, opts: { urgency: "high" | "normal" }) {
    if (this.goneEndpoints.has(target.endpoint)) return "gone" as const;
    this.sent.push({ endpoint: target.endpoint, payload, urgency: opts.urgency });
    return "ok" as const;
  }
}

let app: FastifyInstance;
let push: FakePush;
let db: Db;
let hs: FakeHomeserver;

async function resetDb() {
  const c = new pg.Client({ connectionString: DATABASE_URL });
  await c.connect();
  await c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await c.end();
  await migrateUp(DATABASE_URL);
}

async function build(overrides: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL,
    HOMESERVER_URL: "http://hs.invalid",
    MATRIX_SERVER_NAME: "test.local",
    SYNAPSE_REGISTRATION_SHARED_SECRET: "s".repeat(40),
    POLICY_INTERNAL_SECRET: POLICY_SECRET,
    LOG_LEVEL: "silent",
    REGISTRATION_RATE_LIMIT: "1000",
    ...overrides,
  });
  return buildApp({ config, db, homeserver: hs, push });
}

interface User { userId: string; token: string; username: string }

async function register(username: string, extra: Record<string, unknown> = {}): Promise<User> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { username, password: "a strong password", displayName: username, ...extra },
  });
  expect(res.statusCode, res.body).toBe(201);
  const userId = res.json().userId;
  return { userId, username, token: hs.issueToken(userId) };
}

function as(u: User) {
  return {
    get: (url: string) => app.inject({ method: "GET", url, headers: { authorization: `Bearer ${u.token}` } }),
    post: (url: string, payload: unknown = {}) =>
      app.inject({ method: "POST", url, payload: payload as object, headers: { authorization: `Bearer ${u.token}` } }),
    del: (url: string) => app.inject({ method: "DELETE", url, headers: { authorization: `Bearer ${u.token}` } }),
  };
}

async function contactInvite(u: User) {
  const res = await as(u).post("/v1/invites", { kind: "contact" });
  expect(res.statusCode).toBe(201);
  return res.json().token as string;
}

function policy(path: "invite" | "join", payload: unknown, secret = POLICY_SECRET) {
  return app.inject({ method: "POST", url: `/internal/policy/${path}`, payload: payload as object, headers: { "x-imello-policy-secret": secret } });
}

beforeAll(async () => {
  db = createPool(DATABASE_URL);
});
afterAll(async () => {
  await app?.close();
  await db.end();
});
beforeEach(async () => {
  await app?.close();
  await resetDb();
  hs = new FakeHomeserver();
  push = new FakePush();
  app = await build();
});

describe("migrations", () => {
  it("roll back and re-apply cleanly", async () => {
    expect(await migrateDown(DATABASE_URL)).toBe("003_push");
    expect(await migrateDown(DATABASE_URL)).toBe("002_quick_accounts");
    expect(await migrateDown(DATABASE_URL)).toBe("001_init");
    expect(await migrateUp(DATABASE_URL)).toEqual(["001_init", "002_quick_accounts", "003_push"]);
    expect(await migrateUp(DATABASE_URL)).toEqual([]);
  });
});

describe("registration & authentication", () => {
  it("registers an adult account", async () => {
    const u = await register("mona");
    const me = await as(u).get("/v1/me");
    expect(me.json()).toMatchObject({ userId: "@mona:test.local", kind: "adult", guardians: [] });
  });

  it("rejects invalid, reserved and duplicate usernames, and weak passwords", async () => {
    const r = (payload: object) => app.inject({ method: "POST", url: "/v1/auth/register", payload });
    expect((await r({ username: "ab", password: "a strong password", displayName: "x" })).json().error).toBe("username_length");
    expect((await r({ username: "admin", password: "a strong password", displayName: "x" })).json().error).toBe("username_reserved");
    expect((await r({ username: "okname", password: "short", displayName: "x" })).json().error).toBe("password_too_short");
    await register("taken");
    const dup = await r({ username: "taken", password: "a strong password", displayName: "x" });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe("username_unavailable");
  });

  it("rejects missing or invalid tokens", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/me" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: "Bearer nope" } })).statusCode).toBe(401);
  });

  it("rate-limits registration per IP", async () => {
    await app.close();
    app = await build({ REGISTRATION_RATE_LIMIT: "2" });
    await register("one");
    await register("two");
    const third = await app.inject({
      method: "POST", url: "/v1/auth/register", payload: { username: "three", password: "a strong password", displayName: "x" },
    });
    expect(third.statusCode).toBe(429);
  });

  it("behind Cloudflare, limits by CF-Connecting-IP and ignores spoofed X-Forwarded-For", async () => {
    await app.close();
    app = await build({ REGISTRATION_RATE_LIMIT: "1", TRUST_PROXY: "true" });
    const reg = (username: string, headers: Record<string, string>) =>
      app.inject({ method: "POST", url: "/v1/auth/register", headers, payload: { username, password: "a strong password", displayName: "x" } });
    expect((await reg("cfone", { "cf-connecting-ip": "203.0.113.1" })).statusCode).toBe(201);
    // Same real client, different spoofed X-Forwarded-For: still limited.
    expect((await reg("cftwo", { "cf-connecting-ip": "203.0.113.1", "x-forwarded-for": "198.51.100.9" })).statusCode).toBe(429);
    // A different real client is not affected (family members on other networks).
    expect((await reg("cfthree", { "cf-connecting-ip": "203.0.113.2" })).statusCode).toBe(201);
  });

  it("deep health reports dependency status without user data", async () => {
    const res = await app.inject({ method: "GET", url: "/health/deep" });
    // Database is up; the fake homeserver URL is unreachable → degraded (503).
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "degraded", database: { ok: true }, homeserver: { ok: false } });
  });

  it("sends security headers", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("invites & contacts", () => {
  it("connects two adults through a single-use invite", async () => {
    const [a, b, c] = [await register("aa1"), await register("bb1"), await register("cc1")];
    const token = await contactInvite(a);
    const redeem = await as(b).post("/v1/invites/redeem", { token });
    expect(redeem.json().contact.status).toBe("accepted");
    expect((await as(c).post("/v1/invites/redeem", { token })).statusCode).toBe(404);
    expect((await as(a).get("/v1/contacts")).json().contacts.map((x: { userId: string }) => x.userId)).toEqual([b.userId]);
  });

  it("stores only a hash of the invite token", async () => {
    const a = await register("hash1");
    const token = await contactInvite(a);
    const rows = await db.query("SELECT token_hash::text AS h FROM invites");
    expect(JSON.stringify(rows.rows)).not.toContain(token);
  });

  it("does not let you redeem your own invite, and rejects malformed or expired tokens identically", async () => {
    const a = await register("self1");
    const b = await register("self2");
    const token = await contactInvite(a);
    expect((await as(a).post("/v1/invites/redeem", { token })).json().error).toBe("own_invite");
    expect((await as(b).post("/v1/invites/redeem", { token: "x" })).statusCode).toBe(400);
    await db.query("UPDATE invites SET expires_at = now() - interval '1 minute'");
    const expired = await as(b).post("/v1/invites/redeem", { token });
    const unknown = await as(b).post("/v1/invites/redeem", { token: "A".repeat(43) });
    expect(expired.statusCode).toBe(404);
    expect(expired.body).toBe(unknown.body);
  });

  it("previews an invite without consuming it", async () => {
    const a = await register("prev1");
    const b = await register("prev2");
    const token = await contactInvite(a);
    expect((await as(b).post("/v1/invites/preview", { token })).json()).toMatchObject({ kind: "contact", inviterDisplayName: "prev1" });
    expect((await as(b).post("/v1/invites/redeem", { token })).statusCode).toBe(200);
  });
});

describe("guardian controls", () => {
  async function family() {
    const parent = await register("parent");
    const res = await as(parent).post("/v1/guardian/children", { username: "kiddo", password: "a strong password", displayName: "Kiddo" });
    expect(res.statusCode).toBe(201);
    const child = { userId: res.json().userId, username: "kiddo", token: hs.issueToken(res.json().userId) };
    return { parent, child };
  }

  it("guardian creates a child; child sees the guardian; guardian and child may talk", async () => {
    const { parent, child } = await family();
    expect((await as(child).get("/v1/me")).json()).toMatchObject({ kind: "child", guardians: [parent.userId] });
    expect((await policy("invite", { inviter: parent.userId, invitee: child.userId, roomId: "!r", roomMembers: [] })).json())
      .toEqual({ allow: true, reason: "guardian_relationship" });
  });

  it("a child cannot create children or families", async () => {
    const { child } = await family();
    expect((await as(child).post("/v1/guardian/children", { username: "kid2", password: "a strong password", displayName: "x" })).statusCode).toBe(403);
    expect((await as(child).post("/v1/families", { name: "x" })).statusCode).toBe(403);
  });

  it("contact with a child stays pending until the guardian approves", async () => {
    const { parent, child } = await family();
    const adult = await register("aunt");
    const token = await contactInvite(adult);
    expect((await as(child).post("/v1/invites/redeem", { token })).json().contact.status).toBe("pending_guardian");
    const ask = () => policy("invite", { inviter: adult.userId, invitee: child.userId, roomId: "!r", roomMembers: [adult.userId] });
    expect((await ask()).json()).toEqual({ allow: false, reason: "awaiting_guardian_approval" });

    // Someone other than the guardian cannot see or decide the approval.
    const approvals = (await as(parent).get("/v1/guardian/approvals")).json().approvals;
    expect(approvals).toHaveLength(1);
    expect((await as(adult).get("/v1/guardian/approvals")).json().approvals).toEqual([]);
    expect((await as(adult).post(`/v1/guardian/approvals/${approvals[0].approvalId}`, { decision: "approve" })).statusCode).toBe(404);

    expect((await as(parent).post(`/v1/guardian/approvals/${approvals[0].approvalId}`, { decision: "approve" })).json().contactStatus).toBe("accepted");
    expect((await ask()).json().allow).toBe(true);
    // Decisions are final.
    expect((await as(parent).post(`/v1/guardian/approvals/${approvals[0].approvalId}`, { decision: "deny" })).statusCode).toBe(409);
  });

  it("a guardian can deny", async () => {
    const { parent, child } = await family();
    const adult = await register("stranger1");
    await as(child).post("/v1/invites/redeem", { token: await contactInvite(adult) });
    const [a] = (await as(parent).get("/v1/guardian/approvals")).json().approvals;
    expect((await as(parent).post(`/v1/guardian/approvals/${a.approvalId}`, { decision: "deny" })).json().contactStatus).toBe("denied");
    expect((await policy("invite", { inviter: adult.userId, invitee: child.userId, roomId: "!r", roomMembers: [] })).json().reason).toBe("contact_denied");
  });

  it("child joins only when invited, and never into rooms with non-approved members", async () => {
    const { parent, child } = await family();
    const stranger = await register("stranger2");
    expect((await policy("join", { userId: child.userId, roomId: "!r", isInvited: false, roomMembers: [parent.userId] })).json().reason)
      .toBe("child_requires_invite");
    expect((await policy("join", { userId: child.userId, roomId: "!r", isInvited: true, roomMembers: [parent.userId] })).json().allow).toBe(true);
    expect((await policy("join", { userId: child.userId, roomId: "!r", isInvited: true, roomMembers: [parent.userId, stranger.userId] })).json().allow)
      .toBe(false);
    expect((await policy("join", { userId: stranger.userId, roomId: "!r", isInvited: true, roomMembers: [parent.userId, child.userId] })).json().allow)
      .toBe(false);
  });

  it("family invites: relatives become approved contacts of the guardian's children; children cannot self-join", async () => {
    const { parent, child } = await family();
    const fam = (await as(parent).post("/v1/families", { name: "Our Family" })).json();
    expect((await as(parent).post(`/v1/families/${fam.familyId}/children`, { childUserId: child.userId })).statusCode).toBe(200);
    const inv = (await as(parent).post(`/v1/families/${fam.familyId}/invites`)).json();
    const grandma = await register("grandma");
    expect((await as(grandma).post("/v1/invites/redeem", { token: inv.token })).json().family.name).toBe("Our Family");
    expect((await policy("invite", { inviter: grandma.userId, invitee: child.userId, roomId: "!r", roomMembers: [] })).json().allow).toBe(true);

    const inv2 = (await as(parent).post(`/v1/families/${fam.familyId}/invites`)).json();
    expect((await as(child).post("/v1/invites/redeem", { token: inv2.token })).statusCode).toBe(403);
    // Non-admins cannot create family invites.
    expect((await as(grandma).post(`/v1/families/${fam.familyId}/invites`)).statusCode).toBe(403);
  });

  it("only a child's guardian can add them to a family", async () => {
    const { child } = await family();
    const other = await register("otheradult");
    const fam = (await as(other).post("/v1/families", { name: "Not yours" })).json();
    expect((await as(other).post(`/v1/families/${fam.familyId}/children`, { childUserId: child.userId })).statusCode).toBe(403);
  });
});

describe("Start now (iMello numbers) and contact requests", () => {
  const SECRET = "d".repeat(43);
  async function quick(name?: string): Promise<User & { pin: string }> {
    const res = await app.inject({ method: "POST", url: "/v1/auth/quick", payload: { deviceSecret: SECRET, displayName: name } });
    expect(res.statusCode, res.body).toBe(201);
    const { userId, pin } = res.json();
    return { userId, pin, username: pin, token: hs.issueToken(userId) };
  }

  it("creates an account with a mell-xxxxxx number and a device credential", async () => {
    const u = await quick("Mona");
    expect(u.pin).toMatch(/^mell-\d{4}$/);
    expect((await as(u).get("/v1/me")).json()).toMatchObject({ pin: u.pin, credential: "device", displayName: "Mona", kind: "adult" });
    // The homeserver received the device secret as the password.
    expect(hs.users.get(u.pin)).toBe(SECRET);
  });

  it("uses the number as display name when none is given, and rejects weak device secrets", async () => {
    const u = await quick();
    expect((await as(u).get("/v1/me")).json().displayName).toBe(u.pin);
    const weak = await app.inject({ method: "POST", url: "/v1/auth/quick", payload: { deviceSecret: "short" } });
    expect(weak.statusCode).toBe(400);
  });

  it("retries when a generated number is taken", async () => {
    let calls = 0;
    const orig = hs.registerUser.bind(hs);
    hs.registerUser = async (username: string, password: string) => {
      calls++;
      if (calls === 1) throw new HomeserverError(400, "M_USER_IN_USE");
      return orig(username, password);
    };
    await quick();
    expect(calls).toBe(2);
  });

  it("people cannot register a mell- username themselves", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/register", payload: { username: "mell-123456", password: "a strong password", displayName: "x" } });
    expect(res.json().error).toBe("username_reserved");
  });

  it("request by number → accept → contacts; homeserver policy follows", async () => {
    const [a, b] = [await quick("A"), await quick("B")];
    expect((await as(a).post("/v1/contact-requests", { pin: b.pin.toUpperCase().replace("-", " ") })).json()).toEqual({ status: "sent" });
    const inbox = (await as(b).get("/v1/contact-requests")).json();
    expect(inbox.incoming).toHaveLength(1);
    expect(inbox.incoming[0]).toMatchObject({ userId: a.userId, pin: a.pin, displayName: "A" });
    // The sender sees nothing that would confirm the number exists.
    expect((await as(a).get("/v1/contact-requests")).json()).toEqual({ incoming: [] });
    // Not yet allowed to talk.
    expect((await policy("invite", { inviter: a.userId, invitee: b.userId, roomId: "!r", roomMembers: [] })).json().allow).toBe(false);
    // Only the recipient can answer.
    expect((await as(a).post(`/v1/contact-requests/${inbox.incoming[0].requestId}`, { accept: true })).statusCode).toBe(404);
    expect((await as(b).post(`/v1/contact-requests/${inbox.incoming[0].requestId}`, { accept: true })).json().contactStatus).toBe("accepted");
    expect((await policy("invite", { inviter: a.userId, invitee: b.userId, roomId: "!r", roomMembers: [] })).json().allow).toBe(true);
    expect((await as(a).post("/v1/contact-requests", { pin: b.pin })).json().status).toBe("already_contact");
  });

  it("sending back to someone who asked you accepts their request", async () => {
    const [a, b] = [await quick(), await quick()];
    await as(a).post("/v1/contact-requests", { pin: b.pin });
    await as(b).post("/v1/contact-requests", { pin: a.pin });
    expect((await policy("invite", { inviter: a.userId, invitee: b.userId, roomId: "!r", roomMembers: [] })).json().allow).toBe(true);
  });

  it("declining leaves no contact", async () => {
    const [a, b] = [await quick(), await quick()];
    await as(a).post("/v1/contact-requests", { pin: b.pin });
    const [r] = (await as(b).get("/v1/contact-requests")).json().incoming;
    expect((await as(b).post(`/v1/contact-requests/${r.requestId}`, { accept: false })).json().contactStatus).toBeNull();
    expect((await as(b).get("/v1/contacts")).json().contacts).toEqual([]);
  });

  it("unknown, blocked and existing numbers all get the same answer (no probing)", async () => {
    const [a, b] = [await quick(), await quick()];
    await as(b).post("/v1/blocks", { userId: a.userId });
    const unknown = await as(a).post("/v1/contact-requests", { pin: "mell-000001" });
    const blocked = await as(a).post("/v1/contact-requests", { pin: b.pin });
    expect(unknown.statusCode).toBe(202);
    expect(blocked.statusCode).toBe(202);
    expect(unknown.body).toBe(blocked.body);
    expect((await as(b).get("/v1/contact-requests")).json().incoming).toEqual([]);
    expect((await as(a).post("/v1/contact-requests", { pin: "nope" })).json().error).toBe("invalid_number");
    expect((await as(a).post("/v1/contact-requests", { pin: a.pin })).json().error).toBe("own_number");
  });

  it("a request to a child goes to the guardian, never to the child", async () => {
    const parent = await register("guardian1");
    const res = await as(parent).post("/v1/guardian/children", { username: "kid-req", password: "a strong password", displayName: "Kid" });
    const child = { userId: res.json().userId, username: "kid-req", token: hs.issueToken(res.json().userId) };
    // Children don't have mell- numbers, but simulate one being targeted via a renamed account.
    await db.query("UPDATE accounts SET username = 'mell-555555' WHERE user_id = $1", [child.userId]);
    const stranger = await quick("Stranger");
    expect((await as(stranger).post("/v1/contact-requests", { pin: "mell-555555" })).json().status).toBe("sent");
    expect((await as(child).get("/v1/contact-requests")).json().incoming).toEqual([]);
    const approvals = (await as(parent).get("/v1/guardian/approvals")).json().approvals;
    expect(approvals).toHaveLength(1);
    expect(approvals[0].requesterUserId).toBe(stranger.userId);
    expect((await policy("invite", { inviter: stranger.userId, invitee: child.userId, roomId: "!r", roomMembers: [] })).json().allow).toBe(false);
  });

  it("marking an account protected switches it to a password credential", async () => {
    const u = await quick();
    expect((await as(u).post("/v1/me/protected")).json().credential).toBe("password");
  });
});

describe("blocking, reporting, internal auth", () => {
  it("blocking overrides an accepted contact", async () => {
    const [a, b] = [await register("blk1"), await register("blk2")];
    await as(b).post("/v1/invites/redeem", { token: await contactInvite(a) });
    await as(b).post("/v1/blocks", { userId: a.userId });
    expect((await policy("invite", { inviter: a.userId, invitee: b.userId, roomId: "!r", roomMembers: [] })).json().reason).toBe("blocked");
    await as(b).del(`/v1/blocks/${encodeURIComponent(a.userId)}`);
    expect((await policy("invite", { inviter: a.userId, invitee: b.userId, roomId: "!r", roomMembers: [] })).json().allow).toBe(true);
  });

  it("files a report", async () => {
    const [a, b] = [await register("rep1"), await register("rep2")];
    expect((await as(a).post("/v1/reports", { userId: b.userId, reason: "spam" })).statusCode).toBe(201);
  });

  it("policy endpoints require the shared secret; unknown users are denied", async () => {
    expect((await policy("invite", { inviter: "@a:x", invitee: "@b:x", roomId: "!r" }, "wrong".repeat(10))).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/internal/policy/invite", payload: {} })).statusCode).toBe(401);
    expect((await policy("invite", { inviter: "@a:x", invitee: "@b:x", roomId: "!r" })).json()).toEqual({ allow: false, reason: "unknown_account" });
  });
});

describe("account lifecycle", () => {
  it("exports data and deletes the account, which immediately blocks communication", async () => {
    const [a, b] = [await register("del1"), await register("del2")];
    await as(b).post("/v1/invites/redeem", { token: await contactInvite(a) });
    const exp = (await as(a).get("/v1/me/export")).json();
    expect(exp.contacts).toHaveLength(1);
    expect(exp.note).toMatch(/not part of this export/);
    expect((await as(a).del("/v1/me")).json()).toEqual({ deleted: true });
    expect((await as(a).get("/v1/me")).statusCode).toBe(403);
    expect((await policy("invite", { inviter: b.userId, invitee: a.userId, roomId: "!r", roomMembers: [] })).json().allow).toBe(false);
    const audit = await db.query("SELECT event_type FROM audit_events WHERE actor_id = $1", [a.userId]);
    expect(audit.rows.map((r) => r.event_type)).toContain("account.deleted");
  });

  it("audit events never contain passwords or tokens", async () => {
    const a = await register("aud1");
    await contactInvite(a);
    const all = JSON.stringify((await db.query("SELECT * FROM audit_events")).rows);
    expect(all).not.toContain("a strong password");
    expect(all).not.toContain(a.token);
  });
});

describe("background push", () => {
  const sub = (n: string) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } });
  const notify = (pushkey: string, extra: Record<string, unknown> = {}) =>
    app.inject({
      method: "POST",
      url: "/_matrix/push/v1/notify",
      payload: { notification: { event_id: "$e", room_id: "!r:test.local", counts: { unread: 2 }, devices: [{ app_id: "com.imello.web", pushkey, ...extra }] } },
    });

  it("registers a subscription and delivers content-free alerts from the homeserver pusher", async () => {
    const a = await register("push1");
    expect((await as(a).post("/v1/push/subscriptions", { endpoint: "http://insecure", keys: sub("x").keys })).statusCode).toBe(400);
    const { pushkey } = (await as(a).post("/v1/push/subscriptions", sub("a"))).json();
    expect(pushkey).toMatch(/^[\w-]{43}$/);
    const res = await notify(pushkey);
    expect(res.json()).toEqual({ rejected: [] });
    expect(push.sent).toEqual([{ endpoint: "https://push.example/a", payload: { t: "msg", r: "!r:test.local", u: 2 }, urgency: "normal" }]);
    // No message text, sender or event id ever goes into a push payload.
    expect(JSON.stringify(push.sent)).not.toContain("$e");
  });

  it("rejects unknown pushkeys and removes subscriptions the push service says are gone", async () => {
    const a = await register("push2");
    const { pushkey } = (await as(a).post("/v1/push/subscriptions", sub("b"))).json();
    expect((await notify("nope")).json()).toEqual({ rejected: ["nope"] });
    push.goneEndpoints.add("https://push.example/b");
    expect((await notify(pushkey)).json()).toEqual({ rejected: [pushkey] });
    expect((await db.query("SELECT 1 FROM push_subscriptions")).rowCount).toBe(0);
  });

  it("re-subscribing the same browser issues a new pushkey (old one stops working)", async () => {
    const a = await register("push3");
    const b = await register("push4");
    const first = (await as(a).post("/v1/push/subscriptions", sub("same"))).json().pushkey;
    const second = (await as(b).post("/v1/push/subscriptions", sub("same"))).json().pushkey;
    expect(second).not.toBe(first);
    expect((await notify(first)).json()).toEqual({ rejected: [first] });
  });

  it("rings only contacts the policy allows, with the same answer otherwise", async () => {
    const [a, b, c] = [await register("ring1"), await register("ring2"), await register("ring3")];
    await as(b).post("/v1/push/subscriptions", sub("ringb"));
    await as(c).post("/v1/push/subscriptions", sub("ringc"));
    const token = await contactInvite(a);
    await as(b).post("/v1/invites/redeem", { token });
    const ok = await as(a).post("/v1/push/ring", { userId: b.userId, roomId: "!room:test.local", video: true });
    expect(ok.statusCode).toBe(202);
    const stranger = await as(a).post("/v1/push/ring", { userId: c.userId, roomId: "!room:test.local" });
    expect(stranger.statusCode).toBe(202);
    expect(stranger.json()).toEqual(ok.json());
    expect(push.sent).toEqual([{ endpoint: "https://push.example/ringb", payload: { t: "call", r: "!room:test.local", v: true, n: "ring1" }, urgency: "high" }]);
  });
});
