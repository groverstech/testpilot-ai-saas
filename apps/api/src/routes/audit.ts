import type { FastifyInstance } from "fastify";
import { paginationSchema, type AuditLogDTO } from "@testpilot/shared";
import { parse } from "../lib/errors";
import { paginate } from "../lib/serializers";
import { requireOrg } from "../plugins/auth";

export async function auditRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const ctx = await requireOrg(request, "audit:read");
    const q = parse(paginationSchema, request.query);
    const where = { organizationId: ctx.organization.id };
    const [total, rows] = await Promise.all([
      app.db.auditLog.count({ where }),
      app.db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { id: true, name: true } } },
      }),
    ]);
    const data: AuditLogDTO[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      actor: r.actor,
      createdAt: r.createdAt.toISOString(),
      metadata: r.metadata,
    }));
    return { data, pagination: paginate(q.page, q.pageSize, total) };
  });
}
