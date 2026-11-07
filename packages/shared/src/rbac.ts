/**
 * Role-based access control. This module is the single source of truth for what each role
 * may do. The API enforces it on every request (see apps/api/src/plugins/auth.ts); the web
 * app only uses it to hide controls the user cannot use.
 */
export const ROLES = ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "org:read",
  "org:update",
  "org:delete",
  "members:read",
  "members:invite",
  "members:update",
  "members:remove",
  "billing:read",
  "billing:manage",
  "audit:read",
  "integrations:read",
  "integrations:manage",
  "workspaces:manage",
  "projects:read",
  "projects:create",
  "projects:update",
  "projects:archive",
  "projects:delete",
  "secrets:read-metadata",
  "secrets:manage",
  "repositories:read",
  "testruns:read",
  "testruns:create",
  "testruns:cancel",
  "bugs:read",
  "bugs:manage",
  "reports:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: Permission[] = [
  "org:read",
  "members:read",
  "integrations:read",
  "projects:read",
  "repositories:read",
  "testruns:read",
  "bugs:read",
  "reports:read",
];

const DEVELOPER: Permission[] = [
  ...VIEWER,
  "secrets:read-metadata",
  "testruns:create",
  "testruns:cancel",
  "bugs:manage",
];

const ADMIN: Permission[] = [
  ...DEVELOPER,
  "org:update",
  "members:invite",
  "members:update",
  "members:remove",
  "billing:read",
  "audit:read",
  "integrations:manage",
  "workspaces:manage",
  "projects:create",
  "projects:update",
  "projects:archive",
  "projects:delete",
  "secrets:manage",
];

const OWNER: Permission[] = [...ADMIN, "org:delete", "billing:manage"];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set(OWNER),
  ADMIN: new Set(ADMIN),
  DEVELOPER: new Set(DEVELOPER),
  VIEWER: new Set(VIEWER),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Higher number = more privileged. */
export const ROLE_RANK: Record<Role, number> = { VIEWER: 0, DEVELOPER: 1, ADMIN: 2, OWNER: 3 };

/**
 * Whether `actor` may assign `targetRole` to someone, or change/remove a member who currently
 * holds `currentRole`. Only owners can grant or touch the OWNER role; nobody can act on a
 * member more privileged than themselves.
 */
export function canManageRole(actor: Role, targetRole: Role, currentRole?: Role): boolean {
  if (!can(actor, "members:update")) return false;
  if (actor !== "OWNER" && (targetRole === "OWNER" || currentRole === "OWNER")) return false;
  if (currentRole && ROLE_RANK[currentRole] > ROLE_RANK[actor]) return false;
  return ROLE_RANK[targetRole] <= ROLE_RANK[actor];
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  DEVELOPER: "Developer",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Full access, including billing and organization deletion.",
  ADMIN: "Manage projects, testing configuration and team members.",
  DEVELOPER: "Run tests and manage bugs on existing projects.",
  VIEWER: "Read-only access to dashboards, reports and screenshots.",
};
