import type { FastifyInstance } from "fastify";
import type { DashboardDTO } from "@testpilot/shared";
import { requireOrg } from "../plugins/auth";

const TREND_DAYS = 14;

/** All figures are computed from persisted data. A new organization sees zeros / empty arrays. */
export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/", async (request): Promise<DashboardDTO> => {
    const ctx = await requireOrg(request, "projects:read");
    const organizationId = ctx.organization.id;
    const since = new Date(Date.now() - TREND_DAYS * 24 * 60 * 60 * 1000);

    const [projects, testRuns, sums, openBugs, criticalBugs, recentRuns, trendRuns, activeProjects, recentActivity] = await Promise.all([
      app.db.project.count({ where: { organizationId, status: "ACTIVE" } }),
      app.db.testRun.count({ where: { organizationId } }),
      app.db.testRun.aggregate({ where: { organizationId }, _sum: { passedTests: true, failedTests: true, blockedTests: true } }),
      app.db.bug.count({ where: { organizationId, status: { in: ["OPEN", "CONFIRMED", "IN_PROGRESS"] } } }),
      app.db.bug.count({ where: { organizationId, severity: "CRITICAL", status: { in: ["OPEN", "CONFIRMED", "IN_PROGRESS"] } } }),
      app.db.testRun.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { project: { select: { id: true, name: true } } },
      }),
      app.db.testRun.findMany({
        where: { organizationId, createdAt: { gte: since } },
        select: { createdAt: true, passedTests: true, failedTests: true },
      }),
      app.db.project.findMany({
        where: { organizationId, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          testRuns: {
            where: { status: { in: ["PASSED", "FAILED"] } },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { passedTests: true, failedTests: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      app.db.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { actor: { select: { name: true } } },
      }),
    ]);

    const passed = sums._sum.passedTests ?? 0;
    const failed = sums._sum.failedTests ?? 0;
    const blocked = sums._sum.blockedTests ?? 0;

    const buckets = new Map<string, { passed: number; failed: number }>();
    for (let i = TREND_DAYS - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      buckets.set(d, { passed: 0, failed: 0 });
    }
    for (const r of trendRuns) {
      const b = buckets.get(r.createdAt.toISOString().slice(0, 10));
      if (b) {
        b.passed += r.passedTests;
        b.failed += r.failedTests;
      }
    }

    return {
      totals: {
        projects,
        testRuns,
        passedTests: passed,
        failedTests: failed,
        blockedTests: blocked,
        successRate: passed + failed > 0 ? Math.round((passed / (passed + failed)) * 1000) / 10 : null,
        openBugs,
        criticalBugs,
      },
      recentRuns: recentRuns.map((r) => ({
        id: r.id,
        number: r.number,
        status: r.status,
        project: r.project,
        createdAt: r.createdAt.toISOString(),
      })),
      trend: testRuns > 0 ? [...buckets.entries()].map(([date, v]) => ({ date, ...v })) : [],
      projectQuality: activeProjects.map((p) => {
        const pp = p.testRuns.reduce((a, r) => a + r.passedTests, 0);
        const ff = p.testRuns.reduce((a, r) => a + r.failedTests, 0);
        return { id: p.id, name: p.name, score: pp + ff > 0 ? Math.round((pp / (pp + ff)) * 100) : null };
      }),
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        actor: a.actor?.name ?? null,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  });
}
