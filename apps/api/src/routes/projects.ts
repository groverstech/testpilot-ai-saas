import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@testpilot/database";
import {
  createProjectSchema,
  listProjectsQuerySchema,
  slugify,
  updateProjectSchema,
  type ProjectDTO,
} from "@testpilot/shared";
import { assertSafePublicUrl, UnsafeUrlError } from "@testpilot/shared/url-safety";
import { audit } from "../lib/audit";
import { ApiError, errors, parse } from "../lib/errors";
import { normalizeTestSettings, paginate } from "../lib/serializers";
import { requireOrg, type OrgContext } from "../plugins/auth";
import { getOrgPlanLimits } from "./billing";

const idParams = z.object({ id: z.string().uuid() });

const projectInclude = {
  workspace: { select: { id: true, name: true } },
  repository: { select: { id: true, fullName: true, htmlUrl: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { testRuns: true, testCases: true } },
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

async function toProjectDTOs(app: FastifyInstance, rows: ProjectRow[]): Promise<ProjectDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [openBugs, lastRuns] = await Promise.all([
    app.db.bug.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, status: { in: ["OPEN", "CONFIRMED", "IN_PROGRESS"] } }, _count: true }),
    app.db.testRun.groupBy({ by: ["projectId"], where: { projectId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  const bugMap = new Map(openBugs.map((b) => [b.projectId, b._count]));
  const runMap = new Map(lastRuns.map((r) => [r.projectId, r._max.createdAt]));
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    appUrl: p.appUrl,
    defaultBranch: p.defaultBranch,
    status: p.status,
    testSettings: normalizeTestSettings(p.testSettings),
    workspace: p.workspace,
    repository: p.repository,
    createdBy: p.createdBy,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    stats: {
      testRuns: p._count.testRuns,
      testCases: p._count.testCases,
      openBugs: bugMap.get(p.id) ?? 0,
      lastRunAt: runMap.get(p.id)?.toISOString() ?? null,
    },
  }));
}

export async function validateAppUrl(app: FastifyInstance, url: string | null | undefined) {
  if (!url) return;
  try {
    await assertSafePublicUrl(url, { allowPrivate: app.config.env.ALLOW_PRIVATE_APP_URLS, resolve: app.resolveHost });
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      throw errors.validation([{ path: "appUrl", message: err.message }]);
    }
    throw err;
  }
}

/** Tenant-scoped lookup: a project in another organization is indistinguishable from a missing one. */
export async function findProjectOr404(app: FastifyInstance, ctx: OrgContext, id: string) {
  const project = await app.db.project.findFirst({ where: { id, organizationId: ctx.organization.id }, include: projectInclude });
  if (!project) throw errors.notFound("Project");
  return project;
}

async function uniqueProjectSlug(app: FastifyInstance, organizationId: string, base: string, excludeId?: string) {
  let slug = base;
  for (let i = 2; ; i++) {
    const clash = await app.db.project.findFirst({ where: { organizationId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (!clash) return slug;
    slug = `${base}-${i}`;
  }
}

export async function projectRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const ctx = await requireOrg(request, "projects:read");
    const q = parse(listProjectsQuerySchema, request.query);
    const where: Prisma.ProjectWhereInput = {
      organizationId: ctx.organization.id,
      ...(q.status !== "ALL" ? { status: q.status } : {}),
      ...(q.workspaceId ? { workspaceId: q.workspaceId } : {}),
      ...(q.search
        ? { OR: [{ name: { contains: q.search, mode: "insensitive" } }, { description: { contains: q.search, mode: "insensitive" } }] }
        : {}),
    };
    const [total, rows] = await Promise.all([
      app.db.project.count({ where }),
      app.db.project.findMany({
        where,
        include: projectInclude,
        orderBy: { updatedAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { data: await toProjectDTOs(app, rows), pagination: paginate(q.page, q.pageSize, total) };
  });

  app.post("/", async (request, reply) => {
    const ctx = await requireOrg(request, "projects:create");
    const input = parse(createProjectSchema, request.body);
    await validateAppUrl(app, input.appUrl);

    const limits = await getOrgPlanLimits(app, ctx.organization.id);
    if (limits.projects !== null) {
      const active = await app.db.project.count({ where: { organizationId: ctx.organization.id, status: "ACTIVE" } });
      if (active >= limits.projects) {
        throw errors.planLimit(`Your plan allows up to ${limits.projects} active projects. Archive a project or upgrade.`);
      }
    }

    const workspace = input.workspaceId
      ? await app.db.workspace.findFirst({ where: { id: input.workspaceId, organizationId: ctx.organization.id } })
      : await app.db.workspace.findFirst({ where: { organizationId: ctx.organization.id, isDefault: true } });
    if (!workspace) throw errors.validation([{ path: "workspaceId", message: "Workspace not found" }]);

    const slug = await uniqueProjectSlug(app, ctx.organization.id, slugify(input.name));
    const project = await app.db.project.create({
      data: {
        organizationId: ctx.organization.id,
        workspaceId: workspace.id,
        createdById: ctx.user.id,
        name: input.name,
        slug,
        description: input.description ?? null,
        appUrl: input.appUrl ?? null,
        defaultBranch: input.defaultBranch ?? null,
        testSettings: normalizeTestSettings({}) as Prisma.InputJsonValue,
      },
      include: projectInclude,
    });
    await audit(app.db, request, {
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "project.created",
      targetType: "project",
      targetId: project.id,
      metadata: { name: project.name },
    });
    return reply.status(201).send((await toProjectDTOs(app, [project]))[0]);
  });

  app.get("/:id", async (request) => {
    const ctx = await requireOrg(request, "projects:read");
    const { id } = parse(idParams, request.params);
    const project = await findProjectOr404(app, ctx, id);
    return (await toProjectDTOs(app, [project]))[0];
  });

  app.patch("/:id", async (request) => {
    const ctx = await requireOrg(request, "projects:update");
    const { id } = parse(idParams, request.params);
    const input = parse(updateProjectSchema, request.body);
    const project = await findProjectOr404(app, ctx, id);
    if (input.status && input.status !== project.status) {
      if (!(ctx.role === "OWNER" || ctx.role === "ADMIN")) throw errors.forbidden();
    }
    if (input.appUrl !== undefined) await validateAppUrl(app, input.appUrl);

    const data: Prisma.ProjectUpdateInput = {};
    if (input.name !== undefined && input.name !== project.name) {
      data.name = input.name;
      data.slug = await uniqueProjectSlug(app, ctx.organization.id, slugify(input.name), project.id);
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.appUrl !== undefined) data.appUrl = input.appUrl;
    if (input.defaultBranch !== undefined) data.defaultBranch = input.defaultBranch;
    if (input.testSettings) {
      data.testSettings = normalizeTestSettings({ ...normalizeTestSettings(project.testSettings), ...input.testSettings }) as Prisma.InputJsonValue;
    }
    if (input.status && input.status !== project.status) {
      if (input.status === "ACTIVE") await assertProjectQuota(app, ctx);
      data.status = input.status;
      data.archivedAt = input.status === "ARCHIVED" ? new Date() : null;
    }

    const updated = await app.db.project.update({ where: { id: project.id }, data, include: projectInclude });
    await audit(app.db, request, {
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: input.status === "ARCHIVED" ? "project.archived" : input.status === "ACTIVE" && project.status === "ARCHIVED" ? "project.restored" : "project.updated",
      targetType: "project",
      targetId: project.id,
      metadata: { changes: Object.keys(input) },
    });
    return (await toProjectDTOs(app, [updated]))[0];
  });

  /** Permanent deletion. Only archived projects can be deleted, as a guard against accidents. */
  app.delete("/:id", async (request, reply) => {
    const ctx = await requireOrg(request, "projects:delete");
    const { id } = parse(idParams, request.params);
    const project = await findProjectOr404(app, ctx, id);
    if (project.status !== "ARCHIVED") {
      throw new ApiError(409, "PROJECT_NOT_ARCHIVED", "Archive the project before deleting it permanently");
    }
    await app.db.project.delete({ where: { id: project.id } });
    await audit(app.db, request, {
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "project.deleted",
      targetType: "project",
      targetId: project.id,
      metadata: { name: project.name },
    });
    return reply.status(204).send();
  });
}

async function assertProjectQuota(app: FastifyInstance, ctx: OrgContext) {
  const limits = await getOrgPlanLimits(app, ctx.organization.id);
  if (limits.projects === null) return;
  const active = await app.db.project.count({ where: { organizationId: ctx.organization.id, status: "ACTIVE" } });
  if (active >= limits.projects) throw errors.planLimit(`Your plan allows up to ${limits.projects} active projects.`);
}
