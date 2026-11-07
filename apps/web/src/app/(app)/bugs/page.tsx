"use client";
import { Bug } from "lucide-react";
import { Badge } from "@testpilot/ui";
import { ResourceListPage } from "@/components/resource-list";
import { SeverityBadge } from "@/components/status";
import { relativeTime } from "@/components/format";

interface BugRow {
  id: string;
  key: string;
  title: string;
  severity: string;
  status: string;
  affectedPage: string | null;
  createdAt: string;
}

export default function BugsPage() {
  return (
    <ResourceListPage<BugRow>
      title="Bug reports"
      description="Confirmed defects with reproduction steps, evidence and suggested fixes."
      endpoint="/bugs?pageSize=100"
      columns={[
        { header: "ID", cell: (b) => <span className="font-mono text-xs">{b.key}</span> },
        { header: "Title", cell: (b) => b.title },
        { header: "Severity", cell: (b) => <SeverityBadge severity={b.severity} /> },
        { header: "Status", cell: (b) => <Badge variant="outline">{b.status.toLowerCase().replace("_", " ")}</Badge>, className: "hidden sm:table-cell" },
        { header: "Found", cell: (b) => relativeTime(b.createdAt), className: "hidden md:table-cell" },
      ]}
      empty={{
        icon: Bug,
        title: "No bugs reported",
        description: "Bugs are only recorded when a test execution produces evidence. Speculative issues are never reported as confirmed bugs.",
      }}
      phase={{ label: "Phase 5", note: "AI bug analysis is in development." }}
    />
  );
}
