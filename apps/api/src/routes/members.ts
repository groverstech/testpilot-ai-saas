import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { canManageRole, updateMemberSchema, type MemberDTO, type Role } from "@testpilot/shared";
import { audit } from "../lib/audit";
import { ApiError, errors, parse } from "../lib/errors";
import { requireOrg } from "../plugins/auth";

const idParams = z.object({ id: z.string().uuid() });

export async function memberRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const ctx = await requireOrg(request, "members:read");
    const members = await app.db.organizationMember.findMany({
      where: { organizationId: ctx.organization.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    const data: MemberDTO[] = members.map((m) => ({
      id: m.id,
      role: m.role as Role,
      joinedAt: m.createdAt.toISOString(),
      user: m.user,
    }));
    return { data };
  });

  app.patch("/:id", async (request) => {
    const ctx = await requireOrg(request, "members:update");
    const { id } = parse(idParams, request.params);
    const { role } = parse(updateMemberSchema, request.body);
    const member = await app.db.organizationMember.findFirst({ where: { id, organizationId: ctx.organization.id } });
    if (!member) throw errors.notFound("Member");
    if (!canManageRole(ctx.role, role, member.role as Role)) throw errors.forbidden("You cannot assign this role");
    if (member.role === "OWNER" && role !== "OWNER") await assertNotLastOwner(app, ctx.organization.id);

    const updated = await app.db.organizationMember.update({ where: { id }, data: { role } });
    await audit(app.db, request, {
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "member.role_changed",
      targetType: "member",
      targetId: id,
      metadata: { from: member.role, to: role, userId: member.userId },
    });
    return { id: updated.id, role: updated.role };
  });

  app.delete("/:id", async (request, reply) => {
    const ctx = await requireOrg(request);
    const { id } = parse(idParams, request.params);
    const member = await app.db.organizationMember.findFirst({ where: { id, organizationId: ctx.organization.id } });
    if (!member) throw errors.notFound("Member");
    const isSelf = member.userId === ctx.user.id;
    // Anyone may leave; removing others requires permission and sufficient rank.
    if (!isSelf && !canManageRole(ctx.role, member.role as Role, member.role as Role)) throw errors.forbidden();
    if (member.role === "OWNER") await assertNotLastOwner(app, ctx.organization.id);

    await app.db.$transaction([
      app.db.organizationMember.delete({ where: { id } }),
      app.db.session.updateMany({
        where: { userId: member.userId, activeOrganizationId: ctx.organization.id },
        data: { activeOrganizationId: null },
      }),
    ]);
    await audit(app.db, request, {
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: isSelf ? "member.left" : "member.removed",
      targetType: "member",
      targetId: id,
      metadata: { userId: member.userId },
    });
    return reply.status(204).send();
  });
}

async function assertNotLastOwner(app: FastifyInstance, organizationId: string) {
  const owners = await app.db.organizationMember.count({ where: { organizationId, role: "OWNER" } });
  if (owners <= 1) throw new ApiError(409, "LAST_OWNER", "An organization must have at least one owner");
}
