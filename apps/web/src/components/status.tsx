import { Badge } from "@testpilot/ui";

const RUN_VARIANTS: Record<string, "success" | "danger" | "warning" | "info" | "secondary"> = {
  PASSED: "success",
  FAILED: "danger",
  ERROR: "danger",
  BLOCKED: "warning",
  RUNNING: "info",
  PREPARING: "info",
  QUEUED: "secondary",
  CANCELLED: "secondary",
};

export function RunStatusBadge({ status }: { status: string }) {
  return <Badge variant={RUN_VARIANTS[status] ?? "secondary"}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

const SEVERITY_VARIANTS: Record<string, "danger" | "warning" | "info" | "secondary"> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "info",
};

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge variant={SEVERITY_VARIANTS[severity] ?? "secondary"}>{severity.charAt(0) + severity.slice(1).toLowerCase()}</Badge>;
}
