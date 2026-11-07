"use client";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { ResourceListPage } from "@/components/resource-list";
import { RunStatusBadge } from "@/components/status";
import { formatDate } from "@/components/format";

interface Run {
  id: string;
  number: number;
  status: string;
  branch: string | null;
  commitSha: string | null;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  createdAt: string;
  project: { id: string; name: string };
}

export default function TestRunsPage() {
  return (
    <ResourceListPage<Run>
      title="Test runs"
      description="Every automated test execution across your projects."
      endpoint="/test-runs?pageSize=50"
      columns={[
        { header: "Run", cell: (r) => <span className="font-mono text-xs">#{r.number}</span> },
        { header: "Project", cell: (r) => <Link href={`/projects/${r.project.id}`} className="hover:underline">{r.project.name}</Link> },
        { header: "Status", cell: (r) => <RunStatusBadge status={r.status} /> },
        { header: "Branch", cell: (r) => r.branch ?? "—", className: "hidden md:table-cell" },
        { header: "Results", cell: (r) => `${r.passedTests}/${r.totalTests} passed`, className: "hidden sm:table-cell" },
        { header: "Started", cell: (r) => formatDate(r.createdAt), className: "hidden lg:table-cell" },
      ]}
      empty={{
        icon: FlaskConical,
        title: "No test runs yet",
        description: "Test runs appear here once a project has a connected repository and the execution engine runs its tests.",
      }}
      phase={{ label: "Phase 3–4", note: "AI test planning and Playwright execution are in development." }}
    />
  );
}
