import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  createTestApp,
  DEFAULT_PASSWORD,
  resetDatabase,
  signUp,
  TestClient,
  testDb,
  tokenFromOutbox,
  uniqueEmail,
} from "@testpilot/testing";

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

describe("registration", () => {
  it("creates a user, a session and sends a verification email", async () => {
    const client = new TestClient(app);
    const email = uniqueEmail();
    const res = await client.post("/auth/register", { name: "Ada Lovelace", email, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, name: "Ada Lovelace", emailVerified: false });
    expect(res.body.organizations).toEqual([]);
    expect(res.body).not.toHaveProperty("user.passwordHash");
    expect(client.cookie).toBeTruthy();

    const user = await testDb().user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^scrypt\$/);
    expect(app.mailer.outbox.some((m) => m.to === email && m.text.includes("/verify-email?token="))).toBe(true);

    const session = await client.get("/auth/session");
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe(email);
  });

  it("rejects duplicate emails (case-insensitively)", async () => {
    const email = uniqueEmail();
    await signUp(app, { email, orgName: null });
    const res = await new TestClient(app).post("/auth/register", { name: "X", email: email.toUpperCase(), password: DEFAULT_PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("validates input and returns field errors", async () => {
    const res = await new TestClient(app).post("/auth/register", { name: "", email: "nope", password: "short" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });
});

describe("login / logout", () => {
  it("logs in with valid credentials and logs out (session revoked server-side)", async () => {
    const { email } = await signUp(app, { orgName: "Acme" });
    const client = new TestClient(app);
    const login = await client.post("/auth/login", { email, password: DEFAULT_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.activeOrganization?.name).toBe("Acme");
    expect(login.body.activeOrganization.permissions).toContain("billing:manage");

    const cookie = client.cookie!;
    const out = await client.post("/auth/logout");
    expect(out.status).toBe(204);

    // Replaying the old cookie must not work.
    const replay = new TestClient(app);
    replay.cookie = cookie;
    expect((await replay.get("/auth/session")).status).toBe(401);
  });

  it("returns the same error for an unknown email and a wrong password", async () => {
    const { email } = await signUp(app, { orgName: null });
    const wrongPw = await new TestClient(app).post("/auth/login", { email, password: "WrongPassword9" });
    const unknown = await new TestClient(app).post("/auth/login", { email: uniqueEmail(), password: DEFAULT_PASSWORD });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.error).toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(unknown.body.error.message).toBe(wrongPw.body.error.message);
  });

  it("requires authentication for protected endpoints", async () => {
    const c = new TestClient(app);
    for (const url of ["/auth/session", "/projects", "/dashboard", "/members", "/me"]) {
      expect((await c.get(url)).status, url).toBe(401);
    }
  });

  it("expires sessions server-side", async () => {
    const { client, userId } = await signUp(app, { orgName: null });
    await testDb().session.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await client.get("/auth/session")).status).toBe(401);
    expect(await testDb().session.count({ where: { userId } })).toBe(0);
  });
});

describe("email verification", () => {
  it("verifies with the emailed token, once", async () => {
    const { client, email } = await signUp(app, { orgName: null });
    const token = tokenFromOutbox(app, email, "/verify-email?token=");
    expect((await client.post("/auth/verify-email", { token })).status).toBe(200);
    expect((await client.get("/auth/session")).body.user.emailVerified).toBe(true);
    const again = await client.post("/auth/verify-email", { token });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("INVALID_TOKEN");
  });

  it("rejects forged tokens", async () => {
    const res = await new TestClient(app).post("/auth/verify-email", { token: "x".repeat(43) });
    expect(res.status).toBe(400);
  });
});

describe("password reset", () => {
  it("does not reveal whether an account exists", async () => {
    const res = await new TestClient(app).post("/auth/forgot-password", { email: uniqueEmail() });
    expect(res.status).toBe(202);
    expect(app.mailer.outbox).toHaveLength(0);
  });

  it("resets the password and revokes all existing sessions", async () => {
    const { client, email } = await signUp(app, { orgName: null });
    expect((await new TestClient(app).post("/auth/forgot-password", { email })).status).toBe(202);
    const token = tokenFromOutbox(app, email, "/reset-password?token=");

    const reset = await new TestClient(app).post("/auth/reset-password", { token, password: "BrandNewPass77" });
    expect(reset.status).toBe(200);
    expect((await client.get("/auth/session")).status).toBe(401);

    expect((await new TestClient(app).post("/auth/login", { email, password: DEFAULT_PASSWORD })).status).toBe(401);
    expect((await new TestClient(app).post("/auth/login", { email, password: "BrandNewPass77" })).status).toBe(200);
    // Single use
    expect((await new TestClient(app).post("/auth/reset-password", { token, password: "AnotherPass88" })).status).toBe(400);
  });

  it("rejects expired reset tokens", async () => {
    const { email } = await signUp(app, { orgName: null });
    await new TestClient(app).post("/auth/forgot-password", { email });
    const token = tokenFromOutbox(app, email, "/reset-password?token=");
    await testDb().userToken.updateMany({ where: { purpose: "PASSWORD_RESET" }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect((await new TestClient(app).post("/auth/reset-password", { token, password: "BrandNewPass77" })).status).toBe(400);
  });
});

describe("account settings", () => {
  it("changes password (requires current password) and keeps only the current session", async () => {
    const { client, email } = await signUp(app, { orgName: null });
    const other = new TestClient(app);
    await other.post("/auth/login", { email, password: DEFAULT_PASSWORD });

    expect((await client.post("/me/password", { currentPassword: "nope", newPassword: "NewPassword11" })).status).toBe(400);
    expect((await client.post("/me/password", { currentPassword: DEFAULT_PASSWORD, newPassword: "NewPassword11" })).status).toBe(200);
    expect((await client.get("/auth/session")).status).toBe(200);
    expect((await other.get("/auth/session")).status).toBe(401);
  });

  it("lists and revokes own sessions only", async () => {
    const a = await signUp(app, { orgName: null });
    const b = await signUp(app, { orgName: null });
    const bSessions = await b.client.get("/me/sessions");
    const bId = bSessions.body.data[0].id;
    expect((await a.client.delete(`/me/sessions/${bId}`)).status).toBe(404);
    expect((await b.client.get("/auth/session")).status).toBe(200);
  });

  it("updates the profile name", async () => {
    const { client } = await signUp(app, { orgName: null });
    const res = await client.patch("/me", { name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
  });
});
