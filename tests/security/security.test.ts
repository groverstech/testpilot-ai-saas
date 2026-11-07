import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, DEFAULT_PASSWORD, resetDatabase, signUp, TestClient, uniqueEmail } from "@testpilot/testing";

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

describe("CSRF protection", () => {
  it("rejects state-changing requests without the CSRF header", async () => {
    const { client } = await signUp(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: client.cookie!, "content-type": "application/json" },
      payload: { name: "No header" },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe("CSRF_HEADER_MISSING");
  });

  it("rejects requests from foreign origins even with the header", async () => {
    const { client } = await signUp(app);
    const res = await client.post("/projects", { name: "Evil" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_ORIGIN_REJECTED");
  });

  it("accepts the application's own origin", async () => {
    const { client } = await signUp(app);
    expect((await client.post("/projects", { name: "Good" }, { origin: "http://localhost:3000" })).status).toBe(201);
  });

  it("does not grant CORS to other origins", async () => {
    const res = await app.inject({ method: "OPTIONS", url: "/api/v1/projects", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("session cookie", () => {
  it("is httpOnly, SameSite=Lax, path=/ and opaque", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { "x-testpilot-csrf": "1", "content-type": "application/json" },
      payload: { name: "Cookie", email: uniqueEmail(), password: DEFAULT_PASSWORD },
    });
    const cookie = res.cookies.find((c) => c.name === "tp_session")!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Lax");
    expect(cookie.path).toBe("/");
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("is Secure when COOKIE_SECURE=true", async () => {
    const secureApp = await createTestApp({ COOKIE_SECURE: "true" });
    try {
      const res = await secureApp.inject({
        method: "POST",
        url: "/api/v1/auth/register",
        headers: { "x-testpilot-csrf": "1", "content-type": "application/json" },
        payload: { name: "Cookie", email: uniqueEmail(), password: DEFAULT_PASSWORD },
      });
      expect(res.cookies.find((c) => c.name === "tp_session")!.secure).toBe(true);
    } finally {
      await secureApp.close();
    }
  });

  it("ignores forged session tokens", async () => {
    const c = new TestClient(app);
    c.cookie = "tp_session=" + "A".repeat(43);
    expect((await c.get("/auth/session")).status).toBe(401);
  });
});

describe("response hardening", () => {
  it("sets security headers", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns structured errors without stack traces", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/does-not-exist" });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toMatchObject({ code: "NOT_FOUND" });
    expect(res.body).not.toMatch(/at .*\.ts:\d+/);
  });

  it("never returns password hashes or token hashes", async () => {
    const { client } = await signUp(app);
    for (const url of ["/auth/session", "/me", "/members", "/me/sessions"]) {
      const body = JSON.stringify((await client.get(url)).body);
      expect(body, url).not.toMatch(/passwordHash|tokenHash|scrypt\$/);
    }
  });

  it("rejects oversized and malformed JSON bodies", async () => {
    const { client } = await signUp(app);
    const big = await client.post("/projects", { name: "x", description: "a".repeat(2 * 1024 * 1024) });
    expect(big.status).toBe(413);
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { cookie: client.cookie!, "x-testpilot-csrf": "1", "content-type": "application/json" },
      payload: "{not json",
    });
    expect(bad.statusCode).toBe(400);
  });

  it("rejects non-UUID ids instead of hitting the database", async () => {
    const { client } = await signUp(app);
    expect((await client.get("/projects/1%20OR%201=1")).status).toBe(422);
    expect((await client.get("/projects", { "x-organization-id": "' OR 1=1 --" })).status).toBe(400);
  });
});

describe("rate limiting", () => {
  it("throttles repeated login attempts per IP", async () => {
    const limited = await createTestApp({ RATE_LIMIT_ENABLED: "true" });
    try {
      const c = new TestClient(limited);
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        statuses.push((await c.post("/auth/login", { email: "nobody@example.com", password: "Whatever123" })).status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
      const last = await c.post("/auth/login", { email: "nobody@example.com", password: "Whatever123" });
      expect(last.body.error.code).toBe("RATE_LIMITED");
    } finally {
      await limited.close();
    }
  });
});

describe("open redirect", () => {
  it("is prevented in the web app's ?next= handling (safeNext)", async () => {
    const { safeNext } = await import("../../apps/web/src/lib/safe-next");
    expect(safeNext("/projects")).toBe("/projects");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("/\\evil.example")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
  });
});
