"use client";
import { Images } from "lucide-react";
import { EmptyState } from "@testpilot/ui";
import { PageHeader, PhaseNote } from "@/components/page-header";

export default function VisualQaPage() {
  return (
    <>
      <PageHeader title="Visual QA" description="Screenshot evidence, annotated defects and side-by-side viewport comparisons." />
      <EmptyState
        icon={Images}
        title="No screenshots captured yet"
        description="Screenshots from every test step, failure and viewport will appear in this gallery, with annotations for detected visual defects."
      />
      <PhaseNote phase="Phase 4–5">Screenshot capture and visual analysis are in development.</PhaseNote>
    </>
  );
}
