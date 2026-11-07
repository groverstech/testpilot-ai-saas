import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { Prisma } from "@testpilot/database";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const errors = {
  badRequest: (message: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", message, details),
  unauthorized: (message = "Authentication required") => new ApiError(401, "UNAUTHENTICATED", message),
  forbidden: (message = "You do not have permission to perform this action") =>
    new ApiError(403, "FORBIDDEN", message),
  notFound: (resource = "Resource") => new ApiError(404, "NOT_FOUND", `${resource} not found`),
  conflict: (message: string, code = "CONFLICT") => new ApiError(409, code, message),
  validation: (details: unknown) => new ApiError(422, "VALIDATION_FAILED", "Request validation failed", details),
  planLimit: (message: string) => new ApiError(402, "PLAN_LIMIT_REACHED", message),
  notConfigured: (integration: string, missing: string[]) =>
    new ApiError(503, "INTEGRATION_NOT_CONFIGURED", `${integration} is not configured on this deployment`, {
      missing,
    }),
  notImplemented: (message: string) => new ApiError(501, "NOT_IMPLEMENTED", message),
};

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) throw errors.validation(formatZod(result.error));
  return result.data;
}

export function formatZod(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | ApiError | Error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details, requestId: request.id },
      });
    }
    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: { code: "VALIDATION_FAILED", message: "Request validation failed", details: formatZod(error), requestId: request.id },
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return reply.status(409).send({
        error: { code: "CONFLICT", message: "A record with these values already exists", requestId: request.id },
      });
    }
    const fe = error as FastifyError;
    if (fe.statusCode === 429) {
      return reply.status(429).send({
        error: { code: "RATE_LIMITED", message: "Too many requests, please slow down", requestId: request.id },
      });
    }
    if (fe.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
      return reply.status(fe.statusCode).send({
        error: { code: fe.code ?? "BAD_REQUEST", message: fe.message, requestId: request.id },
      });
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", requestId: request.id },
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found", requestId: request.id } }),
  );
}
