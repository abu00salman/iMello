import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function versions(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((f) => f.endsWith(".up.sql")).map((f) => f.replace(".up.sql", "")).sort();
}

/** Apply all pending migrations, each in its own transaction. */
export async function migrateUp(databaseUrl: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const done = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
    for (const v of await versions()) {
      if (done.has(v)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, `${v}.up.sql`), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [v]);
        await client.query("COMMIT");
        applied.push(v);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

/** Roll back the most recent migration. */
export async function migrateDown(databaseUrl: string): Promise<string | null> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const last = (await client.query("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1")).rows[0]
      ?.version as string | undefined;
    if (!last) return null;
    const sql = await readFile(join(MIGRATIONS_DIR, `${last}.down.sql`), "utf8");
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("DELETE FROM schema_migrations WHERE version = $1", [last]);
    await client.query("COMMIT");
    return last;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const direction = process.argv[2] ?? "up";
  if (direction === "down") {
    console.log("rolled back:", (await migrateDown(url)) ?? "nothing");
  } else {
    const applied = await migrateUp(url);
    console.log(applied.length ? `applied: ${applied.join(", ")}` : "database is up to date");
  }
}
