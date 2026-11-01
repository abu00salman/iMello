import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createPool } from "./db";
import { synapseHomeserver } from "./homeserver";
import { migrateUp } from "./migrate";

const config = loadConfig();
await migrateUp(config.DATABASE_URL);
const db = createPool(config.DATABASE_URL);
const app = await buildApp({
  config,
  db,
  homeserver: synapseHomeserver(config.HOMESERVER_URL, config.SYNAPSE_REGISTRATION_SHARED_SECRET),
});

const shutdown = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: config.API_HOST, port: config.API_PORT });
