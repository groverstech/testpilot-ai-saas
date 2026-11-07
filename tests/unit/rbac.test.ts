import { describe, expect, it } from "vitest";
import { can, canManageRole, ROLE_PERMISSIONS, ROLES } from "@testpilot/shared";

describe("RBAC permission matrix", () => {
  it("gives owners every permission any other role has", () => {
    for (const role of ROLES) {
      for (const p of ROLE_PERMISSIONS[role]) expect(can("OWNER", p)).toBe(true);
    }
  });

  it("roles are strictly nested: viewer ⊂ developer ⊂ admin ⊂ owner", () => {
    const order = ["VIEWER", "DEVELOPER", "ADMIN", "OWNER"] as const;
    for (let i = 0; i < order.length - 1; i++) {
      for (const p of ROLE_PERMISSIONS[order[i]!]) expect(ROLE_PERMISSIONS[order[i + 1]!].has(p)).toBe(true);
    }
  });

  it("viewers are read-only", () => {
    for (const p of ROLE_PERMISSIONS.VIEWER) expect(p).toMatch(/:read$/);
    expect(can("VIEWER", "projects:create")).toBe(false);
    expect(can("VIEWER", "testruns:create")).toBe(false);
  });

  it("developers can run tests but not manage projects, secrets or members", () => {
    expect(can("DEVELOPER", "testruns:create")).toBe(true);
    expect(can("DEVELOPER", "bugs:manage")).toBe(true);
    expect(can("DEVELOPER", "projects:create")).toBe(false);
    expect(can("DEVELOPER", "secrets:manage")).toBe(false);
    expect(can("DEVELOPER", "members:invite")).toBe(false);
  });

  it("only owners manage billing and delete the organization", () => {
    expect(can("OWNER", "billing:manage")).toBe(true);
    expect(can("ADMIN", "billing:manage")).toBe(false);
    expect(can("OWNER", "org:delete")).toBe(true);
    expect(can("ADMIN", "org:delete")).toBe(false);
  });

  it("denies everything for a missing role", () => {
    expect(can(null, "projects:read")).toBe(false);
    expect(can(undefined, "org:read")).toBe(false);
  });
});

describe("canManageRole", () => {
  it("lets owners assign any role", () => {
    for (const r of ROLES) expect(canManageRole("OWNER", r)).toBe(true);
  });

  it("prevents admins from granting or touching OWNER", () => {
    expect(canManageRole("ADMIN", "OWNER")).toBe(false);
    expect(canManageRole("ADMIN", "VIEWER", "OWNER")).toBe(false);
    expect(canManageRole("ADMIN", "DEVELOPER", "VIEWER")).toBe(true);
    expect(canManageRole("ADMIN", "ADMIN", "DEVELOPER")).toBe(true);
  });

  it("prevents developers and viewers from managing anyone", () => {
    expect(canManageRole("DEVELOPER", "VIEWER")).toBe(false);
    expect(canManageRole("VIEWER", "VIEWER")).toBe(false);
  });
});
