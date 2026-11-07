import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { canManageRole, inviteMemberSchema, ROLE_LABELS, type InvitationDTO, type Role } from "@testpilot/shared";
import { generateToken, hashToken } from "@testpilot/shared/crypto";
import { audit } from "../lib/audit";
import { ApiError, errors, parse } from "../lib/errors";
import { emailLayout } from "../lib/mailer";
import { authRateLimit } from "../lib/rate-limit";
import { requireOrg, requireUser } from "../plugins/auth";
import { loadSessionDTO } from "./auth";
import { getOrgPlanLimits } from "./billing";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const tokenParams = z.object({ token: z.string().min(20).max(200) });

export async function invitationRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const ctx = await requireOrg(request, "members:read");
    // Expire stale invitations lazily.
    await app.db.invitation.updateMany({
      where: { organizationId: ctx.organization.id, status: "PENDING", expiresAt: { lt: new Date() } },
      data: { status: "EXPIRED" },
    });
    const invitations = await app.db.invitation.findMany({
      where: { organizationId: ctx.organization.id, status: "PENDING" },
      include: { invitedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    const data: InvitationDTO[] = invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role as Role,
      status: i.status,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
      invitedBy: i.invitedBy,
    }));
    return { data };
  });

  app.post("/", { config: authRateLimit(app.config, 20) }, async (request, reply) => {
    const ctx = await requireOrg(request, "members:invite");
    const input = parse(inviteMemberSchema, request.body);
    if (!ctx.user.emailVerifiedAt) {
      throw new ApiError(403, "EMAIL_NOT_VERIFIED", "Verify your email address before inviting team members");
    }
    if (!canManageRole(ctx.role, input.role)) throw errors.forbidden("You cannot invite members with this role");

    const alreadyMember = await app.db.organizationMember.findFirst({
      where: { organizationId: ctx.organization.id, user: { email: input.email } },
    });
    if (alreadyMember) throw errors.conflict("This person is already a member", "ALREADY_MEMBER");

    const limits = await getOrgPlanLimits(app, ctx.organization.id);
    if (limits.members !== null) {
      const [members, pending] = await Promise.all([
        app.db.organizationMember.count({ where: { organizationId: ctx.organization.id } }),
        app.db.invitation.count({ where: { organizationId: ctx.organization.id, status: "PENDING", expiresAt: { gt: new Date() } } }),
      ]);
      if (members + pending >= limits.members) {
        throw errors.planLimit(`Your plan allows up to ${limits.members} members. Upgrade to invite more.`);
      }
    }

    const token = generateToken();
    const invitation = await app.db.$transaction(async (tx) => {
      await tx.invitation.updateMany({
        where: { organizationId: ctx.organization.id, email: input.email, status: "PENDING" },
        data: { status: "REVOKED" },
      });
      return tx.invitation.create({
        data: {
          organizationId: ctx.organization.id,
          email: input.email,
          role: input.role,
          tokenHash: hashToken(token),
          invitedById: ctx.user.id,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
      });
    });

    const url = `${app.config.env.WEB_URL}/invite/${encodeURIComponent(token)}`;
    const { text, html } = emailLayout(
      `Join ${ctx.organization.name} on TestPilot AI`,
      `${ctx.user.name} invited you to join ${ctx.organization.name} as ${ROLE_LABELS[input.role]}. This invitation expires in 7 days.`,
      { label: "Accept invitation", url },
    );
    await app.mailer.send({ to: input.email, subject: `Invitation to ${ctx.organization.name}`, text, html }).catch((err) =>
      request.log.error({ err }, "failed to send invitation email"),
    );
    await audit(app.db, request, {
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "invitation.created",
      targetType: "invitation",
      targetId: invitation.id,
      metadata: { email: input.email, role: input.role },
    });
    return reply.status(201).send({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
      invitedBy: { id: ctx.user.id, name: ctx.user.name },
    } satisfies InvitationDTO);
  });

  app.delete("/:id", async (request, reply) => {
    const ctx = await requireOrg(request, "members:invite");
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const result = await app.db.invitation.updateMany({
      where: { id, organizationId: ctx.organization.id, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    if (result.count === 0) throw errors.notFound("Invitation");
    await audit(app.db, request, { organizationId: ctx.organization.id, actorId: ctx.user.id, action: "invitation.revoked", targetType: "invitation", targetId: id });
    return reply.status(204).send();
  });

  /** Public preview so the invite page can show who is inviting (no auth; token is the secret). */
  app.get("/token/:token", { config: authRateLimit(app.config, 30) }, async (request) => {
    const { token } = parse(tokenParams, request.params);
    const inv = await app.db.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { organization: { select: { name: true } }, invitedBy: { select: { name: true } } },
    });
    if (!inv || inv.status !== "PENDING" || inv.expiresAt < new Date()) {
      throw new ApiError(404, "INVITATION_INVALID", "This invitation is invalid or has expired");
    }
    return { email: inv.email, role: inv.role, organizationName: inv.organization.name, invitedBy: inv.invitedBy.name, expiresAt: inv.expiresAt.toISOString() };
  });

  app.post("/token/:token/accept", { config: authRateLimit(app.config, 10) }, async (request) => {
    const { user, session } = requireUser(request);
    const { token } = parse(tokenParams, request.params);
    const inv = await app.db.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!inv || inv.status !== "PENDING" || inv.expiresAt < new Date()) {
      throw new ApiError(404, "INVITATION_INVALID", "This invitation is invalid or has expired");
    }
    if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ApiError(403, "INVITATION_EMAIL_MISMATCH", `This invitation was sent to ${inv.email}. Sign in with that account to accept it.`);
    }
    await app.db.$transaction(async (tx) => {
      const existing = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: inv.organizationId, userId: user.id } },
      });
      if (!existing) {
        await tx.organizationMember.create({ data: { organizationId: inv.organizationId, userId: user.id, role: inv.role } });
      }
      await tx.invitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      // Accepting an emailed invitation proves control of the address.
      if (!user.emailVerifiedAt) await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await tx.session.update({ where: { id: session.id }, data: { activeOrganizationId: inv.organizationId } });
      await audit(tx, request, { organizationId: inv.organizationId, actorId: user.id, action: "invitation.accepted", targetType: "invitation", targetId: inv.id });
    });
    const fresh = await app.db.user.findUniqueOrThrow({ where: { id: user.id } });
    return loadSessionDTO(app, fresh, inv.organizationId);
  });
}
