import { timingSafeEqual } from "node:crypto";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { Config } from "./config";
import type { Db } from "./db";
import { tokenFingerprint, type Homeserver } from "./homeserver";
import { getAccount, type AccountRow } from "./repo";
import { registerFamilyRoutes } from "./routes/family";
import { registerInternalRoutes } from "./routes/internal";
import { registerPublicRoutes } from "./routes/public";
import { registerRequestRoutes } from "./routes/requests";
import { registerSocialRoutes } from "./routes/social";
import { registerPushRoutes } from "./routes/push";
import type { PushSender } from "./push";

export interface AppDeps {
  config: Config;
  db: Db;
  homeserver: Homeserver;
  push: PushSender;
}

declare module "fastify" {
  interface FastifyRequest {
    account: AccountRow | null;
  }
  interface FastifyInstance {
    deps: AppDeps;
    requireAccount: (req: FastifyRequest) => Promise<AccountRow>;
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** Short-lived cache of access token → user, so each API call doesn't hit the homeserver. */
const WHOAMI_TTL_MS = 30_000;

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 64 * 1024,
    logger:
      config.LOG_LEVEL === "silent"
        ? false
        : {
            level: config.LOG_LEVEL,
            // Privacy: log only method, route *pattern* and status. Never URLs (they can
            // contain user IDs), bodies, query strings or headers.
            serializers: {
              req: (req) => ({ method: req.method, route: req.routeOptions?.url ?? "unknown" }),
              res: (res) => ({ statusCode: res.statusCode }),
            },
            redact: ["req.headers.authorization", "headers.authorization"],
          },
  });

  app.decorate("deps", deps);
  app.decorateRequest("account", null);

  await app.register(helmet, {
    // This is a JSON API; a maximally restrictive CSP is appropriate.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  await app.register(cors, {
    origin: config.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["authorization", "content-type"],
    credentials: false,
    maxAge: 600,
  });
  await app.register(rateLimit, {
    global: config.RATE_LIMIT_ENABLED,
    max: 300,
    timeWindow: "1 minute",
    // Authenticated requests are limited per credential (many family members can
    // share one home IP behind NAT); anonymous requests per client IP.
    keyGenerator: (req) => {
      const auth = req.headers.authorization;
      if (auth?.startsWith("Bearer ")) return `tok:${tokenFingerprint(auth.slice(7).trim())}`;
      // Behind Cloudflare Tunnel the client address is in CF-Connecting-IP, which Cloudflare sets
      // itself; the left-most X-Forwarded-For entry can be supplied by the client and spoofed.
      const cf = config.TRUST_PROXY ? req.headers["cf-connecting-ip"] : undefined;
      return `ip:${typeof cf === "string" && cf.length <= 64 ? cf : req.ip}`;
    },
    errorResponseBuilder: (_req, ctx) => ({ statusCode: ctx.statusCode, error: "rate_limited", message: "Too many requests" }),
  });

  const cache = new Map<string, { userId: string; expires: number }>();
  app.decorate("requireAccount", async (req: FastifyRequest) => {
    if (req.account) return req.account;
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new HttpError(401, "unauthorized");
    const token = header.slice("Bearer ".length).trim();
    const key = tokenFingerprint(token);
    const cached = cache.get(key);
    let userId = cached && cached.expires > Date.now() ? cached.userId : null;
    if (!userId) {
      const who = await deps.homeserver.whoami(token);
      if (!who) throw new HttpError(401, "unauthorized");
      userId = who.userId;
      cache.set(key, { userId, expires: Date.now() + WHOAMI_TTL_MS });
      if (cache.size > 10_000) cache.clear();
    }
    const account = await getAccount(deps.db, userId);
    if (!account || account.status !== "active") throw new HttpError(403, "account_inactive");
    req.account = account;
    return account;
  });

  app.setErrorHandler((err: unknown, req, reply: FastifyReply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
    if (err instanceof ZodError) return reply.status(400).send({ error: "invalid_request" });
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode === 429) return reply.status(429).send({ error: "rate_limited" });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: e.code === "FST_ERR_CTP_BODY_TOO_LARGE" ? "too_large" : "bad_request" });
    }
    req.log.error({ errName: (err as Error)?.name, code: e.code }, "unhandled error");
    return reply.status(500).send({ error: "internal_error" });
  });

  app.get("/health", async () => ({ status: "ok" }));

  /**
   * Deeper check for monitoring: database and homeserver reachability with latencies.
   * Returns no user data. 503 when a dependency is down, so a monitor can alert.
   */
  app.get("/health/deep", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (_req, reply) => {
    const timed = async (f: () => Promise<unknown>) => {
      const t0 = performance.now();
      try {
        await f();
        return { ok: true, ms: Math.round(performance.now() - t0) };
      } catch {
        return { ok: false, ms: Math.round(performance.now() - t0) };
      }
    };
    const [database, homeserver] = await Promise.all([
      timed(() => deps.db.query("SELECT 1")),
      timed(async () => {
        const res = await fetch(`${config.HOMESERVER_URL}/health`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(String(res.status));
      }),
    ]);
    const ok = database.ok && homeserver.ok;
    return reply.status(ok ? 200 : 503).send({ status: ok ? "ok" : "degraded", database, homeserver, uptimeSeconds: Math.round(process.uptime()) });
  });

  await registerPublicRoutes(app);
  await registerSocialRoutes(app);
  await registerRequestRoutes(app);
  await registerFamilyRoutes(app);
  await registerInternalRoutes(app);
  await registerPushRoutes(app);

  return app;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
