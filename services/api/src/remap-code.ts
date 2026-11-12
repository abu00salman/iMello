/**
 * Attach a short iMello Code to ONE existing account without changing who they are.
 *
 * Dry-run (prints the SQL, writes nothing):
 *   DATABASE_URL=... pnpm --filter @imello/api exec tsx src/remap-code.ts mell-872864 w1122
 *
 * Apply only after reading that plan:
 *   DATABASE_URL=... pnpm --filter @imello/api exec tsx src/remap-code.ts mell-872864 w1122 --apply
 *
 * The Matrix username stays mell-872864, so history and the old sign-in keep working.
 * Mell-1122 becomes an alias in accounts.code. If that code is already taken, nothing is written.
 * This file does not run unless you invoke it. Do not point it at production from CI.
 */
import pg from "pg";
import { planCodeAlias, type CodeAccount } from "./remap-plan";

const [from, to, flag] = process.argv.slice(2);
const apply = flag === "--apply";

if (!from || !to || (flag && flag !== "--apply")) {
  console.error("usage: remap-code.ts <username> <Mell-1122> [--apply]");
  process.exit(2);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required. Nothing was changed.");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const rows = (await client.query<CodeAccount>(
    "SELECT user_id AS \"userId\", username, code FROM accounts WHERE status = 'active'",
  )).rows;
  const plan = planCodeAlias(rows, from, to);
  console.log(apply ? "APPLY" : "DRY RUN");
  console.log(plan.reason);
  if (!plan.ok || !plan.sql || plan.sql.startsWith("--")) {
    if (!plan.ok) process.exitCode = 1;
    console.log(plan.sql ?? "(no SQL)");
    process.exit(plan.ok ? 0 : 1);
  }
  console.log(plan.sql);
  console.log("rollback:");
  console.log(plan.rollback);
  if (!apply) {
    console.log("No rows written. Re-run with --apply to commit this one UPDATE.");
  } else if (plan.userId && plan.usernameUnchanged && plan.code) {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE accounts SET code = $1 WHERE user_id = $2 AND username = $3 AND (code IS DISTINCT FROM $1)",
      [plan.code, plan.userId, plan.usernameUnchanged],
    );
    if (updated.rowCount !== 1) {
      await client.query("ROLLBACK");
      console.error("Refused: the row changed or the code is no longer free. Nothing was written.");
      process.exitCode = 1;
    } else {
      await client.query("COMMIT");
      console.log("Applied. Username was not changed.");
    }
  }
} catch (err) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
