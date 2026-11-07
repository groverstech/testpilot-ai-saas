import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@testpilot/database";
import { createTestRunSchema, paginationSchema } from "@testpilot/shared";
import { ApiError, errors, parse } from "../lib/errors";
import { paginate } from "../lib/serializers";
import { requireOrg } from "../plugins/auth";
import { findProjectOr404 } from "./projects";

const idParams = z.object({ id: z.string().uuid() });
const projectFilter = paginationSchema.extend({ projectId: z.string().uuid().optional() });

/**
 * Test runs, cases, bugs and reports. Reads are fully implemented against the database
 * (and return empty lists until the execution engine produces data). Creating a run returns
 * 501 until the Phase 3/4 execution pipeline exists — no run is fabricated.
 */
export async function testingRoutes(app: FastifyInstance) {
  app.get("/test-runs", async (request) => {
    const ctx = await requireOrg(request, "testruns:read");
    const q = parse(projectFilter.extend({ status: z.string().optional() }), request.query);
    const where: Prisma.TestRunWhereInput = {
      organizationId: ctx.organization.id,
      ...(q.projectId ? { projectId: q.projectId } : {}),
    };
    const [total, rows] = await Promise.all([
      app.db.testRun.count({ where }),
      app.db.testRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { project: { select: { id: true, name: true } } },
      }),
    ]);
    return { data: rows, pagination: paginate(q.page, q.pageSize, total) };
  });

  app.post("/test-runs", async (request) => {
    const ctx = await requireOrg(request, "testruns:create");
    const input = parse(createTestRunSchema, request.body);
    const project = await findProjectOr404(app, ctx, input.projectId);
    if (project.status === "ARCHIVED") throw errors.conflict("Archived projects cannot be tested", "PROJECT_ARCHIVED");
    throw new ApiError(
      501,
      "EXECUTION_ENGINE_UNAVAILABLE",
      "Automated test execution is not available yet (planned for Phases 3–4). No test run was created.",
    );
  });

  app.get("/test-runs/:id", async (request) => {
    const ctx = await requireOrg(request, "testruns:read");
    const { id } = parse(idParams, request.params);
    const run = await app.db.testRun.findFirst({
      where: { id, organizationId: ctx.organization.id },
      include: { project: { select: { id: true, name: true } }, agentExecutions: true },
    });
    if (!run) throw errors.notFound("Test run");
    return run;
  });

  app.post("/test-runs/:id/cancel", async (request) => {
    const ctx = await requireOrg(request, "testruns:cancel");
    const { id } = parse(idParams, request.params);
    const run = await app.db.testRun.findFirst({ where: { id, organizationId: ctx.organization.id } });
    if (!run) throw errors.notFound("Test run");
    if (!["QUEUED", "PREPARING", "RUNNING"].includes(run.status)) {
      throw errors.conflict("Only queued or running test runs can be cancelled", "RUN_NOT_ACTIVE");
    }
    const updated = await app.db.testRun.update({ where: { id }, data: { status: "CANCELLED", finishedAt: new Date() } });
    return updated;
  });

  app.post("/test-runs/:id/retry", async (request) => {
    const ctx = await requireOrg(request, "testruns:create");
    const { id } = parse(idParams, request.params);
    const run = await app.db.testRun.findFirst({ where: { id, organizationId: ctx.organization.id } });
    if (!run) throw errors.notFound("Test run");
    throw new ApiError(501, "EXECUTION_ENGINE_UNAVAILABLE", "Retrying runs requires the execution engine (Phase 4).");
  });

  app.get("/test-runs/:id/executions", async (request) => {
    const ctx = await requireOrg(request, "testruns:read");
    const { id } = parse(idParams, request.params);
    const run = await app.db.testRun.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true } });
    if (!run) throw errors.notFound("Test run");
    const data = await app.db.testExecution.findMany({
      where: { testRunId: id },
      include: { testCase: { select: { id: true, key: true, name: true, category: true, priority: true } } },
      orderBy: { createdAt: "asc" },
    });
    return { data };
  });

  app.get("/test-runs/:id/artifacts", async (request) => {
    const ctx = await requireOrg(request, "testruns:read");
    const { id } = parse(idParams, request.params);
    const run = await app.db.testRun.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true } });
    if (!run) throw errors.notFound("Test run");
    const rows = await app.db.artifact.findMany({ where: { testRunId: id, organizationId: ctx.organization.id }, orderBy: { createdAt: "asc" } });
    // Signed, short-lived download URLs are issued by the storage service in Phase 4.
    return { data: rows.map((a) => ({ id: a.id, type: a.type, contentType: a.contentType, sizeBytes: Number(a.sizeBytes), createdAt: a.createdAt })) };
  });

  app.get("/test-cases", async (request) => {
    const ctx = await requireOrg(request, "testruns:read");
    const q = parse(projectFilter, request.query);
    const where: Prisma.TestCaseWhereInput = {
      project: { organizationId: ctx.organization.id },
      ...(q.projectId ? { projectId: q.projectId } : {}),
    };
    const [total, data] = await Promise.all([
      app.db.testCase.count({ where }),
      app.db.testCase.findMany({ where, orderBy: { key: "asc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { data, pagination: paginate(q.page, q.pageSize, total) };
  });

  app.get("/bugs", async (request) => {
    const ctx = await requireOrg(request, "bugs:read");
    const q = parse(projectFilter, request.query);
    const where: Prisma.BugWhereInput = { organizationId: ctx.organization.id, ...(q.projectId ? { projectId: q.projectId } : {}) };
    const [total, data] = await Promise.all([
      app.db.bug.count({ where }),
      app.db.bug.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { data, pagination: paginate(q.page, q.pageSize, total) };
  });

  app.get("/reports", async (request) => {
    const ctx = await requireOrg(request, "reports:read");
    const q = parse(projectFilter, request.query);
    const where: Prisma.ReportWhereInput = { organizationId: ctx.organization.id, ...(q.projectId ? { projectId: q.projectId } : {}) };
    const [total, data] = await Promise.all([
      app.db.report.count({ where }),
      app.db.report.findMany({ where, orderBy: { createdAt: "desc" }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { data, pagination: paginate(q.page, q.pageSize, total) };
  });
}
