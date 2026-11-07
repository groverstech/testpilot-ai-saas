import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { createPrismaClient, type PrismaClient } from "@testpilot/database";
import type { AppConfig } from "./config";
import { registerErrorHandler } from "./lib/errors";
import { createMailer, type Mailer } from "./lib/mailer";
import { registerAuth } from "./plugins/auth";
import { registerCsrf } from "./plugins/csrf";
import { healthRoutes } from "./routes/health";
import { authRoutes } from "./routes/auth";
import { meRoutes } from "./routes/me";
import { organizationRoutes } from "./routes/organizations";
import { memberRoutes } from "./routes/members";
import { invitationRoutes } from "./routes/invitations";
import { projectRoutes } from "./routes/projects";
import { secretRoutes } from "./routes/secrets";
import { dashboardRoutes } from "./routes/dashboard";
import { githubRoutes } from "./routes/github";
import { testingRoutes } from "./routes/testing";
import { billingRoutes } from "./routes/billing";
import { integrationRoutes } from "./routes/integrations";
import { auditRoutes } from "./routes/audit";

declare module "fastify" {
  interface FastifyInstance {
    db: PrismaClient;
    config: AppConfig;
    mailer: Mailer;
    /** DNS resolver used by SSRF checks; injectable for tests. */
    resolveHost?: (hostname: string) => Promise<string[]>;
  }
}

export interface BuildAppOptions {
  config: AppConfig;
  db?: PrismaClient;
  resolveHost?: (hostname: string) => Promise<string[]>;
}

export async function buildApp({ config, db, resolveHost }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: config.env.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    genReqId: () => crypto.randomUUID(),
    logger: {
      level: config.isTest ? "silent" : config.env.LOG_LEVEL,
      redact: {
        paths: [
          "req.headers.cookie",
          "req.headers.authorization",
          'req.headers["x-hub-signature-256"]',
          'res.headers["set-cookie"]',
          "*.password",
          "*.token",
          "*.value",
        ],
        censor: "[REDACTED]",
      },
    },
  });

  app.decorate("config", config);
  app.decorate("db", db ?? createPrismaClient(config.env.DATABASE_URL));
  app.decorate("mailer", createMailer(config, app.log));
  app.decorate("resolveHost", resolveHost);

  registerErrorHandler(app);

  await app.register(helmet, {
    // The API only serves JSON; a strict CSP is safe.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: config.env.RATE_LIMIT_ENABLED ? 300 : 1_000_000,
    timeWindow: "1 minute",
    keyGenerator: (req) => req.ip,
    ...(config.env.REDIS_URL && !config.isTest
      ? { redis: new (await import("ioredis")).Redis(config.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: false }) }
      : {}),
  });

  registerCsrf(app);
  registerAuth(app);

  await app.register(healthRoutes);
  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: "/auth" });
      await v1.register(meRoutes, { prefix: "/me" });
      await v1.register(organizationRoutes, { prefix: "/organizations" });
      await v1.register(memberRoutes, { prefix: "/members" });
      await v1.register(invitationRoutes, { prefix: "/invitations" });
      await v1.register(projectRoutes, { prefix: "/projects" });
      await v1.register(secretRoutes, { prefix: "/projects" });
      await v1.register(dashboardRoutes, { prefix: "/dashboard" });
      await v1.register(githubRoutes, { prefix: "/github" });
      await v1.register(testingRoutes);
      await v1.register(billingRoutes, { prefix: "/billing" });
      await v1.register(integrationRoutes, { prefix: "/integrations" });
      await v1.register(auditRoutes, { prefix: "/audit-logs" });
    },
    { prefix: "/api/v1" },
  );

  app.addHook("onClose", async () => {
    if (!db) await app.db.$disconnect();
  });

  return app;
}
