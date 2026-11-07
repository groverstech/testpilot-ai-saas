import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@testpilot/database";
import {
  createOrganizationSchema,
  createWorkspaceSchema,
  slugify,
  updateOrganizationSchema,
  type OrganizationDTO,
} from "@testpilot/shared";
import { audit } from "../lib/audit";
import { errors, parse } from "../lib/errors";
import { requireOrg, requireUser } from "../plugins/auth";
import { loadSessionDTO } from "./auth";

const MAX_ORGS_PER_USER = 20;

async function uniqueOrgSlug(db: Prisma.TransactionClient, base: string): Promise<string> {
  let slug = base;
  for (let i = 2; await db.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`.slice(0, 56);
  return slug;
}

async function toOrganizationDTO(app: FastifyInstance, orgId: string): Promise<OrganizationDTO> {
  const org = await app.db.organization.findUniqueOrThrow({
    where: { id: orgId },
    include: { workspaces: { orderBy: [{ isDefault: "desc" }, { name: "asc" }] }, _count: { select: { members: true } } },
  });
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.createdAt.toISOString(),
    memberCount: org._count.members,
    workspaces: org.workspaces.map((w) => ({ id: w.id, name: w.name, slug: w.slug, isDefault: w.isDefault })),
  };
}

export async function organizationRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const { user, session } = requireUser(request);
    const dto = await loadSessionDTO(app, user, session.activeOrganizationId);
    return { data: dto.organizations, activeOrganizationId: dto.activeOrganization?.id ?? null };
  });

  app.post("/", async (request, reply) => {
    const { user, session } = requireUser(request);
    const input = parse(createOrganizationSchema, request.body);
    const count = await app.db.organizationMember.count({ where: { userId: user.id } });
    if (count >= MAX_ORGS_PER_USER) throw errors.conflict("You have reached the maximum number of organizations");

    const org = await app.db.$transaction(async (tx) => {
      if (input.slug && (await tx.organization.findUnique({ where: { slug: input.slug } }))) {
        throw errors.conflict("This organization URL is already taken", "SLUG_TAKEN");
      }
      const slug = input.slug ?? (await uniqueOrgSlug(tx, slugify(input.name)));
      const created = await tx.organization.create({ data: { name: input.name, slug } });
      await tx.organizationMember.create({ data: { organizationId: created.id, userId: user.id, role: "OWNER" } });
      await tx.workspace.create({ data: { organizationId: created.id, name: "General", slug: "general", isDefault: true } });
      await tx.subscription.create({ data: { organizationId: created.id, plan: "FREE", status: "ACTIVE" } });
      await tx.session.update({ where: { id: session.id }, data: { activeOrganizationId: created.id } });
      await audit(tx, request, { organizationId: created.id, actorId: user.id, action: "organization.created", targetType: "organization", targetId: created.id });
      return created;
    });
    return reply.status(201).send(await toOrganizationDTO(app, org.id));
  });

  app.post("/:id/switch", async (request) => {
    const { user, session } = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const membership = await app.db.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: id, userId: user.id } },
    });
    if (!membership) throw errors.forbidden("You are not a member of this organization");
    await app.db.session.update({ where: { id: session.id }, data: { activeOrganizationId: id } });
    return loadSessionDTO(app, user, id);
  });

  app.get("/current", async (request) => {
    const ctx = await requireOrg(request, "org:read");
    return toOrganizationDTO(app, ctx.organization.id);
  });

  app.patch("/current", async (request) => {
    const ctx = await requireOrg(request, "org:update");
    const input = parse(updateOrganizationSchema, request.body);
    if (input.slug && input.slug !== ctx.organization.slug) {
      const taken = await app.db.organization.findUnique({ where: { slug: input.slug } });
      if (taken) throw errors.conflict("This organization URL is already taken", "SLUG_TAKEN");
    }
    await app.db.organization.update({ where: { id: ctx.organization.id }, data: input });
    await audit(app.db, request, {
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "organization.updated",
      targetType: "organization",
      targetId: ctx.organization.id,
      metadata: { changes: Object.keys(input) },
    });
    return toOrganizationDTO(app, ctx.organization.id);
  });

  app.delete("/current", async (request, reply) => {
    const ctx = await requireOrg(request, "org:delete");
    const { confirm } = parse(z.object({ confirm: z.string() }), request.body);
    if (confirm !== ctx.organization.slug) throw errors.badRequest("Type the organization URL slug to confirm deletion");
    await app.db.$transaction([
      app.db.session.updateMany({ where: { activeOrganizationId: ctx.organization.id }, data: { activeOrganizationId: null } }),
      app.db.organization.delete({ where: { id: ctx.organization.id } }),
    ]);
    await audit(app.db, request, { actorId: ctx.user.id, action: "organization.deleted", targetType: "organization", targetId: ctx.organization.id, metadata: { slug: ctx.organization.slug } });
    return reply.status(204).send();
  });

  app.get("/current/workspaces", async (request) => {
    const ctx = await requireOrg(request, "org:read");
    return { data: (await toOrganizationDTO(app, ctx.organization.id)).workspaces };
  });

  app.post("/current/workspaces", async (request, reply) => {
    const ctx = await requireOrg(request, "workspaces:manage");
    const input = parse(createWorkspaceSchema, request.body);
    const slug = slugify(input.name);
    const exists = await app.db.workspace.findUnique({ where: { organizationId_slug: { organizationId: ctx.organization.id, slug } } });
    if (exists) throw errors.conflict("A workspace with this name already exists");
    const ws = await app.db.workspace.create({ data: { organizationId: ctx.organization.id, name: input.name, slug } });
    await audit(app.db, request, { organizationId: ctx.organization.id, actorId: ctx.user.id, action: "workspace.created", targetType: "workspace", targetId: ws.id });
    return reply.status(201).send({ id: ws.id, name: ws.name, slug: ws.slug, isDefault: ws.isDefault });
  });
}
