"use client";
import Link from "next/link";
import { GitBranch, Github, Lock } from "lucide-react";
import { Badge, Button } from "@testpilot/ui";
import { useApi } from "@/lib/use-api";
import { ResourceListPage } from "@/components/resource-list";

interface RepoRow {
  id: string;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  htmlUrl: string;
}

export default function RepositoriesPage() {
  const { data: status } = useApi<{ configured: boolean; missing: string[] }>("/github/status");
  return (
    <>
      <ResourceListPage<RepoRow>
        title="Repositories"
        description="GitHub repositories connected to this organization."
        endpoint="/github/repositories"
        columns={[
          {
            header: "Repository",
            cell: (r) => (
              <a href={r.htmlUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 hover:underline">
                <Github className="size-4" /> {r.fullName}
              </a>
            ),
          },
          { header: "Visibility", cell: (r) => (r.isPrivate ? <Badge variant="outline"><Lock className="size-3" /> Private</Badge> : <Badge variant="outline">Public</Badge>) },
          { header: "Default branch", cell: (r) => <span className="font-mono text-xs">{r.defaultBranch}</span> },
        ]}
        empty={{
          icon: GitBranch,
          title: "No repositories connected",
          description: (
            <>
              {status && !status.configured
                ? "The GitHub App is not configured on this deployment yet."
                : "Install the TestPilot GitHub App to give read-only access to the repositories you choose."}
              <div className="mt-4">
                <Button asChild variant="outline" size="sm">
                  <Link href="/integrations">
                    <Github /> Go to integrations
                  </Link>
                </Button>
              </div>
            </>
          ),
        }}
        phase={{ label: "Phase 2", note: "GitHub App installation, repository listing and analysis are next." }}
      />
    </>
  );
}
