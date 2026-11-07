import type { FastifyInstance } from "fastify";
import type { User } from "@testpilot/database";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, tokenSchema } from "@testpilot/shared";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "@testpilot/shared/password";
import { generateToken, hashToken } from "@testpilot/shared/crypto";
import { authRateLimit } from "../lib/rate-limit";
import { audit } from "../lib/audit";
import { ApiError, errors, parse } from "../lib/errors";
import { emailLayout } from "../lib/mailer";
import { toSessionDTO } from "../lib/serializers";
import { clearSessionCookie, requireUser, SESSION_COOKIE, startSession } from "../plugins/auth";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export async function sendVerificationEmail(app: FastifyInstance, user: User) {
  const token = generateToken();
  await app.db.$transaction([
    app.db.userToken.deleteMany({ where: { userId: user.id, purpose: "EMAIL_VERIFICATION", consumedAt: null } }),
    app.db.userToken.create({
      data: { userId: user.id, purpose: "EMAIL_VERIFICATION", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
    }),
  ]);
  const url = `${app.config.env.WEB_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const { text, html } = emailLayout(
    "Verify your email address",
    `Hi ${user.name}, confirm your email address to finish setting up your TestPilot AI account. This link expires in 24 hours.`,
    { label: "Verify email", url },
  );
  await app.mailer.send({ to: user.email, subject: "Verify your TestPilot AI email", text, html });
}

export async function loadSessionDTO(app: FastifyInstance, user: User, activeOrganizationId: string | null) {
  const memberships = await app.db.organizationMember.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
  return toSessionDTO(user, memberships, activeOrganizationId);
}

export async function authRoutes(app: FastifyInstance) {
  const strict = authRateLimit(app.config, 10);

  app.post("/register", { config: authRateLimit(app.config, 5) }, async (request, reply) => {
    const input = parse(registerSchema, request.body);
    const existing = await app.db.user.findUnique({ where: { email: input.email } });
    if (existing) throw errors.conflict("An account with this email already exists", "EMAIL_TAKEN");

    const user = await app.db.user.create({
      data: { email: input.email, name: input.name, passwordHash: await hashPassword(input.password) },
    });
    await audit(app.db, request, { actorId: user.id, action: "user.registered", targetType: "user", targetId: user.id });
    await sendVerificationEmail(app, user).catch((err) => request.log.error({ err }, "failed to send verification email"));
    const session = await startSession(app, request, reply, user, null);
    return reply.status(201).send(await loadSessionDTO(app, user, session.activeOrganizationId));
  });

  app.post("/login", { config: strict }, async (request, reply) => {
    const input = parse(loginSchema, request.body);
    const user = await app.db.user.findUnique({ where: { email: input.email } });
    // Always run a hash comparison so response time does not reveal whether the email exists.
    const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !user.passwordHash || !ok) {
      await audit(app.db, request, { actorId: user?.id ?? null, action: "auth.login_failed", metadata: { email: input.email } });
      throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password");
    }
    const session = await startSession(app, request, reply, user);
    await audit(app.db, request, { actorId: user.id, action: "auth.login", targetType: "session", targetId: session.id });
    return reply.send(await loadSessionDTO(app, user, session.activeOrganizationId));
  });

  app.post("/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await app.db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    if (request.auth) await audit(app.db, request, { actorId: request.auth.user.id, action: "auth.logout" });
    clearSessionCookie(app, reply);
    return reply.status(204).send();
  });

  app.get("/session", async (request) => {
    const { user, session } = requireUser(request);
    return loadSessionDTO(app, user, session.activeOrganizationId);
  });

  app.post("/verify-email", { config: strict }, async (request) => {
    const { token } = parse(tokenSchema, request.body);
    const row = await app.db.userToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.purpose !== "EMAIL_VERIFICATION" || row.consumedAt || row.expiresAt < new Date()) {
      throw new ApiError(400, "INVALID_TOKEN", "This verification link is invalid or has expired");
    }
    await app.db.$transaction([
      app.db.userToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
      app.db.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
    ]);
    await audit(app.db, request, { actorId: row.userId, action: "user.email_verified", targetType: "user", targetId: row.userId });
    return { verified: true };
  });

  app.post("/resend-verification", { config: authRateLimit(app.config, 3) }, async (request) => {
    const { user } = requireUser(request);
    if (user.emailVerifiedAt) return { sent: false, alreadyVerified: true };
    await sendVerificationEmail(app, user);
    return { sent: true };
  });

  app.post("/forgot-password", { config: authRateLimit(app.config, 5) }, async (request, reply) => {
    const { email } = parse(forgotPasswordSchema, request.body);
    const user = await app.db.user.findUnique({ where: { email } });
    if (user) {
      const token = generateToken();
      await app.db.$transaction([
        app.db.userToken.deleteMany({ where: { userId: user.id, purpose: "PASSWORD_RESET", consumedAt: null } }),
        app.db.userToken.create({
          data: { userId: user.id, purpose: "PASSWORD_RESET", tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
        }),
      ]);
      const url = `${app.config.env.WEB_URL}/reset-password?token=${encodeURIComponent(token)}`;
      const { text, html } = emailLayout(
        "Reset your password",
        "Someone requested a password reset for your TestPilot AI account. If this was you, use the link below. It expires in 1 hour. If not, you can ignore this email.",
        { label: "Reset password", url },
      );
      await app.mailer.send({ to: user.email, subject: "Reset your TestPilot AI password", text, html }).catch((err) =>
        request.log.error({ err }, "failed to send reset email"),
      );
      await audit(app.db, request, { actorId: user.id, action: "auth.password_reset_requested" });
    }
    // Same response whether or not the account exists (prevents account enumeration).
    return reply.status(202).send({ accepted: true });
  });

  app.post("/reset-password", { config: strict }, async (request) => {
    const { token, password } = parse(resetPasswordSchema, request.body);
    const row = await app.db.userToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!row || row.purpose !== "PASSWORD_RESET" || row.consumedAt || row.expiresAt < new Date()) {
      throw new ApiError(400, "INVALID_TOKEN", "This reset link is invalid or has expired");
    }
    const passwordHash = await hashPassword(password);
    await app.db.$transaction([
      app.db.userToken.update({ where: { id: row.id }, data: { consumedAt: new Date() } }),
      // Possession of the reset link proves control of the inbox, so also mark email verified.
      app.db.user.update({ where: { id: row.userId }, data: { passwordHash, emailVerifiedAt: new Date() } }),
      // Revoke every existing session.
      app.db.session.deleteMany({ where: { userId: row.userId } }),
    ]);
    await audit(app.db, request, { actorId: row.userId, action: "auth.password_reset" });
    return { reset: true };
  });

  /** GitHub sign-in (OAuth). Implemented in Phase 2; reports configuration status until then. */
  app.get("/github", async () => {
    const missing = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"].filter((k) => !app.config.env[k as "GITHUB_CLIENT_ID"]);
    if (missing.length) throw errors.notConfigured("GitHub OAuth", missing);
    throw errors.notImplemented("GitHub sign-in is scheduled for Phase 2");
  });
}
