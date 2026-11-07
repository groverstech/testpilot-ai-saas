"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@testpilot/ui";

const LINKS = [
  { href: "/settings", label: "Account" },
  { href: "/settings/organization", label: "Organization" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Settings sections">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={pathname === l.href ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            pathname === l.href ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
