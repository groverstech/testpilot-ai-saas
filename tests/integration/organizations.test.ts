import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { addMember, createTestApp, resetDatabase, signUp, tokenFromOutbox, verifyEmail, testDb } from "@testpilot/testing";

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

describe("organizations", () => {
  it("creates an organization with owner membership, default workspace and free subscription", async () => {
    const { client, userId, organization } = await signUp(app, { orgName: "Acme Inc" });
    expect(organization).toMatchObject({ name: "Acme Inc", slug: "acme-inc" });
    const db = testDb();
    expect(await db.organizationMember.findFirst({ where: { organizationId: organization!.id, userId } })).toMatchObject({ role: "OWNER" });
    expect(await db.workspace.count({ where: { organizationId: organization!.id, isDefault: true } })).toBe(1);
    expect(await db.subscription.findUnique({ where: { organizationId: organization!.id } })).toMatchObject({ plan: "FREE" });
    expect((await client.get("/auth/session")).body.activeOrganization.id).toBe(organization!.id);
    expect(await db.auditLog.count({ where: { action: "organization.created" } })).toBe(1);
  });

  it("de-duplicates generated slugs and rejects an explicitly taken slug", async () => {
    const a = await signUp(app, { orgName: "Same Name" });
    const b = await signUp(app, { orgName: "Same Name" });
    expect(a.organization!.slug).toBe("same-name");
    expect(b.organization!.slug).toBe("same-name-2");
    const res = await b.client.post("/organizations", { name: "Other", slug: "same-name" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SLUG_TAKEN");
  });

  it("switches between organizations the user belongs to, and nowhere else", async () => {
    const a = await signUp(app, { orgName: "First" });
    const second = await a.client.post("/organizations", { name: "Second" });
    expect((await a.client.get("/organizations")).body.data).toHaveLength(2);
    const sw = await a.client.post(`/organizations/${a.organization!.id}/switch`);
    expect(sw.status).toBe(200);
    expect(sw.body.activeOrganization.id).toBe(a.organization!.id);

    const stranger = await signUp(app, { orgName: "Elsewhere" });
    expect((await a.client.post(`/organizations/${stranger.organization!.id}/switch`)).status).toBe(403);
    expect(second.status).toBe(201);
  });

  it("updates settings (admin+) and deletes only with slug confirmation (owner)", async () => {
    const { client, organization } = await signUp(app, { orgName: "Rename Me" });
    const upd = await client.patch("/organizations/current", { name: "Renamed" });
    expect(upd.body.name).toBe("Renamed");
    expect((await client.delete("/organizations/current", { confirm: "wrong" })).status).toBe(400);
    expect((await client.delete("/organizations/current", { confirm: organization!.slug })).status).toBe(204);
    expect(await testDb().organization.count()).toBe(0);
    const session = await client.get("/auth/session");
    expect(session.body.activeOrganization).toBeNull();
  });

  it("creates workspaces", async () => {
    const { client } = await signUp(app);
    expect((await client.post("/organizations/current/workspaces", { name: "Mobile Apps" })).status).toBe(201);
    expect((await client.post("/organizations/current/workspaces", { name: "Mobile Apps" })).status).toBe(409);
    expect((await client.get("/organizations/current/workspaces")).body.data.map((w: { name: string }) => w.name)).toEqual(["General", "Mobile Apps"]);
  });
});

describe("invitations and members", () => {
  it("requires a verified email to invite", async () => {
    const { client } = await signUp(app);
    const res = await client.post("/invitations", { email: "x@example.com", role: "VIEWER" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("runs the full invite → accept flow", async () => {
    const owner = await signUp(app, { orgName: "Team Org" });
    await verifyEmail(owner.email);
    const member = await addMember(app, owner.client, "DEVELOPER");
    const session = await member.client.get("/auth/session");
    expect(session.body.activeOrganization).toMatchObject({ name: "Team Org", role: "DEVELOPER" });
    expect(session.body.user.emailVerified).toBe(true);
    const members = await owner.client.get("/members");
    expect(members.body.data).toHaveLength(2);
    expect((await owner.client.get("/invitations")).body.data).toHaveLength(0);
  });

  it("refuses to accept an invitation addressed to someone else", async () => {
    const owner = await signUp(app);
    await verifyEmail(owner.email);
    await owner.client.post("/invitations", { email: "intended@example.com", role: "VIEWER" });
    const token = tokenFromOutbox(app, "intended@example.com", "/invite/");
    const intruder = await signUp(app, { orgName: null });
    const res = await intruder.client.post(`/invitations/token/${token}/accept`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("INVITATION_EMAIL_MISMATCH");
  });

  it("previews valid invitations publicly and hides revoked ones", async () => {
    const owner = await signUp(app, { orgName: "Preview Org" });
    await verifyEmail(owner.email);
    const inv = await owner.client.post("/invitations", { email: "p@example.com", role: "ADMIN" });
    const token = tokenFromOutbox(app, "p@example.com", "/invite/");
    const anon = await app.inject({ method: "GET", url: `/api/v1/invitations/token/${token}` });
    expect(JSON.parse(anon.body)).toMatchObject({ organizationName: "Preview Org", role: "ADMIN" });
    expect((await owner.client.delete(`/invitations/${inv.body.id}`)).status).toBe(204);
    expect((await app.inject({ method: "GET", url: `/api/v1/invitations/token/${token}` })).statusCode).toBe(404);
  });

  it("enforces the plan member limit (Free = 3 incl. pending)", async () => {
    const owner = await signUp(app);
    await verifyEmail(owner.email);
    expect((await owner.client.post("/invitations", { email: "a1@example.com", role: "VIEWER" })).status).toBe(201);
    expect((await owner.client.post("/invitations", { email: "a2@example.com", role: "VIEWER" })).status).toBe(201);
    const third = await owner.client.post("/invitations", { email: "a3@example.com", role: "VIEWER" });
    expect(third.status).toBe(402);
    expect(third.body.error.code).toBe("PLAN_LIMIT_REACHED");
  });

  it("keeps at least one owner", async () => {
    const owner = await signUp(app);
    const members = await owner.client.get("/members");
    const me = members.body.data[0];
    const demote = await owner.client.patch(`/members/${me.id}`, { role: "ADMIN" });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe("LAST_OWNER");
    expect((await owner.client.delete(`/members/${me.id}`)).status).toBe(409);
  });

  it("lets members leave and immediately loses access", async () => {
    const owner = await signUp(app);
    await verifyEmail(owner.email);
    const dev = await addMember(app, owner.client, "DEVELOPER");
    const list = await owner.client.get("/members");
    const devRow = list.body.data.find((m: { user: { email: string } }) => m.user.email === dev.email);
    expect((await dev.client.delete(`/members/${devRow.id}`)).status).toBe(204);
    expect((await dev.client.get("/projects")).status).toBe(403);
  });
});
