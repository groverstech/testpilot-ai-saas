import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { upsertSecretSchema, type SecretDTO } from "@testpilot/shared";
import { encryptSecret, secretHint } from "@testpilot/shared/crypto";
import { audit } from "../lib/audit";
import { errors, parse } from "../lib/errors";
import { requireOrg } from "../plugins/auth";
import { findProjectOr404 } from "./projects";

/** AAD binds each ciphertext to its project + kind + key, preventing row swapping. */
export const secretAad = (projectId: string, kind: string, key: string) => `project-secret:${projectId}:${kind}:${key}`;

/**
 * Project environment variables and test credentials.
 * Values are write-only: they are encrypted at rest and never returned by any endpoint.
 * The worker decrypts them only inside an isolated test execution (Phase 3+).
 */
export async function secretRoutes(app: FastifyInstance) {
  app.get("/:id/secrets", async (request) => {
    const ctx = await requireOrg(request, "secrets:read-metadata");
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    await findProjectOr404(app, ctx, id);
    const rows = await app.db.projectSecret.findMany({
      where: { projectId: id, organizationId: ctx.organization.id },
      orderBy: [{ kind: "asc" }, { key: "asc" }],
    });
    const data: SecretDTO[] = rows.map((s) => ({
      id: s.id,
      kind: s.kind,
      key: s.key,
      hint: s.hint,
      description: s.description,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));
    return { data };
  });

  app.put("/:id/secrets", async (request) => {
    const ctx = await requireOrg(request, "secrets:manage");
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const input = parse(upsertSecretSchema, request.body);
    await findProjectOr404(app, ctx, id);

    const count = await app.db.projectSecret.count({ where: { projectId: id } });
    if (count >= 200) throw errors.conflict("A project can have at most 200 secrets");

    const encryptedValue = encryptSecret(input.value, app.config.keyRing, secretAad(id, input.kind, input.key));
    const hint = input.kind === "ENV_VAR" ? secretHint(input.value) : null;
    const row = await app.db.projectSecret.upsert({
      where: { projectId_kind_key: { projectId: id, kind: input.kind, key: input.key } },
      create: {
        organizationId: ctx.organization.id,
        projectId: id,
        kind: input.kind,
        key: input.key,
        encryptedValue,
        hint,
        description: input.description ?? null,
      },
      update: { encryptedValue, hint, description: input.description ?? null },
    });
    await audit(app.db, request, {
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "project.secret_upserted",
      targetType: "project",
      targetId: id,
      metadata: { kind: input.kind, key: input.key },
    });
    return {
      id: row.id,
      kind: row.kind,
      key: row.key,
      hint: row.hint,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    } satisfies SecretDTO;
  });

  app.delete("/:id/secrets/:secretId", async (request, reply) => {
    const ctx = await requireOrg(request, "secrets:manage");
    const { id, secretId } = parse(z.object({ id: z.string().uuid(), secretId: z.string().uuid() }), request.params);
    await findProjectOr404(app, ctx, id);
    const result = await app.db.projectSecret.deleteMany({ where: { id: secretId, projectId: id, organizationId: ctx.organization.id } });
    if (result.count === 0) throw errors.notFound("Secret");
    await audit(app.db, request, {
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "project.secret_deleted",
      targetType: "project",
      targetId: id,
      metadata: { secretId },
    });
    return reply.status(204).send();
  });
}
