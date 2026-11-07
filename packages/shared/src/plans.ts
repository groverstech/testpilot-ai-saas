/**
 * Plan catalogue. Quotas are defaults and can be overridden per deployment via the
 * PLAN_LIMITS_JSON environment variable (parsed by the API). `null` means unlimited.
 * Prices are display-only until a payment provider is configured and verified.
 */
export const PLAN_TIERS = ["FREE", "PRO", "TEAM", "ENTERPRISE"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export interface PlanLimits {
  projects: number | null;
  members: number | null;
  testRunsPerMonth: number | null;
  concurrentRuns: number;
  artifactRetentionDays: number;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  description: string;
  monthlyPriceUsd: number | null;
  features: string[];
  limits: PlanLimits;
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  FREE: {
    tier: "FREE",
    name: "Free",
    description: "For individual developers trying TestPilot AI.",
    monthlyPriceUsd: 0,
    features: ["Up to 2 projects", "50 test runs / month", "Basic reports"],
    limits: { projects: 2, members: 3, testRunsPerMonth: 50, concurrentRuns: 1, artifactRetentionDays: 7 },
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    description: "AI testing and visual QA for professionals.",
    monthlyPriceUsd: 49,
    features: ["Up to 10 projects", "500 test runs / month", "AI testing", "Visual QA", "Test history"],
    limits: { projects: 10, members: 5, testRunsPerMonth: 500, concurrentRuns: 2, artifactRetentionDays: 30 },
  },
  TEAM: {
    tier: "TEAM",
    name: "Team",
    description: "Shared workspaces and higher concurrency for teams.",
    monthlyPriceUsd: 199,
    features: ["Unlimited projects", "2,500 test runs / month", "Shared workspaces", "Team reporting"],
    limits: { projects: null, members: 50, testRunsPerMonth: 2500, concurrentRuns: 5, artifactRetentionDays: 90 },
  },
  ENTERPRISE: {
    tier: "ENTERPRISE",
    name: "Enterprise",
    description: "Private execution infrastructure and custom limits.",
    monthlyPriceUsd: null,
    features: ["Private execution infrastructure", "Advanced permissions", "Custom limits", "SSO & audit exports"],
    limits: { projects: null, members: null, testRunsPerMonth: null, concurrentRuns: 20, artifactRetentionDays: 365 },
  },
};

export function getPlanLimits(tier: PlanTier, overrides?: Partial<Record<PlanTier, Partial<PlanLimits>>>): PlanLimits {
  return { ...PLANS[tier].limits, ...(overrides?.[tier] ?? {}) };
}
