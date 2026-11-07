import type { FastifyRequest } from "fastify";
import type { Prisma, PrismaClient } from "@testpilot/database";
import { redact } from "@testpilot/shared";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/** Records an audit event. Metadata is always passed through redaction first. */
export async function audit(db: Db, request: FastifyRequest | null, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: entry.organizationId ?? null,
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ? (redact(entry.metadata) as Prisma.InputJsonValue) : undefined,
      ipAddress: request?.ip,
    },
  });
}
