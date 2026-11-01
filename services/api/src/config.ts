import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().default(8787),
  DATABASE_URL: z.string().min(1),
  /** URL the API uses to reach the homeserver (may be internal). */
  HOMESERVER_URL: z.string().url(),
  /** URL clients use to reach the homeserver. */
  PUBLIC_HOMESERVER_URL: z.string().url().optional(),
  MATRIX_SERVER_NAME: z.string().min(1),
  /** Synapse `registration_shared_secret`. Lets this service create accounts; must stay server-side. */
  SYNAPSE_REGISTRATION_SHARED_SECRET: z.string().min(32),
  /** Shared secret the Synapse policy module presents to /internal endpoints. */
  POLICY_INTERNAL_SECRET: z.string().min(32),
  /** Comma-separated list of browser origins allowed by CORS. */
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  /** Public URL of the web app, used to build invite links. */
  PUBLIC_WEB_URL: z.string().url().default("http://localhost:5173"),
  RATE_LIMIT_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  /** Registrations allowed per IP per 10 minutes. Keep low in production. */
  REGISTRATION_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "silent"]).default("info"),
});

export type Config = z.infer<typeof schema> & { PUBLIC_HOMESERVER_URL: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid iMello API configuration: ${fields}`);
  }
  return { ...parsed.data, PUBLIC_HOMESERVER_URL: parsed.data.PUBLIC_HOMESERVER_URL ?? parsed.data.HOMESERVER_URL };
}
