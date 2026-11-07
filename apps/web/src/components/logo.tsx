import { cn } from "@testpilot/ui";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" className="fill-zinc-900 dark:fill-zinc-100" />
      <path d="M9 10h14M16 10v13" strokeWidth="2.6" strokeLinecap="round" className="stroke-white dark:stroke-zinc-900" />
      <circle cx="23" cy="22" r="3" className="fill-indigo-400 dark:fill-indigo-500" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span>TestPilot AI</span>
    </span>
  );
}
