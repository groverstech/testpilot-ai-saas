"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import {
  Avatar,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from "@testpilot/ui";
import { ROLE_LABELS } from "@testpilot/shared";
import { useSession } from "@/lib/session";
import { api } from "@/lib/api";
import { useToast } from "./toaster";
import { LogoMark } from "./logo";
import { NAV } from "./nav";

const COLLAPSE_KEY = "tp.sidebar.collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  React.useEffect(() => setMobileOpen(false), [pathname]);

  // Signed in but no organization yet → onboarding.
  React.useEffect(() => {
    if (session && session.organizations.length === 0) router.replace("/onboarding");
    else if (session && !session.activeOrganization && session.organizations[0]) {
      void api.post(`/organizations/${session.organizations[0].id}/switch`).then(() => window.location.reload());
    }
  }, [session, router]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  if (isLoading || !session || !session.activeOrganization) {
    return (
      <div className="flex min-h-dvh">
        <div className="hidden w-60 border-r border-border bg-sidebar p-4 md:block">
          <Skeleton className="h-8 w-full" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-6 h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex",
          collapsed ? "w-[60px]" : "w-60",
        )}
        aria-label="Main navigation"
      >
        <SidebarContent collapsed={collapsed} />
        <div className="border-t border-border p-2">
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && "Collapse"}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-sidebar shadow-xl">
            <button className="absolute right-3 top-3.5 rounded-md p-1 text-muted-foreground hover:text-foreground" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
              <X className="size-5" />
            </button>
            <SidebarContent collapsed={false} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
          <button className="rounded-md p-1.5 text-muted-foreground hover:bg-accent md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <ThemeMenu />
          <UserMenu />
        </header>
        <VerificationBanner />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  return (
    <>
      <div className={cn("flex h-14 items-center border-b border-border", collapsed ? "justify-center px-2" : "px-3")}>
        <OrgSwitcher collapsed={collapsed} />
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((section) => (
          <div key={section.label} className="mb-4">
            {!collapsed && <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{section.label}</p>}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        collapsed && "justify-center",
                        active ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}

function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { session, switchOrganization } = useSession();
  const router = useRouter();
  const toast = useToast();
  const active = session!.activeOrganization!;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn("flex min-w-0 items-center gap-2 rounded-md p-1.5 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", !collapsed && "w-full")}
        aria-label="Switch organization"
        data-testid="org-switcher"
      >
        <LogoMark className="size-6 shrink-0" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{active.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{ROLE_LABELS[active.role]}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {session!.organizations.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onSelect={() => {
              if (o.id !== active.id) {
                switchOrganization(o.id).catch(() => toast({ title: "Could not switch organization", variant: "error" }));
              }
            }}
          >
            <span className="flex-1 truncate">{o.name}</span>
            {o.id === active.id && <Check className="text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/onboarding")}>
          <Plus /> Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeMenu() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9rem]">
        <DropdownMenuItem onSelect={() => setTheme("light")}>
          <Sun /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("dark")}>
          <Moon /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme("system")}>
          <Monitor /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu() {
  const { session, logout } = useSession();
  const router = useRouter();
  const user = session!.user;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu" data-testid="user-menu">
        <Avatar name={user.name} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings")}>
          <UserRound /> Account settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function VerificationBanner() {
  const { session } = useSession();
  const toast = useToast();
  const [sending, setSending] = React.useState(false);
  if (!session || session.user.emailVerified) return null;
  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-900 md:px-6 dark:text-amber-200">
      Please verify <span className="font-medium">{session.user.email}</span> to invite team members.{" "}
      <button
        className="font-medium underline underline-offset-2 disabled:opacity-60"
        disabled={sending}
        onClick={async () => {
          setSending(true);
          try {
            await api.post("/auth/resend-verification");
            toast({ title: "Verification email sent", variant: "success" });
          } catch {
            toast({ title: "Could not send email", description: "Please try again in a minute.", variant: "error" });
          } finally {
            setSending(false);
          }
        }}
      >
        Resend email
      </button>
    </div>
  );
}
