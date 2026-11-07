import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, resetDatabase, signUp, testDb, TEST_ENCRYPTION_KEYS } from "@testpilot/testing";
import { decryptSecret, parseKeyRing } from "@testpilot/shared/crypto";

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase();
});

describe("project management", () => {
  it("creates, reads, lists, updates, archives, restores and deletes a project", async () => {
    const { client } = await signUp(app, { name: "Owner" });
    const created = await client.post("/projects", {
      name: "Customer Portal",
      description: "Self-service portal",
      appUrl: "https://staging.example.com",
      defaultBranch: "main",
    });
    expect(created.status).toBe(201);
    const p = created.body;
    expect(p).toMatchObject({ name: "Customer Portal", slug: "customer-portal", status: "ACTIVE", workspace: { name: "General" }, repository: null });
    expect(p.stats).toEqual({ testRuns: 0, testCases: 0, openBugs: 0, lastRunAt: null });
    expect(p.testSettings.viewports).toEqual(["desktop", "mobile-390"]);

    expect((await client.get(`/projects/${p.id}`)).body.name).toBe("Customer Portal");
    const list = await client.get("/projects");
    expect(list.body.pagination.total).toBe(1);

    const upd = await client.patch(`/projects/${p.id}`, { name: "Portal v2", testSettings: { viewports: ["tablet"], maxPages: 50 } });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ name: "Portal v2", slug: "portal-v2" });
    expect(upd.body.testSettings).toMatchObject({ viewports: ["tablet"], maxPages: 50, recordVideo: true });

    // Cannot delete an active project.
    const del1 = await client.delete(`/projects/${p.id}`);
    expect(del1.status).toBe(409);
    expect(del1.body.error.code).toBe("PROJECT_NOT_ARCHIVED");

    const archived = await client.patch(`/projects/${p.id}`, { status: "ARCHIVED" });
    expect(archived.body.status).toBe("ARCHIVED");
    expect(archived.body.archivedAt).toBeTruthy();
    expect((await client.get("/projects")).body.data).toHaveLength(0);
    expect((await client.get("/projects?status=ARCHIVED")).body.data).toHaveLength(1);

    expect((await client.patch(`/projects/${p.id}`, { status: "ACTIVE" })).body.status).toBe("ACTIVE");
    await client.patch(`/projects/${p.id}`, { status: "ARCHIVED" });
    expect((await client.delete(`/projects/${p.id}`)).status).toBe(204);
    expect((await client.get(`/projects/${p.id}`)).status).toBe(404);

    const actions = (await testDb().auditLog.findMany({ where: { targetId: p.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["project.created", "project.updated", "project.archived", "project.restored", "project.archived", "project.deleted"]);
  });

  it("searches and paginates", async () => {
    const { client } = await signUp(app);
    await testDb().subscription.updateMany({ data: { plan: "TEAM" } });
    for (const name of ["Alpha web", "Beta web", "Gamma api"]) await client.post("/projects", { name });
    expect((await client.get("/projects?search=web")).body.data).toHaveLength(2);
    const page = await client.get("/projects?pageSize=2&page=2");
    expect(page.body.data).toHaveLength(1);
    expect(page.body.pagination).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
  });

  it("enforces the plan's active project limit (Free = 2) and frees a slot on archive", async () => {
    const { client } = await signUp(app);
    const a = await client.post("/projects", { name: "One" });
    await client.post("/projects", { name: "Two" });
    const third = await client.post("/projects", { name: "Three" });
    expect(third.status).toBe(402);
    expect(third.body.error.code).toBe("PLAN_LIMIT_REACHED");
    await client.patch(`/projects/${a.body.id}`, { status: "ARCHIVED" });
    expect((await client.post("/projects", { name: "Three" })).status).toBe(201);
    // Restoring would exceed the limit again.
    expect((await client.patch(`/projects/${a.body.id}`, { status: "ACTIVE" })).status).toBe(402);
  });

  it("rejects application URLs that target private networks (SSRF)", async () => {
    const { client } = await signUp(app);
    for (const appUrl of [
      "http://localhost:3000",
      "http://127.0.0.1:8080",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5",
      "https://internal.example.com",
      "https://rebind.example.com",
    ]) {
      const res = await client.post("/projects", { name: "SSRF", appUrl });
      expect(res.status, appUrl).toBe(422);
      expect(res.body.error.details[0].path).toBe("appUrl");
    }
    expect((await client.post("/projects", { name: "Public", appUrl: "https://example.com" })).status).toBe(201);
  });

  it("allows private URLs when ALLOW_PRIVATE_APP_URLS is enabled (local development)", async () => {
    const devApp = await createTestApp({ ALLOW_PRIVATE_APP_URLS: "true" });
    try {
      const { client } = await signUp(devApp);
      expect((await client.post("/projects", { name: "Local", appUrl: "http://localhost:5173" })).status).toBe(201);
    } finally {
      await devApp.close();
    }
  });
});

describe("project secrets", () => {
  it("encrypts values at rest and never returns them", async () => {
    const { client, organization } = await signUp(app);
    const p = (await client.post("/projects", { name: "Secrets" })).body;
    const value = "sk_live_super_secret_value_123456";
    const put = await client.put(`/projects/${p.id}/secrets`, { kind: "ENV_VAR", key: "PAYMENT_KEY", value, description: "Stripe" });
    expect(put.status).toBe(200);
    expect(JSON.stringify(put.body)).not.toContain(value);
    expect(put.body.hint).toBe("…3456");

    const list = await client.get(`/projects/${p.id}/secrets`);
    expect(list.body.data).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain("secret_value");

    const row = await testDb().projectSecret.findFirstOrThrow({ where: { projectId: p.id } });
    expect(row.encryptedValue).not.toContain(value);
    expect(row.organizationId).toBe(organization!.id);
    expect(decryptSecret(row.encryptedValue, parseKeyRing(TEST_ENCRYPTION_KEYS), `project-secret:${p.id}:ENV_VAR:PAYMENT_KEY`)).toBe(value);

    // Audit metadata never contains the value
    const audits = await testDb().auditLog.findMany({ where: { action: "project.secret_upserted" } });
    expect(JSON.stringify(audits)).not.toContain(value);
  });

  it("upserts by key, stores credentials without hints, and deletes", async () => {
    const { client } = await signUp(app);
    const p = (await client.post("/projects", { name: "Creds" })).body;
    await client.put(`/projects/${p.id}/secrets`, { kind: "ENV_VAR", key: "API_URL", value: "https://a" });
    await client.put(`/projects/${p.id}/secrets`, { kind: "ENV_VAR", key: "API_URL", value: "https://b" });
    const cred = await client.put(`/projects/${p.id}/secrets`, { kind: "TEST_CREDENTIAL", key: "Admin user", value: "admin@example.com:a-long-password" });
    expect(cred.body.hint).toBeNull();
    const list = (await client.get(`/projects/${p.id}/secrets`)).body.data;
    expect(list).toHaveLength(2);
    expect((await client.delete(`/projects/${p.id}/secrets/${cred.body.id}`)).status).toBe(204);
    expect((await client.get(`/projects/${p.id}/secrets`)).body.data).toHaveLength(1);
  });

  it("rejects reserved environment variable names", async () => {
    const { client } = await signUp(app);
    const p = (await client.post("/projects", { name: "Env" })).body;
    expect((await client.put(`/projects/${p.id}/secrets`, { kind: "ENV_VAR", key: "NODE_OPTIONS", value: "--require x" })).status).toBe(422);
  });
});

describe("dashboard & not-yet-available features", () => {
  it("reports real zeros for a new organization (no fabricated data)", async () => {
    const { client } = await signUp(app);
    const d = (await client.get("/dashboard")).body;
    expect(d.totals).toEqual({ projects: 0, testRuns: 0, passedTests: 0, failedTests: 0, blockedTests: 0, successRate: null, openBugs: 0, criticalBugs: 0 });
    expect(d.recentRuns).toEqual([]);
    expect(d.trend).toEqual([]);
  });

  it("computes dashboard figures from persisted test runs", async () => {
    const { client, organization, userId } = await signUp(app);
    const p = (await client.post("/projects", { name: "Measured" })).body;
    await testDb().testRun.create({
      data: { organizationId: organization!.id, projectId: p.id, number: 1, status: "FAILED", triggeredById: userId, totalTests: 10, passedTests: 8, failedTests: 2 },
    });
    const d = (await client.get("/dashboard")).body;
    expect(d.totals).toMatchObject({ projects: 1, testRuns: 1, passedTests: 8, failedTests: 2, successRate: 80 });
    expect(d.projectQuality[0]).toMatchObject({ name: "Measured", score: 80 });
    expect(d.trend.reduce((a: number, t: { passed: number }) => a + t.passed, 0)).toBe(8);
  });

  it("refuses to start test runs until the execution engine exists, creating nothing", async () => {
    const { client } = await signUp(app);
    const p = (await client.post("/projects", { name: "Run me" })).body;
    const res = await client.post("/test-runs", { projectId: p.id });
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe("EXECUTION_ENGINE_UNAVAILABLE");
    expect(await testDb().testRun.count()).toBe(0);
    expect((await client.get("/test-runs")).body.data).toEqual([]);
  });

  it("reports GitHub and Stripe as not configured with the missing variable names", async () => {
    const { client } = await signUp(app);
    const gh = await client.post("/github/connect");
    expect(gh.status).toBe(503);
    expect(gh.body.error).toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED" });
    expect(gh.body.error.details.missing).toContain("GITHUB_APP_ID");
    const checkout = await client.post("/billing/checkout", { plan: "PRO" });
    expect(checkout.status).toBe(503);
    const integrations = (await client.get("/integrations")).body.data;
    expect(integrations.find((i: { id: string }) => i.id === "github")).toMatchObject({ configured: false, connected: false });
  });

  it("reports billing plan, limits and real usage", async () => {
    const { client } = await signUp(app);
    await client.post("/projects", { name: "Counted" });
    const b = (await client.get("/billing")).body;
    expect(b.tier).toBe("FREE");
    expect(b.usage).toEqual({ projects: 1, members: 1, testRunsThisMonth: 0 });
    expect(b.provider.configured).toBe(false);
  });
});
