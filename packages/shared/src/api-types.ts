/** Response shapes of the REST API (v1). Kept framework-agnostic so web and tests share them. */
import type { Role } from "./rbac";
import type { PlanDefinition, PlanTier, PlanLimits } from "./plans";
import type { TestSettings } from "./schemas";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface OrganizationSummaryDTO {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export interface SessionDTO {
  user: UserDTO;
  organizations: OrganizationSummaryDTO[];
  activeOrganization: (OrganizationSummaryDTO & { permissions: string[] }) | null;
}

export interface OrganizationDTO {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
  workspaces: WorkspaceDTO[];
}

export interface WorkspaceDTO {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
}

export interface MemberDTO {
  id: string;
  role: Role;
  joinedAt: string;
  user: { id: string; name: string; email: string };
}

export interface InvitationDTO {
  id: string;
  email: string;
  role: Role;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
  invitedBy: { id: string; name: string };
}

export interface ProjectDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  appUrl: string | null;
  defaultBranch: string | null;
  status: "ACTIVE" | "ARCHIVED";
  testSettings: TestSettings;
  workspace: { id: string; name: string };
  repository: { id: string; fullName: string; htmlUrl: string } | null;
  createdBy: { id: string; name: string };
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  stats: { testRuns: number; testCases: number; openBugs: number; lastRunAt: string | null };
}

export interface SecretDTO {
  id: string;
  kind: "ENV_VAR" | "TEST_CREDENTIAL";
  key: string;
  hint: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardDTO {
  totals: {
    projects: number;
    testRuns: number;
    passedTests: number;
    failedTests: number;
    blockedTests: number;
    successRate: number | null;
    openBugs: number;
    criticalBugs: number;
  };
  recentRuns: Array<{
    id: string;
    number: number;
    status: string;
    project: { id: string; name: string };
    createdAt: string;
  }>;
  trend: Array<{ date: string; passed: number; failed: number }>;
  projectQuality: Array<{ id: string; name: string; score: number | null }>;
  recentActivity: Array<{ id: string; action: string; actor: string | null; createdAt: string }>;
}

export interface BillingDTO {
  plan: PlanDefinition;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  limits: PlanLimits;
  usage: { projects: number; members: number; testRunsThisMonth: number };
  provider: { configured: boolean; name: "stripe" | null };
  plans: PlanDefinition[];
  tier: PlanTier;
}

export interface IntegrationStatusDTO {
  id: "github" | "anthropic" | "stripe" | "storage" | "email" | "queue";
  name: string;
  description: string;
  configured: boolean;
  connected: boolean;
  details: string;
  missing: string[];
}

export interface AuditLogDTO {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  actor: { id: string; name: string } | null;
  createdAt: string;
  metadata: unknown;
}
