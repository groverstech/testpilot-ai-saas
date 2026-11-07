import { cn } from "@testpilot/ui";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PhaseNote({ phase, children }: { phase: string; children: React.ReactNode }) {
  return (
    <p className="mt-4 text-center text-xs text-muted-foreground">
      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">{phase}</span>{" "}
      {children}
    </p>
  );
}
