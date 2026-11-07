"use client";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, EmptyState, Skeleton } from "@testpilot/ui";
import type { DashboardDTO } from "@testpilot/shared";
import { useApi } from "@/lib/use-api";
import { PageHeader } from "@/components/page-header";

export default function AnalyticsPage() {
  const { data } = useApi<DashboardDTO>("/dashboard");
  return (
    <>
      <PageHeader title="Analytics" description="Quality trends across projects, test categories and viewports." />
      {!data ? (
        <Skeleton className="h-48" />
      ) : data.totals.testRuns === 0 ? (
        <EmptyState icon={BarChart3} title="Not enough data yet" description="Analytics are computed from completed test runs. Run your first tests to see failure rates, flaky tests and quality trends." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Test runs", data.totals.testRuns],
            ["Success rate", data.totals.successRate === null ? "—" : `${data.totals.successRate}%`],
            ["Open bugs", data.totals.openBugs],
          ].map(([label, value]) => (
            <Card key={String(label)}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
