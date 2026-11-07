"use client";
import * as React from "react";
import { Check, Lock } from "lucide-react";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, cn } from "@testpilot/ui";
import type { BillingDTO } from "@testpilot/shared";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { useToast } from "@/components/toaster";
import { PageHeader } from "@/components/page-header";

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {used} / {limit ?? "∞"}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-foreground/70")} style={{ width: limit ? `${pct}%` : "0%" }} />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { can } = useSession();
  const toast = useToast();
  const { data, error } = useApi<BillingDTO>(can("billing:read") ? "/billing" : null);
  const [busy, setBusy] = React.useState<string | null>(null);

  if (!can("billing:read")) {
    return (
      <>
        <PageHeader title="Billing" />
        <Alert>
          <Lock />
          <AlertDescription>Only organization owners and admins can view billing.</AlertDescription>
        </Alert>
      </>
    );
  }

  async function upgrade(plan: "PRO" | "TEAM") {
    setBusy(plan);
    try {
      await api.post("/billing/checkout", { plan });
    } catch (err) {
      toast({
        title: err instanceof ApiClientError && err.code === "INTEGRATION_NOT_CONFIGURED" ? "Payments are not configured" : "Upgrade unavailable",
        description: errorMessage(err),
        variant: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Billing" description="Your plan, usage and subscription." />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      )}
      {!data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-6">
          {!data.provider.configured && (
            <Alert variant="info">
              <AlertDescription>
                Payment processing is not configured on this deployment, so plan changes are disabled. Usage limits below are enforced.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardDescription>Current plan</CardDescription>
                <CardTitle className="flex items-center gap-2 text-xl" data-testid="current-plan">
                  {data.plan.name} <Badge variant="outline">{data.status.toLowerCase()}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{data.plan.description}</p>
                {data.currentPeriodEnd && <p>Renews {new Date(data.currentPeriodEnd).toLocaleDateString()}</p>}
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Usage</CardTitle>
                <CardDescription>Current billing month</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Meter label="Active projects" used={data.usage.projects} limit={data.limits.projects} />
                <Meter label="Team members" used={data.usage.members} limit={data.limits.members} />
                <Meter label="Test runs this month" used={data.usage.testRunsThisMonth} limit={data.limits.testRunsPerMonth} />
                <p className="text-xs text-muted-foreground">
                  Concurrent runs: {data.limits.concurrentRuns} · Artifact retention: {data.limits.artifactRetentionDays} days
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {data.plans.map((p) => {
              const current = p.tier === data.tier;
              return (
                <Card key={p.tier} className={cn("flex flex-col", current && "border-foreground/40")}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {p.name} {current && <Badge>Current</Badge>}
                    </CardTitle>
                    <p className="text-2xl font-semibold tracking-tight">
                      {p.monthlyPriceUsd === null ? "Custom" : `$${p.monthlyPriceUsd}`}
                      {p.monthlyPriceUsd ? <span className="text-sm font-normal text-muted-foreground"> /mo</span> : null}
                    </p>
                    <CardDescription>{p.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <ul className="flex-1 space-y-1.5 text-sm">
                      {p.features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {f}
                        </li>
                      ))}
                    </ul>
                    {!current && can("billing:manage") && (p.tier === "PRO" || p.tier === "TEAM") && (
                      <Button className="mt-4" variant="outline" disabled={!data.provider.configured} loading={busy === p.tier} onClick={() => upgrade(p.tier as "PRO" | "TEAM")}>
                        Upgrade to {p.name}
                      </Button>
                    )}
                    {p.tier === "ENTERPRISE" && !current && (
                      <p className="mt-4 text-xs text-muted-foreground">Enterprise plans are arranged with your account team.</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
