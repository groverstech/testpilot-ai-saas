import type { FastifyInstance } from "fastify";
import type { IntegrationStatusDTO } from "@testpilot/shared";
import { requireOrg } from "../plugins/auth";
import { githubMissingConfig } from "./github";

/**
 * Reports which platform integrations are configured on this deployment. Only the *names* of
 * missing environment variables are returned — never values.
 */
export async function integrationRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const ctx = await requireOrg(request, "integrations:read");
    const env = app.config.env;
    const missing = (keys: string[]) => keys.filter((k) => !env[k as keyof typeof env]);

    const ghMissing = githubMissingConfig(app);
    const ghConnections = await app.db.gitHubConnection.count({ where: { organizationId: ctx.organization.id, revokedAt: null } });
    const anthropicMissing = missing(["ANTHROPIC_API_KEY"]);
    const stripeMissing = missing(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    const storageMissing = missing(["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]);
    const queueMissing = missing(["REDIS_URL"]);

    const data: IntegrationStatusDTO[] = [
      {
        id: "github",
        name: "GitHub",
        description: "Connect repositories, branches and pull requests through the TestPilot GitHub App.",
        configured: ghMissing.length === 0,
        connected: ghConnections > 0,
        details: ghMissing.length ? "GitHub App credentials are not configured on this deployment." : ghConnections ? `${ghConnections} connection(s)` : "Configured — repository connection ships in Phase 2.",
        missing: ghMissing,
      },
      {
        id: "anthropic",
        name: "Anthropic Claude",
        description: "Powers the repository analyst, test planner, visual QA and bug analysis agents.",
        configured: anthropicMissing.length === 0,
        connected: false,
        details: anthropicMissing.length ? "API key not configured." : "API key present (not yet exercised — agents ship in Phase 3).",
        missing: anthropicMissing,
      },
      {
        id: "storage",
        name: "Object storage (S3-compatible)",
        description: "Stores screenshots, videos, logs and reports.",
        configured: storageMissing.length === 0,
        connected: false,
        details: storageMissing.length ? "Storage credentials not configured." : "Configured (used from Phase 4).",
        missing: storageMissing,
      },
      {
        id: "queue",
        name: "Redis job queue",
        description: "BullMQ queue for repository, browser and report workers.",
        configured: queueMissing.length === 0,
        connected: false,
        details: queueMissing.length ? "REDIS_URL not configured." : "Configured.",
        missing: queueMissing,
      },
      {
        id: "email",
        name: "Email delivery",
        description: "Verification, password reset and invitation emails.",
        configured: app.config.emailTransport === "smtp",
        connected: app.config.emailTransport === "smtp",
        details: app.config.emailTransport === "smtp" ? "SMTP configured." : `Using the "${app.config.emailTransport}" development transport — emails are not delivered.`,
        missing: app.config.emailTransport === "smtp" ? [] : ["SMTP_URL"],
      },
      {
        id: "stripe",
        name: "Stripe",
        description: "Subscriptions, billing portal and usage metering.",
        configured: stripeMissing.length === 0,
        connected: false,
        details: stripeMissing.length ? "Stripe credentials not configured." : "Credentials present (billing flows ship in Phase 7).",
        missing: stripeMissing,
      },
    ];
    return { data };
  });
}
