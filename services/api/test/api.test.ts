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

let app: FastifyInstance;
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
  return buildApp({ config, db, homeserver: hs });
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
  app = await build();
});

describe("migrations", () => {
  it("roll back and re-apply cleanly", async () => {
    expect(await migrateDown(DATABASE_URL)).toBe("001_init");
    expect(await migrateUp(DATABASE_URL)).toEqual(["001_init"]);
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
