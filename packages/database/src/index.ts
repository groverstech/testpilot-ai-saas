import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __testpilotPrisma?: PrismaClient };

/**
 * Create a Prisma client. Prefer the shared `prisma` singleton; this factory exists for
 * tests and workers that need a client bound to a specific DATABASE_URL.
 */
export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient({
    datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

export const prisma: PrismaClient = globalForPrisma.__testpilotPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__testpilotPrisma = prisma;
}
