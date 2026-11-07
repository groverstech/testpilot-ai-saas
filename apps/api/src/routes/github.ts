import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { errors, parse } from "../lib/errors";
import { requireOrg } from "../plugins/auth";

export const GITHUB_APP_REQUIRED_ENV = ["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"] as const;

export function githubMissingConfig(app: FastifyInstance): string[] {
  return GITHUB_APP_REQUIRED_ENV.filter((k) => !app.config.env[k]);
}

/**
 * GitHub integration (Phase 2). In Phase 1 these endpoints are wired, authorised and backed by
 * the database, but connecting requires a configured GitHub App, and the installation flow
 * itself is delivered in Phase 2. Nothing here pretends a connection exists.
 */
export async function githubRoutes(app: FastifyInstance) {
  app.get("/status", async (request) => {
    const ctx = await requireOrg(request, "integrations:read");
    const connections = await app.db.gitHubConnection.findMany({
      where: { organizationId: ctx.organization.id, revokedAt: null },
      select: { id: true, accountLogin: true, accountType: true, createdAt: true },
    });
    const missing = githubMissingConfig(app);
    return { configured: missing.length === 0, missing, connections };
  });

  app.post("/connect", async (request) => {
    await requireOrg(request, "integrations:manage");
    const missing = githubMissingConfig(app);
    if (missing.length) throw errors.notConfigured("The GitHub App", missing);
    throw errors.notImplemented("The GitHub App installation flow ships in Phase 2");
  });

  app.get("/repositories", async (request) => {
    const ctx = await requireOrg(request, "repositories:read");
    const repos = await app.db.repository.findMany({
      where: { organizationId: ctx.organization.id },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, isPrivate: true, defaultBranch: true, htmlUrl: true, analyzedAt: true },
    });
    return { data: repos.map((r) => ({ ...r, analyzedAt: r.analyzedAt?.toISOString() ?? null })) };
  });

  app.get("/repositories/:id/branches", async (request) => {
    const ctx = await requireOrg(request, "repositories:read");
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const repo = await app.db.repository.findFirst({ where: { id, organizationId: ctx.organization.id } });
    if (!repo) throw errors.notFound("Repository");
    const branches = await app.db.branch.findMany({ where: { repositoryId: id }, orderBy: { name: "asc" } });
    return { data: branches.map((b) => ({ id: b.id, name: b.name, headSha: b.headSha, isProtected: b.isProtected })) };
  });
}
