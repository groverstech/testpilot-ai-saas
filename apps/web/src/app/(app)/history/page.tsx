"use client";
import { History } from "lucide-react";
import { EmptyState } from "@testpilot/ui";
import { PageHeader, PhaseNote } from "@/components/page-header";

export default function HistoryPage() {
  return (
    <>
      <PageHeader title="Test history" description="Regressions, newly introduced and resolved bugs across commits." />
      <EmptyState icon={History} title="No history yet" description="Once runs exist, TestPilot compares each run with the previous one to highlight regressions and fixes." />
      <PhaseNote phase="Phase 6">Commit comparison and regression tracking are planned.</PhaseNote>
    </>
  );
}
