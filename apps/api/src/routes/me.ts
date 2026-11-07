import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { changePasswordSchema, updateProfileSchema } from "@testpilot/shared";
import { hashPassword, verifyPassword } from "@testpilot/shared/password";
import { audit } from "../lib/audit";
import { ApiError, errors, parse } from "../lib/errors";
import { toUserDTO } from "../lib/serializers";
import { requireUser } from "../plugins/auth";

export async function meRoutes(app: FastifyInstance) {
  app.get("/", async (request) => toUserDTO(requireUser(request).user));

  app.patch("/", async (request) => {
    const { user } = requireUser(request);
    const input = parse(updateProfileSchema, request.body);
    const updated = await app.db.user.update({ where: { id: user.id }, data: { name: input.name } });
    await audit(app.db, request, { actorId: user.id, action: "user.profile_updated" });
    return toUserDTO(updated);
  });

  app.post("/password", async (request) => {
    const { user, session } = requireUser(request);
    const input = parse(changePasswordSchema, request.body);
    if (!user.passwordHash || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new ApiError(400, "INVALID_PASSWORD", "Current password is incorrect");
    }
    await app.db.$transaction([
      app.db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(input.newPassword) } }),
      // Keep the current session; sign out everywhere else.
      app.db.session.deleteMany({ where: { userId: user.id, id: { not: session.id } } }),
    ]);
    await audit(app.db, request, { actorId: user.id, action: "user.password_changed" });
    return { changed: true };
  });

  app.get("/sessions", async (request) => {
    const { user, session } = requireUser(request);
    const sessions = await app.db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
    });
    return {
      data: sessions.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        lastSeenAt: s.lastSeenAt.toISOString(),
        createdAt: s.createdAt.toISOString(),
        current: s.id === session.id,
      })),
    };
  });

  app.delete("/sessions/:id", async (request, reply) => {
    const { user } = requireUser(request);
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const result = await app.db.session.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) throw errors.notFound("Session");
    await audit(app.db, request, { actorId: user.id, action: "user.session_revoked", targetType: "session", targetId: id });
    return reply.status(204).send();
  });
}
