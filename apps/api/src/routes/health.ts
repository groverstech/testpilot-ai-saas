import type { FastifyInstance } from "fastify";

export async function healthRoutes(app: FastifyInstance) {
  /** Liveness: the process is up. */
  app.get("/health", { config: { rateLimit: false } }, async () => ({ status: "ok" }));

  /** Readiness: dependencies are reachable. */
  app.get("/health/ready", { config: { rateLimit: false } }, async (_req, reply) => {
    const checks: Record<string, "ok" | "error" | "not_configured"> = {};
    try {
      await app.db.$queryRaw`SELECT 1`;
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }
    if (app.config.env.REDIS_URL) {
      try {
        const { Redis } = await import("ioredis");
        const r = new Redis(app.config.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 1500 });
        await r.connect();
        await r.ping();
        r.disconnect();
        checks.redis = "ok";
      } catch {
        checks.redis = "error";
      }
    } else {
      checks.redis = "not_configured";
    }
    const healthy = checks.database === "ok" && checks.redis !== "error";
    return reply.status(healthy ? 200 : 503).send({ status: healthy ? "ok" : "degraded", checks });
  });
}
