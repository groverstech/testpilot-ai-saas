"use client";
import { ListChecks } from "lucide-react";
import { Badge } from "@testpilot/ui";
import { ResourceListPage } from "@/components/resource-list";

interface TestCaseRow {
  id: string;
  key: string;
  name: string;
  category: string;
  priority: string;
}

export default function TestCasesPage() {
  return (
    <ResourceListPage<TestCaseRow>
      title="Test cases"
      description="Functional, UI/UX, negative, accessibility and performance tests generated for your applications."
      endpoint="/test-cases?pageSize=100"
      columns={[
        { header: "ID", cell: (t) => <span className="font-mono text-xs">{t.key}</span> },
        { header: "Name", cell: (t) => t.name },
        { header: "Category", cell: (t) => <Badge variant="outline">{t.category.replace("_", "/")}</Badge>, className: "hidden sm:table-cell" },
        { header: "Priority", cell: (t) => t.priority, className: "hidden md:table-cell" },
      ]}
      empty={{
        icon: ListChecks,
        title: "No test cases yet",
        description: "The Test Planning agent will generate test cases after exploring your application.",
      }}
      phase={{ label: "Phase 3", note: "Autonomous test planning is in development." }}
    />
  );
}
