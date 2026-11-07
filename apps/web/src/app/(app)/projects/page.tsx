"use client";
import * as React from "react";
import Link from "next/link";
import { Archive, FolderKanban, Globe, Plus, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Skeleton, cn } from "@testpilot/ui";
import type { Paginated, ProjectDTO } from "@testpilot/shared";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { relativeTime } from "@/components/format";

type StatusFilter = "ACTIVE" | "ARCHIVED";

export default function ProjectsPage() {
  const { can } = useSession();
  const [status, setStatus] = React.useState<StatusFilter>("ACTIVE");
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ status, page: String(page), pageSize: "12", ...(debounced ? { search: debounced } : {}) });
  const { data, isLoading } = useApi<Paginated<ProjectDTO>>(`/projects?${qs}`, { keepPreviousData: true });

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project represents a web application under test."
        actions={
          can("projects:create") && (
            <Button asChild>
              <Link href="/projects/new">
                <Plus /> New project
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-border p-0.5" role="tablist" aria-label="Project status">
          {(["ACTIVE", "ARCHIVED"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={status === s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
              className={cn("rounded-md px-3 py-1 text-sm transition-colors", status === s ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              {s === "ACTIVE" ? "Active" : "Archived"}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects…" className="pl-8" aria-label="Search projects" />
        </div>
      </div>

      {isLoading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : data && data.data.length === 0 ? (
        debounced ? (
          <EmptyState icon={Search} title="No matching projects" description={`Nothing matches “${debounced}”.`} />
        ) : status === "ARCHIVED" ? (
          <EmptyState icon={Archive} title="No archived projects" description="Archived projects keep their history but stop counting towards your plan." />
        ) : (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            description="Create a project for the web application you want TestPilot AI to test."
            action={
              can("projects:create") && (
                <Button asChild>
                  <Link href="/projects/new">
                    <Plus /> Create project
                  </Link>
                </Button>
              )
            }
          />
        )
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="project-list">
            {data?.data.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="flex h-full flex-col p-4 transition-colors hover:border-foreground/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-xs font-semibold">
                          {p.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate font-medium">{p.name}</span>
                      </div>
                      {p.status === "ARCHIVED" && <Badge variant="secondary">Archived</Badge>}
                    </div>
                    <p className="mt-3 line-clamp-2 flex-1 text-sm text-muted-foreground">{p.description || "No description"}</p>
                    <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        <Globe className="size-3.5 shrink-0" />
                        <span className="truncate">{p.appUrl ? new URL(p.appUrl).host : "No URL configured"}</span>
                      </span>
                      <span className="shrink-0">Updated {relativeTime(p.updatedAt)}</span>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          {data && data.pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {data.pagination.page} of {data.pagination.totalPages} · {data.pagination.total} projects
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
