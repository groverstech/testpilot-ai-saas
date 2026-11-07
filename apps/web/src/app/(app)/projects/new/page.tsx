"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Alert, AlertDescription, Button, Card, CardContent, CardFooter, Field, Input, NativeSelect, Textarea } from "@testpilot/ui";
import { createProjectSchema, type OrganizationDTO, type ProjectDTO } from "@testpilot/shared";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { PageHeader } from "@/components/page-header";

export default function NewProjectPage() {
  const router = useRouter();
  const { can } = useSession();
  const { data: org } = useApi<OrganizationDTO>("/organizations/current");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<{ message: string; upgrade?: boolean } | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const raw = {
      name: String(f.get("name") ?? ""),
      description: String(f.get("description") ?? "") || null,
      appUrl: String(f.get("appUrl") ?? "").trim() || null,
      defaultBranch: String(f.get("defaultBranch") ?? "").trim() || null,
      workspaceId: String(f.get("workspaceId") ?? "") || undefined,
    };
    const parsed = createProjectSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return setErrors(errs);
    }
    setErrors({});
    setError(null);
    setLoading(true);
    try {
      const project = await api.post<ProjectDTO>("/projects", parsed.data);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "VALIDATION_FAILED") setErrors(err.fieldErrors);
      else setError({ message: errorMessage(err), upgrade: err instanceof ApiClientError && err.code === "PLAN_LIMIT_REACHED" });
      setLoading(false);
    }
  }

  if (!can("projects:create")) {
    return (
      <Alert variant="warning">
        <AlertDescription>Only owners and admins can create projects.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Projects
      </Link>
      <PageHeader title="Create project" description="You can connect a GitHub repository after the project is created." />
      <Card>
        <form onSubmit={onSubmit} noValidate>
          <CardContent className="space-y-5 p-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  {error.message}{" "}
                  {error.upgrade && (
                    <Link href="/billing" className="font-medium underline">
                      View plans
                    </Link>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <Field label="Project name" htmlFor="name" error={errors.name}>
              <Input id="name" name="name" placeholder="Customer portal" autoFocus aria-invalid={!!errors.name} />
            </Field>
            <Field label="Description" htmlFor="description" error={errors.description}>
              <Textarea id="description" name="description" placeholder="What does this application do?" rows={3} />
            </Field>
            <Field label="Application URL" htmlFor="appUrl" error={errors.appUrl} hint="The deployed (staging or preview) URL TestPilot should test. Optional for now.">
              <Input id="appUrl" name="appUrl" type="url" placeholder="https://staging.example.com" aria-invalid={!!errors.appUrl} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Default branch" htmlFor="defaultBranch" error={errors.defaultBranch}>
                <Input id="defaultBranch" name="defaultBranch" placeholder="main" />
              </Field>
              <Field label="Workspace" htmlFor="workspaceId" error={errors.workspaceId}>
                <NativeSelect id="workspaceId" name="workspaceId" defaultValue="">
                  {org?.workspaces.map((w) => (
                    <option key={w.id} value={w.isDefault ? "" : w.id}>
                      {w.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Create project
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
