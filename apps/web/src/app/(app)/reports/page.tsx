"use client";
import { FileText } from "lucide-react";
import { ResourceListPage } from "@/components/resource-list";
import { formatDate } from "@/components/format";

interface ReportRow {
  id: string;
  format: string;
  createdAt: string;
}

export default function ReportsPage() {
  return (
    <ResourceListPage<ReportRow>
      title="Reports"
      description="Downloadable HTML and PDF QA reports for completed test runs."
      endpoint="/reports?pageSize=50"
      columns={[
        { header: "Format", cell: (r) => r.format },
        { header: "Created", cell: (r) => formatDate(r.createdAt) },
      ]}
      empty={{
        icon: FileText,
        title: "No reports yet",
        description: "A QA report with an executive summary, results, screenshots and recommendations is generated after each completed run.",
      }}
      phase={{ label: "Phase 5", note: "Report generation is in development." }}
    />
  );
}
