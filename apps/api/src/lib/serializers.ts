import type { Organization, OrganizationMember, User } from "@testpilot/database";
import {
  can,
  DEFAULT_TEST_SETTINGS,
  PERMISSIONS,
  testSettingsSchema,
  type OrganizationSummaryDTO,
  type Role,
  type SessionDTO,
  type TestSettings,
  type UserDTO,
} from "@testpilot/shared";

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toSessionDTO(
  user: User,
  memberships: Array<OrganizationMember & { organization: Organization }>,
  activeOrganizationId: string | null,
): SessionDTO {
  const organizations: OrganizationSummaryDTO[] = memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    role: m.role as Role,
  }));
  const active = organizations.find((o) => o.id === activeOrganizationId) ?? null;
  return {
    user: toUserDTO(user),
    organizations,
    activeOrganization: active
      ? { ...active, permissions: PERMISSIONS.filter((p) => can(active.role, p)) }
      : null,
  };
}

export function normalizeTestSettings(raw: unknown): TestSettings {
  const parsed = testSettingsSchema.safeParse({ ...DEFAULT_TEST_SETTINGS, ...((raw as object) ?? {}) });
  return parsed.success ? parsed.data : DEFAULT_TEST_SETTINGS;
}

export function paginate(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
