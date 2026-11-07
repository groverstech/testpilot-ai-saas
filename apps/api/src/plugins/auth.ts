import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Organization, OrganizationMember, Session, User } from "@testpilot/database";
import { can, type Permission, type Role } from "@testpilot/shared";
import { generateToken, hashToken } from "@testpilot/shared/crypto";
import { ApiError, errors } from "../lib/errors";

export const SESSION_COOKIE = "tp_session";
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface AuthContext {
  user: User;
  session: Session;
}

export interface OrgContext extends AuthContext {
  organization: Organization;
  membership: OrganizationMember;
  role: Role;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export function registerAuth(app: FastifyInstance) {
  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token || token.length > 200) return;
    const session = await app.db.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session) return;
    if (session.expiresAt.getTime() <= Date.now()) {
      await app.db.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return;
    }
    const { user, ...sessionRow } = session;
    request.auth = { user, session: sessionRow };
    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await app.db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
    }
  });
}

/** Creates a session row and sets the httpOnly cookie. Returns the session. */
export async function startSession(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  user: User,
  activeOrganizationId?: string | null,
): Promise<Session> {
  const token = generateToken(32);
  const ttlMs = app.config.env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
  let orgId = activeOrganizationId ?? null;
  if (orgId === null) {
    const first = await app.db.organizationMember.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { organizationId: true },
    });
    orgId = first?.organizationId ?? null;
  }
  const session = await app.db.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      activeOrganizationId: orgId,
      userAgent: request.headers["user-agent"]?.slice(0, 300),
      ipAddress: request.ip,
      expiresAt: new Date(Date.now() + ttlMs),
    },
  });
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: app.config.env.COOKIE_SECURE,
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
  request.auth = { user, session };
  return session;
}

export function clearSessionCookie(app: FastifyInstance, reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure: app.config.env.COOKIE_SECURE });
}

export function requireUser(request: FastifyRequest): AuthContext {
  if (!request.auth) throw errors.unauthorized();
  return request.auth;
}

/**
 * Resolves the tenant for this request and enforces membership (and optionally a permission).
 * The tenant is the `x-organization-id` header if present, else the session's active org.
 * Membership is re-checked on every request, so removing a member takes effect immediately.
 */
export async function requireOrg(request: FastifyRequest, permission?: Permission): Promise<OrgContext> {
  const auth = requireUser(request);
  const header = request.headers["x-organization-id"];
  const orgId = (typeof header === "string" && header) || auth.session.activeOrganizationId;
  if (!orgId) throw new ApiError(403, "NO_ACTIVE_ORGANIZATION", "Create or select an organization first");
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw errors.badRequest("Invalid organization id");

  const membership = await request.server.db.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: auth.user.id } },
    include: { organization: true },
  });
  if (!membership) {
    // Do not reveal whether the organization exists.
    throw errors.forbidden("You are not a member of this organization");
  }
  const role = membership.role as Role;
  if (permission && !can(role, permission)) throw errors.forbidden();
  const { organization, ...member } = membership;
  return { ...auth, organization, membership: member, role };
}

export function assertPermission(ctx: OrgContext, permission: Permission) {
  if (!can(ctx.role, permission)) throw errors.forbidden();
}
