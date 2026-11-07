"use client";
import { Bot, Compass, FileText, Images, ListChecks, Play, ScanSearch, Bug } from "lucide-react";
import { Badge, Card, CardContent } from "@testpilot/ui";
import { PageHeader } from "@/components/page-header";

const AGENTS = [
  { name: "Repository Analyst", icon: ScanSearch, phase: "Phase 2", text: "Understands your codebase: framework, routes, components and how to start the app." },
  { name: "Application Explorer", icon: Compass, phase: "Phase 3", text: "Opens a real browser and maps pages, forms, menus and user journeys." },
  { name: "Test Planner", icon: ListChecks, phase: "Phase 3", text: "Generates functional, UI/UX, negative, accessibility and performance test cases." },
  { name: "Test Executor", icon: Play, phase: "Phase 4", text: "Runs tests with Playwright across five viewports, capturing screenshots, video, console and network logs." },
  { name: "Visual QA", icon: Images, phase: "Phase 5", text: "Analyzes screenshots for overlap, overflow, alignment and responsive defects." },
  { name: "Bug Analyst", icon: Bug, phase: "Phase 5", text: "Turns failures into reproducible, evidence-backed bug reports with suggested fixes." },
  { name: "Reporter", icon: FileText, phase: "Phase 5", text: "Consolidates results into professional HTML and PDF QA reports." },
];

export default function AgentsPage() {
  return (
    <>
      <PageHeader title="AI agents" description="The autonomous agents that collaborate on every test run. Agent activity for each run will be traced here." />
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((a) => (
          <li key={a.name}>
            <Card className="h-full">
              <CardContent className="flex gap-3 p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                  <a.icon className="size-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{a.name}</h2>
                    <Badge variant="secondary">{a.phase}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{a.text}</p>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Bot className="size-3.5" /> No agent executions have been recorded for this organization.
      </p>
    </>
  );
}
