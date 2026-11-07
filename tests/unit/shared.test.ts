import { describe, expect, it } from "vitest";
import {
  createProjectSchema,
  DEFAULT_TEST_SETTINGS,
  getPlanLimits,
  PLANS,
  redact,
  REDACTED,
  registerSchema,
  slugify,
  upsertSecretSchema,
} from "@testpilot/shared";

describe("validation schemas", () => {
  it("normalizes registration input", () => {
    const r = registerSchema.parse({ name: "  Ada  ", email: "ADA@Example.COM ", password: "Password123" });
    expect(r).toEqual({ name: "Ada", email: "ada@example.com", password: "Password123" });
  });

  it("enforces password strength", () => {
    expect(registerSchema.safeParse({ name: "a", email: "a@b.co", password: "short1" }).success).toBe(false);
    expect(registerSchema.safeParse({ name: "a", email: "a@b.co", password: "onlyletterslong" }).success).toBe(false);
  });

  it("only allows http(s) application URLs", () => {
    expect(createProjectSchema.safeParse({ name: "App", appUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "App", appUrl: "ftp://x.com" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "App", appUrl: "https://x.com" }).success).toBe(true);
  });

  it("rejects unsafe branch names", () => {
    for (const b of ["../etc", "a//b", "/abs", "x;rm -rf", "trailing/"]) {
      expect(createProjectSchema.safeParse({ name: "App", defaultBranch: b }).success, b).toBe(false);
    }
    expect(createProjectSchema.safeParse({ name: "App", defaultBranch: "feature/login-v2" }).success).toBe(true);
  });

  it("rejects reserved / invalid environment variable names", () => {
    const base = { kind: "ENV_VAR" as const, value: "x" };
    expect(upsertSecretSchema.safeParse({ ...base, key: "API_URL" }).success).toBe(true);
    expect(upsertSecretSchema.safeParse({ ...base, key: "NODE_OPTIONS" }).success).toBe(false);
    expect(upsertSecretSchema.safeParse({ ...base, key: "LD_PRELOAD" }).success).toBe(false);
    expect(upsertSecretSchema.safeParse({ ...base, key: "1BAD" }).success).toBe(false);
    expect(upsertSecretSchema.safeParse({ ...base, key: "has space" }).success).toBe(false);
  });

  it("provides complete default test settings", () => {
    expect(DEFAULT_TEST_SETTINGS.viewports.length).toBeGreaterThan(0);
    expect(DEFAULT_TEST_SETTINGS.categories).toContain("FUNCTIONAL");
  });
});

describe("slugify", () => {
  it("creates url-safe slugs", () => {
    expect(slugify("Acme Inc.")).toBe("acme-inc");
    expect(slugify("  Über   Café  ")).toBe("uber-cafe");
    expect(slugify("x")).toMatch(/^x-[a-z0-9]{1,4}$/);
  });
});

describe("plans", () => {
  it("has a free tier with finite limits and supports overrides", () => {
    expect(PLANS.FREE.limits.projects).toBe(2);
    expect(getPlanLimits("FREE", { FREE: { projects: 5 } }).projects).toBe(5);
    expect(getPlanLimits("ENTERPRISE").projects).toBeNull();
  });
});

describe("redact", () => {
  it("redacts sensitive keys and known token formats, recursively", () => {
    const input = {
      email: "a@b.co",
      password: "hunter2",
      nested: { apiKey: "abc", note: "token ghp_0123456789abcdefghijABCDEFGHIJ0123 used" },
      list: ["sk-ant-api03-abcdefghijklmnopqrstuvwxyz"],
    };
    const out = redact(input);
    expect(out.email).toBe("a@b.co");
    expect(out.password).toBe(REDACTED);
    expect(out.nested.apiKey).toBe(REDACTED);
    expect(out.nested.note).toBe(`token ${REDACTED} used`);
    expect(out.list[0]).toBe(REDACTED);
  });

  it("redacts caller-supplied secret values", () => {
    expect(redact("login with pa55word-xyz now", ["pa55word-xyz"])).toBe(`login with ${REDACTED} now`);
  });
});
