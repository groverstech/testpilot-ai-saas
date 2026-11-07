/**
 * Test utilities shared by the integration, security and e2e suites.
 * Integration tests run the real Fastify app (in-process, via `inject`) against a real
 * PostgreSQL test database — nothing is mocked except DNS resolution for SSRF checks.
 */
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { buildApp } from "@testpilot/api/app";
import { loadConfig } from "@testpilot/api/config";
import { createPrismaClient, type PrismaClient } from "@testpilot/database";

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgresql://testpilot:testpilot@localhost:5432/testpilot_test";

/** Fixed, test-only key. Never used outside the test database. */
export const TEST_ENCRYPTION_KEYS = "test:" + Buffer.alloc(32, 7).toString("base64");

/** Fake DNS so SSRF tests are deterministic and need no network. */
const FAKE_DNS: Record<string, string[]> = {
  "example.com": ["93.184.216.34"],
  "staging.example.com": ["93.184.216.34"],
  "internal.example.com": ["10.0.0.12"],
  "rebind.example.com": ["93.184.216.34", "127.0.0.1"],
};

export async function fakeResolve(hostname: string): Promise<string[]> {
  const hit = FAKE_DNS[hostname];
  if (!hit) throw new Error("ENOTFOUND");
  return hit;
}

let sharedDb: PrismaClient | null = null;
export function testDb(): PrismaClient {
  sharedDb ??= createPrismaClient(TEST_DATABASE_URL);
  return sharedDb;
}

export async function createTestApp(env: Record<string, string> = {}): Promise<FastifyInstance> {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: TEST_DATABASE_URL,
    ENCRYPTION_KEYS: TEST_ENCRYPTION_KEYS,
    WEB_URL: "http://localhost:3000",
    RATE_LIMIT_ENABLED: "false",
    ALLOW_PRIVATE_APP_URLS: "false",
    EMAIL_TRANSPORT: "memory",
    ...env,
  });
  const app = await buildApp({ config, db: testDb(), resolveHost: fakeResolve });
  await app.ready();
  return app;
}

/** Remove all rows (fast, keeps schema). */
export async function resetDatabase(db: PrismaClient = testDb()): Promise<void> {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} CASCADE`);
}

export interface TestResponse<T = any> {
  status: number;
  body: T;
  headers: LightMyRequestResponse["headers"];
  raw: LightMyRequestResponse;
}

/** A cookie-jar HTTP client bound to one user. Sends the CSRF header on mutations by default. */
export class TestClient {
  cookie: string | null = null;
  orgId: string | null = null;

  constructor(private readonly app: FastifyInstance) {}

  async request<T = any>(method: InjectOptions["method"], url: string, body?: unknown, headers: Record<string, string> = {}): Promise<TestResponse<T>> {
    const isMutation = method !== "GET" && method !== "HEAD";
    const res = await this.app.inject({
      method,
      url: `/api/v1${url}`,
      payload: body === undefined ? undefined : (body as InjectOptions["payload"]),
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(isMutation ? { "x-testpilot-csrf": "1" } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
    });
    const setCookie = res.cookies.find((c) => c.name === "tp_session");
    if (setCookie) this.cookie = setCookie.value ? `tp_session=${setCookie.value}` : null;
    let parsed: unknown = undefined;
    try {
      parsed = res.body ? JSON.parse(res.body) : undefined;
    } catch {
      parsed = res.body;
    }
    return { status: res.statusCode, body: parsed as T, headers: res.headers, raw: res };
  }

  get<T = any>(url: string, headers?: Record<string, string>) {
    return this.request<T>("GET", url, undefined, headers);
  }
  post<T = any>(url: string, body: unknown = {}, headers?: Record<string, string>) {
    return this.request<T>("POST", url, body, headers);
  }
  patch<T = any>(url: string, body: unknown, headers?: Record<string, string>) {
    return this.request<T>("PATCH", url, body, headers);
  }
  put<T = any>(url: string, body: unknown, headers?: Record<string, string>) {
    return this.request<T>("PUT", url, body, headers);
  }
  delete<T = any>(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>("DELETE", url, body, headers);
  }
}

let counter = 0;
export function uniqueEmail(prefix = "user"): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}@example.com`;
}

export const DEFAULT_PASSWORD = "CorrectHorse42";

/** Registers a user and (optionally) creates an organization they own. */
export async function signUp(app: FastifyInstance, opts: { name?: string; email?: string; orgName?: string | null } = {}) {
  const client = new TestClient(app);
  const email = opts.email ?? uniqueEmail();
  const reg = await client.post("/auth/register", { name: opts.name ?? "Test User", email, password: DEFAULT_PASSWORD });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  let organization: { id: string; slug: string; name: string } | null = null;
  if (opts.orgName !== null) {
    const org = await client.post("/organizations", { name: opts.orgName ?? `Org ${email.slice(0, 12)}` });
    if (org.status !== 201) throw new Error(`org create failed: ${org.status} ${JSON.stringify(org.body)}`);
    organization = org.body;
    client.orgId = org.body.id;
  }
  return { client, email, userId: reg.body.user.id as string, organization };
}

/** Marks a user's email as verified directly in the database (for tests that need it). */
export async function verifyEmail(email: string) {
  await testDb().user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
}

/** Extracts the one-time token from the most recent email sent to `to`. */
export function tokenFromOutbox(app: FastifyInstance, to: string, pathPart: string): string {
  const mail = [...app.mailer.outbox].reverse().find((m) => m.to === to && m.text.includes(pathPart));
  if (!mail) throw new Error(`No email to ${to} containing ${pathPart}`);
  const match = mail.text.match(new RegExp(`${pathPart.replace(/[/?]/g, "\\$&")}([A-Za-z0-9_\\-%]+)`));
  if (!match) throw new Error("Token not found in email");
  return decodeURIComponent(match[1]!);
}

/** Adds an existing user to an organization with a role, via the real invitation flow. */
export async function addMember(app: FastifyInstance, owner: TestClient, role: "ADMIN" | "DEVELOPER" | "VIEWER" | "OWNER") {
  const member = await signUp(app, { orgName: null, name: `${role} member` });
  const inv = await owner.post("/invitations", { email: member.email, role });
  if (inv.status !== 201) throw new Error(`invite failed: ${inv.status} ${JSON.stringify(inv.body)}`);
  const token = tokenFromOutbox(app, member.email, "/invite/");
  const accepted = await member.client.post(`/invitations/token/${token}/accept`);
  if (accepted.status !== 200) throw new Error(`accept failed: ${accepted.status} ${JSON.stringify(accepted.body)}`);
  return member;
}
