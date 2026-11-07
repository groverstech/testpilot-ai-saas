"use client";
import Link from "next/link";
import {
  Activity,
  AlertOctagon,
  Bug,
  CheckCircle2,
  FlaskConical,
  FolderKanban,
  Gauge,
  GitBranch,
  ImageIcon,
  Plus,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Skeleton } from "@testpilot/ui";
import type { DashboardDTO } from "@testpilot/shared";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/page-header";
import { describeAction, relativeTime } from "@/components/format";
import { RunStatusBadge } from "@/components/status";

function Stat({ label, value, icon: Icon, hint }: { label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string }>; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { session, can } = useSession();
  const { data, isLoading } = useApi<DashboardDTO>("/dashboard");

  const firstName = session?.user.name.split(" ")[0];
  const noProjects = data && data.totals.projects === 0;
  const noRuns = data && data.totals.testRuns === 0;

  return (
    <>
      <PageHeader
        title={`Good to see you${firstName ? `, ${firstName}` : ""}`}
        description={`Quality overview for ${session?.activeOrganization?.name ?? "your organization"}`}
        actions={
          can("projects:create") && (
            <Button asChild>
              <Link href="/projects/new">
                <Plus /> New project
              </Link>
            </Button>
          )
        }
      />

      {isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px]" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="dashboard-stats">
            <Stat label="Projects" value={data.totals.projects} icon={FolderKanban} />
            <Stat label="Test executions" value={data.totals.testRuns} icon={FlaskConical} />
            <Stat label="Passed tests" value={data.totals.passedTests} icon={CheckCircle2} />
            <Stat label="Failed tests" value={data.totals.failedTests} icon={XCircle} />
            <Stat label="Blocked tests" value={data.totals.blockedTests} icon={AlertOctagon} />
            <Stat label="Success rate" value={data.totals.successRate === null ? "—" : `${data.totals.successRate}%`} icon={Gauge} hint={data.totals.successRate === null ? "No completed runs yet" : undefined} />
            <Stat label="Open bugs" value={data.totals.openBugs} icon={Bug} />
            <Stat label="Critical bugs" value={data.totals.criticalBugs} icon={ShieldAlert} />
          </div>

          {noProjects && (
            <Card className="overflow-hidden">
              <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <h2 className="text-base font-semibold">Get started with TestPilot AI</h2>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    Create a project for the application you want to test. Next, you will connect its GitHub repository and let the
                    AI agents discover, plan and execute tests.
                  </p>
                  <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                    {[
                      ["1", "Create a project", true],
                      ["2", "Connect GitHub", false],
                      ["3", "Run AI tests", false],
                    ].map(([n, label, now]) => (
                      <li key={String(n)} className="flex items-center gap-2">
                        <span className={`flex size-6 items-center justify-center rounded-full border text-xs ${now ? "border-foreground font-semibold" : "border-border text-muted-foreground"}`}>{n}</span>
                        <span className={now ? "font-medium" : "text-muted-foreground"}>{label}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                {can("projects:create") && (
                  <Button asChild size="lg">
                    <Link href="/projects/new">
                      <Plus /> Create your first project
                    </Link>
                  </Button>
                )}
              </div>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Execution trend</CardTitle>
                <CardDescription>Passed vs failed tests over the last 14 days</CardDescription>
              </CardHeader>
              <CardContent>
                {data.trend.length === 0 ? (
                  <EmptyState icon={Activity} title="No test executions yet" description="Trends appear here once test runs complete." className="py-10" />
                ) : (
                  <TrendChart trend={data.trend} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Project quality</CardTitle>
                <CardDescription>Pass rate across recent runs</CardDescription>
              </CardHeader>
              <CardContent>
                {data.projectQuality.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No projects yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {data.projectQuality.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 text-sm">
                        <Link href={`/projects/${p.id}`} className="min-w-0 flex-1 truncate hover:underline">
                          {p.name}
                        </Link>
                        {p.score === null ? (
                          <span className="text-xs text-muted-foreground">Not tested</span>
                        ) : (
                          <Badge variant={p.score >= 90 ? "success" : p.score >= 70 ? "warning" : "danger"}>{p.score}%</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Recent test runs</CardTitle>
              </CardHeader>
              <CardContent>
                {noRuns ? (
                  <EmptyState icon={FlaskConical} title="No test runs" description="Runs start once a repository is connected." className="py-8" />
                ) : (
                  <ul className="space-y-2">
                    {data.recentRuns.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">
                          {r.project.name} <span className="text-muted-foreground">#{r.number}</span>
                        </span>
                        <RunStatusBadge status={r.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Recent screenshots</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState icon={ImageIcon} title="No screenshots yet" description="Evidence captured during test runs appears here." className="py-8" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentActivity.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <ul className="space-y-3" data-testid="activity-feed">
                    {data.recentActivity.map((a) => (
                      <li key={a.id} className="flex gap-2.5 text-sm">
                        <GitBranch className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{a.actor ?? "System"}</span> <span className="text-muted-foreground">{describeAction(a.action)}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(a.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function TrendChart({ trend }: { trend: DashboardDTO["trend"] }) {
  const max = Math.max(1, ...trend.map((t) => t.passed + t.failed));
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Passed and failed tests per day">
        {trend.map((t) => (
          <div key={t.date} className="flex h-full flex-1 flex-col justify-end" title={`${t.date}: ${t.passed} passed, ${t.failed} failed`}>
            <div className="w-full rounded-t-sm bg-red-500/70" style={{ height: `${(t.failed / max) * 100}%` }} />
            <div className="w-full bg-emerald-500/70" style={{ height: `${(t.passed / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>{trend[0]?.date}</span>
        <span>{trend.at(-1)?.date}</span>
      </div>
    </div>
  );
}
