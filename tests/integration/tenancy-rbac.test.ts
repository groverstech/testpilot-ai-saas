import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { addMember, createTestApp, resetDatabase, signUp, testDb, verifyEmail } from "@testpilot/testing";

let app: FastifyInstance;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  await resetDatabase();
  app.mailer.outbox.length = 0;
});

describe("tenant isolation", () => {
  it("never exposes another organization's projects, secrets or data", async () => {
    const alice = await signUp(app, { orgName: "Alice Co" });
    const bob = await signUp(app, { orgName: "Bob Co" });
    const project = (await alice.client.post("/projects", { name: "Alice private app" })).body;
    await alice.client.put(`/projects/${project.id}/secrets`, { kind: "ENV_VAR", key: "TOKEN", value: "alice-secret-token-value" });

    // Bob cannot see it in lists
    expect((await bob.client.get("/projects")).body.data).toEqual([]);
    expect((await bob.client.get("/dashboard")).body.totals.projects).toBe(0);
    // ...or by id (404, indistinguishable from non-existent)
    expect((await bob.client.get(`/projects/${project.id}`)).status).toBe(404);
    expect((await bob.client.patch(`/projects/${project.id}`, { name: "pwned" })).status).toBe(404);
    expect((await bob.client.delete(`/projects/${project.id}`)).status).toBe(404);
    expect((await bob.client.get(`/projects/${project.id}/secrets`)).status).toBe(404);
    expect((await bob.client.put(`/projects/${project.id}/secrets`, { kind: "ENV_VAR", key: "X", value: "y" })).status).toBe(404);
    expect((await bob.client.post("/test-runs", { projectId: project.id })).status).toBe(404);

    // Bob cannot pick Alice's organization via the header override
    const viaHeader = await bob.client.get("/projects", { "x-organization-id": alice.organization!.id });
    expect(viaHeader.status).toBe(403);
    // ...nor read her members, invitations, billing or audit log
    for (const url of ["/members", "/invitations", "/billing", "/audit-logs", "/organizations/current"]) {
      expect((await bob.client.get(url, { "x-organization-id": alice.organization!.id })).status, url).toBe(403);
    }

    const unchanged = await testDb().project.findUniqueOrThrow({ where: { id: project.id } });
    expect(unchanged.name).toBe("Alice private app");
    expect(await testDb().projectSecret.count({ where: { projectId: project.id } })).toBe(1);
  });

  it("does not leak members across organizations when acting on member ids", async () => {
    const alice = await signUp(app, { orgName: "Org A" });
    const bob = await signUp(app, { orgName: "Org B" });
    const aliceMember = (await alice.client.get("/members")).body.data[0];
    expect((await bob.client.patch(`/members/${aliceMember.id}`, { role: "VIEWER" })).status).toBe(404);
    expect((await bob.client.delete(`/members/${aliceMember.id}`)).status).toBe(404);
  });

  it("scopes data to the active organization for users in several organizations", async () => {
    const u = await signUp(app, { orgName: "Org One" });
    await u.client.post("/projects", { name: "In org one" });
    const two = (await u.client.post("/organizations", { name: "Org Two" })).body;
    expect((await u.client.get("/projects")).body.data).toEqual([]);
    expect((await u.client.get("/projects", { "x-organization-id": u.organization!.id })).body.data).toHaveLength(1);
    await u.client.post(`/organizations/${u.organization!.id}/switch`);
    expect((await u.client.get("/projects")).body.data).toHaveLength(1);
    expect(two.id).not.toBe(u.organization!.id);
  });
});

describe("role-based access control (enforced server-side)", () => {
  async function team() {
    const owner = await signUp(app, { orgName: "RBAC Org" });
    await verifyEmail(owner.email);
    await testDb().subscription.updateMany({ data: { plan: "TEAM" } });
    const admin = await addMember(app, owner.client, "ADMIN");
    const dev = await addMember(app, owner.client, "DEVELOPER");
    const viewer = await addMember(app, owner.client, "VIEWER");
    const project = (await owner.client.post("/projects", { name: "Shared" })).body;
    return { owner, admin, dev, viewer, project };
  }

  it("viewer: read-only", async () => {
    const { viewer, project } = await team();
    expect((await viewer.client.get("/projects")).status).toBe(200);
    expect((await viewer.client.get(`/projects/${project.id}`)).status).toBe(200);
    expect((await viewer.client.post("/projects", { name: "Nope" })).status).toBe(403);
    expect((await viewer.client.patch(`/projects/${project.id}`, { name: "Nope" })).status).toBe(403);
    expect((await viewer.client.get(`/projects/${project.id}/secrets`)).status).toBe(403);
    expect((await viewer.client.post("/test-runs", { projectId: project.id })).status).toBe(403);
    expect((await viewer.client.post("/invitations", { email: "x@example.com", role: "VIEWER" })).status).toBe(403);
    expect((await viewer.client.get("/billing")).status).toBe(403);
    expect((await viewer.client.get("/audit-logs")).status).toBe(403);
  });

  it("developer: can run tests and see secret names, cannot manage projects/secrets/team", async () => {
    const { dev, project } = await team();
    expect((await dev.client.get(`/projects/${project.id}/secrets`)).status).toBe(200);
    expect((await dev.client.put(`/projects/${project.id}/secrets`, { kind: "ENV_VAR", key: "A", value: "b" })).status).toBe(403);
    expect((await dev.client.post("/projects", { name: "Nope" })).status).toBe(403);
    expect((await dev.client.patch(`/projects/${project.id}`, { status: "ARCHIVED" })).status).toBe(403);
    // Permitted, but the engine is not available yet (501, not 403)
    expect((await dev.client.post("/test-runs", { projectId: project.id })).status).toBe(501);
    expect((await dev.client.post("/invitations", { email: "x@example.com", role: "VIEWER" })).status).toBe(403);
  });

  it("admin: manages projects and team, but not billing, owners or org deletion", async () => {
    const { admin, owner, project } = await team();
    await verifyEmail(admin.email);
    expect((await admin.client.patch(`/projects/${project.id}`, { name: "Renamed by admin" })).status).toBe(200);
    expect((await admin.client.put(`/projects/${project.id}/secrets`, { kind: "ENV_VAR", key: "A", value: "b" })).status).toBe(200);
    expect((await admin.client.get("/billing")).status).toBe(200);
    expect((await admin.client.post("/billing/checkout", { plan: "PRO" })).status).toBe(403);
    expect((await admin.client.delete("/organizations/current", { confirm: "rbac-org" })).status).toBe(403);
    expect((await admin.client.post("/invitations", { email: "o@example.com", role: "OWNER" })).status).toBe(403);
    expect((await admin.client.post("/invitations", { email: "d@example.com", role: "DEVELOPER" })).status).toBe(201);

    const members = (await owner.client.get("/members")).body.data;
    const ownerRow = members.find((m: { role: string }) => m.role === "OWNER");
    expect((await admin.client.patch(`/members/${ownerRow.id}`, { role: "VIEWER" })).status).toBe(403);
    expect((await admin.client.delete(`/members/${ownerRow.id}`)).status).toBe(403);
  });

  it("owner: can promote to owner; role changes take effect on the next request", async () => {
    const { owner, dev, project } = await team();
    const members = (await owner.client.get("/members")).body.data;
    const devRow = members.find((m: { role: string }) => m.role === "DEVELOPER");
    expect((await dev.client.patch(`/projects/${project.id}`, { name: "x" })).status).toBe(403);
    expect((await owner.client.patch(`/members/${devRow.id}`, { role: "ADMIN" })).status).toBe(200);
    expect((await dev.client.patch(`/projects/${project.id}`, { name: "Now allowed" })).status).toBe(200);
    expect((await owner.client.patch(`/members/${devRow.id}`, { role: "OWNER" })).status).toBe(200);
  });

  it("removing a member revokes access immediately", async () => {
    const { owner, viewer } = await team();
    const members = (await owner.client.get("/members")).body.data;
    const viewerRow = members.find((m: { role: string }) => m.role === "VIEWER");
    expect((await owner.client.delete(`/members/${viewerRow.id}`)).status).toBe(204);
    expect((await viewer.client.get("/projects")).status).toBe(403);
  });
});
