import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPlanLimits, PLAN_TIERS, PLANS, type BillingDTO, type PlanLimits, type PlanTier } from "@testpilot/shared";
import { errors, parse } from "../lib/errors";
import { requireOrg } from "../plugins/auth";

export function planOverrides(app: FastifyInstance): Partial<Record<PlanTier, Partial<PlanLimits>>> | undefined {
  if (!app.config.env.PLAN_LIMITS_JSON) return undefined;
  try {
    return JSON.parse(app.config.env.PLAN_LIMITS_JSON);
  } catch {
    app.log.warn("PLAN_LIMITS_JSON is not valid JSON; using default plan limits");
    return undefined;
  }
}

/**
 * Billing (Phase 7 for payments). Plan, limits and usage are real; checkout and the billing
 * portal require Stripe credentials and are reported as not configured until then.
 */
export async function billingRoutes(app: FastifyInstance) {
  app.get("/", async (request): Promise<BillingDTO> => {
    const ctx = await requireOrg(request, "billing:read");
    const organizationId = ctx.organization.id;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [sub, projects, members, runs] = await Promise.all([
      app.db.subscription.upsert({ where: { organizationId }, create: { organizationId }, update: {} }),
      app.db.project.count({ where: { organizationId, status: "ACTIVE" } }),
      app.db.organizationMember.count({ where: { organizationId } }),
      app.db.testRun.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
    ]);
    const tier = sub.plan as PlanTier;
    return {
      tier,
      plan: PLANS[tier],
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      limits: getPlanLimits(tier, planOverrides(app)),
      usage: { projects, members, testRunsThisMonth: runs },
      provider: { configured: Boolean(app.config.env.STRIPE_SECRET_KEY && app.config.env.STRIPE_WEBHOOK_SECRET), name: app.config.env.STRIPE_SECRET_KEY ? "stripe" : null },
      plans: PLAN_TIERS.map((t) => PLANS[t]),
    };
  });

  app.post("/checkout", async (request) => {
    await requireOrg(request, "billing:manage");
    parse(z.object({ plan: z.enum(["PRO", "TEAM"]) }), request.body);
    const missing = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"].filter((k) => !app.config.env[k as "STRIPE_SECRET_KEY"]);
    if (missing.length) throw errors.notConfigured("Stripe billing", missing);
    throw errors.notImplemented("Stripe checkout ships in Phase 7");
  });

  app.post("/portal", async (request) => {
    await requireOrg(request, "billing:manage");
    const missing = ["STRIPE_SECRET_KEY"].filter((k) => !app.config.env[k as "STRIPE_SECRET_KEY"]);
    if (missing.length) throw errors.notConfigured("Stripe billing", missing);
    throw errors.notImplemented("The Stripe billing portal ships in Phase 7");
  });
}

/** Effective limits for an organization (plan defaults + PLAN_LIMITS_JSON overrides). */
export async function getOrgPlanLimits(app: FastifyInstance, organizationId: string): Promise<PlanLimits> {
  const sub = await app.db.subscription.findUnique({ where: { organizationId }, select: { plan: true } });
  return getPlanLimits((sub?.plan ?? "FREE") as PlanTier, planOverrides(app));
}
