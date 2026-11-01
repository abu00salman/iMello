import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImelloApiClient } from "@imello/core";
import {
  configureSdkLogging,
  loginWithPassword,
  startSecureClient,
  type MatrixClient,
  type Session,
} from "@imello/core/messaging";
import pg from "pg";

configureSdkLogging("error");

export const env = {
  apiUrl: process.env.IMELLO_API_URL ?? "http://127.0.0.1:8787",
  homeserverUrl: process.env.HOMESERVER_URL ?? "http://127.0.0.1:8008",
  synapseDbUrl: process.env.SYNAPSE_DB_URL ?? "postgres://imello:imello@127.0.0.1:5432/synapse",
  stateDir: process.env.IMELLO_STATE_DIR ?? join(import.meta.dirname, "../../../.dev-stack"),
};

export const PASSWORD = "e2e-password-" + randomBytes(6).toString("hex");
const runId = randomBytes(3).toString("hex");

export interface TestUser {
  username: string;
  userId: string;
  api: ImelloApiClient;
  session: Session;
  client: MatrixClient;
}

const started: MatrixClient[] = [];

export function uniqueName(prefix: string) {
  return `${prefix}.${runId}${randomBytes(2).toString("hex")}`;
}

/** Sign in an existing account as a new device, with in-memory crypto. */
export async function signIn(
  username: string,
  deviceName: string,
  password = PASSWORD,
  homeserverUrl = env.homeserverUrl,
): Promise<TestUser> {
  const session = await loginWithPassword(homeserverUrl, username, password, deviceName);
  const client = await startSecureClient({
    session,
    cryptoStore: { kind: "memory" },
    passwordForCrossSigningSetup: password,
  });
  started.push(client);
  const api = new ImelloApiClient(env.apiUrl, session.accessToken);
  return { username, userId: session.userId, api, session, client };
}

export async function registerAdult(prefix: string, displayName = prefix, homeserverUrl = env.homeserverUrl): Promise<TestUser> {
  const username = uniqueName(prefix);
  await new ImelloApiClient(env.apiUrl).register({ username, password: PASSWORD, displayName });
  return signIn(username, `${prefix} test device`, PASSWORD, homeserverUrl);
}

export async function createChild(guardian: TestUser, prefix: string): Promise<TestUser> {
  const username = uniqueName(prefix);
  await guardian.api.createChild({ username, password: PASSWORD, displayName: prefix });
  return signIn(username, `${prefix} tablet`);
}

/** Make two adults contacts via a private invite. */
export async function connect(a: TestUser, b: TestUser) {
  const invite = await a.api.createContactInvite();
  return b.api.redeemInvite(invite.token);
}

export async function stopAll() {
  for (const c of started.splice(0)) {
    c.stopClient();
  }
}

/** Search the homeserver's database for a string. Used to prove plaintext never reaches the server. */
export async function synapseDbContains(needle: string): Promise<{ eventJsonHits: number; anyTableHits: string[] }> {
  const db = new pg.Client({ connectionString: env.synapseDbUrl });
  await db.connect();
  try {
    const eventJson = await db.query("SELECT count(*)::int AS n FROM event_json WHERE json LIKE $1", [`%${needle}%`]);
    // Scan every text/json column of every table, not just events.
    const cols = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'json', 'jsonb', 'bytea')`,
    );
    const hits: string[] = [];
    for (const { table_name, column_name } of cols.rows) {
      const r = await db.query(
        `SELECT 1 FROM "${table_name}" WHERE position($1 in convert_from(convert_to("${column_name}"::text, 'UTF8'), 'UTF8')) > 0 LIMIT 1`,
        [needle],
      );
      if (r.rowCount) hits.push(`${table_name}.${column_name}`);
    }
    return { eventJsonHits: eventJson.rows[0].n, anyTableHits: hits };
  } finally {
    await db.end();
  }
}

export async function serverLogsContain(needle: string): Promise<string[]> {
  const files = [join(env.stateDir, "synapse/homeserver.log"), join(env.stateDir, "api.log"), join(env.stateDir, "synapse.stdout.log")];
  const hits: string[] = [];
  for (const f of files) {
    const text = await readFile(f, "utf8").catch(() => "");
    if (text.includes(needle)) hits.push(f);
  }
  return hits;
}

export async function expectMatrixForbidden(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    const e = err as { httpStatus?: number; errcode?: string };
    if (e.httpStatus === 403) return e.errcode ?? "M_FORBIDDEN";
    throw err;
  }
  throw new Error("expected the homeserver to refuse with 403, but the request succeeded");
}

export function secret(label: string) {
  return `${label}-${randomBytes(12).toString("hex")}`;
}
