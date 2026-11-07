"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Bug,
  FlaskConical,
  GitBranch,
  Github,
  Globe,
  KeyRound,
  ListChecks,
  Lock,
  Play,
  RotateCcw,
  Trash2,
  Variable,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  cn,
} from "@testpilot/ui";
import { VIEWPORTS, type ProjectDTO, type SecretDTO, type TestSettings, type ViewportId } from "@testpilot/shared";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { useToast } from "@/components/toaster";
import { formatDate, relativeTime } from "@/components/format";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, error, mutate } = useApi<ProjectDTO>(`/projects/${id}`);

  if (error) {
    return (
      <EmptyState
        title={error instanceof ApiClientError && error.status === 404 ? "Project not found" : "Could not load project"}
        description="It may have been deleted, or you may not have access to it."
        action={
          <Button asChild variant="outline">
            <Link href="/projects">Back to projects</Link>
          </Button>
        }
      />
    );
  }
  if (!project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <>
      <Link href="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Projects
      </Link>
      <ProjectHeader project={project} />
      {project.status === "ARCHIVED" && (
        <Alert variant="warning" className="mb-6">
          <AlertDescription>This project is archived. It is read-only and cannot be tested until it is restored.</AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="environment">Environment</TabsTrigger>
          <TabsTrigger value="credentials">Test credentials</TabsTrigger>
          <TabsTrigger value="danger">Advanced</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Overview project={project} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab project={project} onSaved={(p) => mutate(p, { revalidate: false })} />
        </TabsContent>
        <TabsContent value="environment">
          <SecretsTab project={project} kind="ENV_VAR" />
        </TabsContent>
        <TabsContent value="credentials">
          <SecretsTab project={project} kind="TEST_CREDENTIAL" />
        </TabsContent>
        <TabsContent value="danger">
          <DangerTab project={project} onChanged={(p) => mutate(p, { revalidate: false })} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ProjectHeader({ project }: { project: ProjectDTO }) {
  const { can } = useSession();
  const [runResult, setRunResult] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);

  async function startRun() {
    setStarting(true);
    try {
      await api.post("/test-runs", { projectId: project.id });
    } catch (err) {
      setRunResult(errorMessage(err));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-sm font-semibold">
          {project.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight" data-testid="project-name">
              {project.name}
            </h1>
            {project.status === "ARCHIVED" && <Badge variant="secondary">Archived</Badge>}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {project.workspace.name} · created by {project.createdBy.name} {relativeTime(project.createdAt)}
          </p>
        </div>
      </div>
      {can("testruns:create") && (
        <Button onClick={startRun} loading={starting} disabled={project.status === "ARCHIVED"}>
          <Play /> Start test run
        </Button>
      )}
      <Dialog open={runResult !== null} onOpenChange={(o) => !o && setRunResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Test execution not available yet</DialogTitle>
            <DialogDescription>{runResult}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The repository analysis, AI test planning and Playwright execution pipeline are being delivered in upcoming phases.
            Your project configuration is saved and will be used as soon as execution is enabled.
          </p>
          <DialogFooter>
            <Button onClick={() => setRunResult(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Overview({ project }: { project: ProjectDTO }) {
  const stats = [
    { label: "Test runs", value: project.stats.testRuns, icon: FlaskConical },
    { label: "Test cases", value: project.stats.testCases, icon: ListChecks },
    { label: "Open bugs", value: project.stats.openBugs, icon: Bug },
    { label: "Last run", value: project.stats.lastRunAt ? relativeTime(project.stats.lastRunAt) : "Never", icon: Play },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                {s.label}
                <s.icon className="size-4" />
              </div>
              <p className="mt-2 text-xl font-semibold tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Description</dt>
                <dd className="mt-1">{project.description || <span className="text-muted-foreground">—</span>}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Application URL</dt>
                <dd className="mt-1 flex items-center gap-1.5">
                  <Globe className="size-3.5 text-muted-foreground" />
                  {project.appUrl ? (
                    <a href={project.appUrl} target="_blank" rel="noreferrer noopener" className="truncate underline-offset-4 hover:underline">
                      {project.appUrl}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Not configured</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Default branch</dt>
                <dd className="mt-1 flex items-center gap-1.5">
                  <GitBranch className="size-3.5 text-muted-foreground" />
                  {project.defaultBranch || <span className="text-muted-foreground">Not set</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Viewports</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {project.testSettings.viewports.map((v) => (
                    <Badge key={v} variant="outline">
                      {VIEWPORTS.find((x) => x.id === v)?.label ?? v}
                    </Badge>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Created</dt>
                <dd className="mt-1">{formatDate(project.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last updated</dt>
                <dd className="mt-1">{formatDate(project.updatedAt)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Repository</CardTitle>
            <CardDescription>Source code TestPilot analyzes to understand your app.</CardDescription>
          </CardHeader>
          <CardContent>
            {project.repository ? (
              <a href={project.repository.htmlUrl} className="flex items-center gap-2 text-sm hover:underline" target="_blank" rel="noreferrer noopener">
                <Github className="size-4" /> {project.repository.fullName}
              </a>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No repository connected.</p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/integrations">
                    <Github /> Connect GitHub
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Testing history</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={FlaskConical} title="No test runs yet" description="Runs for this project will be listed here with their results and evidence." className="py-10" />
        </CardContent>
      </Card>
    </div>
  );
}

const CATEGORY_LABELS: Record<TestSettings["categories"][number], string> = {
  FUNCTIONAL: "Functional",
  UI_UX: "UI / UX",
  NEGATIVE: "Negative",
  ACCESSIBILITY: "Accessibility",
  PERFORMANCE: "Performance",
  RESPONSIVE: "Responsive",
};

function SettingsTab({ project, onSaved }: { project: ProjectDTO; onSaved: (p: ProjectDTO) => void }) {
  const { can } = useSession();
  const toast = useToast();
  const editable = can("projects:update") && project.status === "ACTIVE";
  const [form, setForm] = React.useState({
    name: project.name,
    description: project.description ?? "",
    appUrl: project.appUrl ?? "",
    defaultBranch: project.defaultBranch ?? "",
  });
  const [settings, setSettings] = React.useState<TestSettings>(project.testSettings);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  function toggle<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const updated = await api.patch<ProjectDTO>(`/projects/${project.id}`, {
        name: form.name,
        description: form.description || null,
        appUrl: form.appUrl.trim() || null,
        defaultBranch: form.defaultBranch.trim() || null,
        testSettings: settings,
      });
      onSaved(updated);
      toast({ title: "Project saved", variant: "success" });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "VALIDATION_FAILED") {
        const fe = err.fieldErrors;
        setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k.replace(/^testSettings\./, ""), v])));
      } else toast({ title: "Could not save project", description: errorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="Project name" htmlFor="p-name" error={errors.name}>
            <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!editable} />
          </Field>
          <Field label="Default branch" htmlFor="p-branch" error={errors.defaultBranch}>
            <Input id="p-branch" value={form.defaultBranch} onChange={(e) => setForm({ ...form, defaultBranch: e.target.value })} placeholder="main" disabled={!editable} />
          </Field>
          <Field label="Application URL" htmlFor="p-url" error={errors.appUrl} className="sm:col-span-2">
            <Input id="p-url" type="url" value={form.appUrl} onChange={(e) => setForm({ ...form, appUrl: e.target.value })} placeholder="https://staging.example.com" disabled={!editable} />
          </Field>
          <Field label="Description" htmlFor="p-desc" error={errors.description} className="sm:col-span-2">
            <Textarea id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} disabled={!editable} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test configuration</CardTitle>
          <CardDescription>Used by the AI test planner and browser workers when execution is enabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Viewports</legend>
            <div className="flex flex-wrap gap-2">
              {VIEWPORTS.map((v) => {
                const on = settings.viewports.includes(v.id);
                return (
                  <button
                    type="button"
                    key={v.id}
                    disabled={!editable}
                    aria-pressed={on}
                    onClick={() => setSettings({ ...settings, viewports: toggle<ViewportId>(settings.viewports, v.id) })}
                    className={cn("rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:opacity-60", on ? "border-foreground bg-accent" : "border-border text-muted-foreground hover:border-foreground/30")}
                  >
                    <span className="block font-medium text-foreground">{v.label}</span>
                    {v.width} × {v.height}
                  </button>
                );
              })}
            </div>
            {errors.viewports && <p className="mt-1 text-xs text-destructive">Select at least one viewport.</p>}
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Test categories</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((c) => {
                const on = settings.categories.includes(c);
                return (
                  <button
                    type="button"
                    key={c}
                    disabled={!editable}
                    aria-pressed={on}
                    onClick={() => setSettings({ ...settings, categories: toggle(settings.categories, c) })}
                    className={cn("rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-60", on ? "border-foreground bg-accent font-medium" : "border-border text-muted-foreground hover:border-foreground/30")}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                );
              })}
            </div>
            {errors.categories && <p className="mt-1 text-xs text-destructive">Select at least one category.</p>}
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Max pages to explore" htmlFor="p-maxpages" error={errors.maxPages}>
              <Input id="p-maxpages" type="number" min={1} max={500} value={settings.maxPages} onChange={(e) => setSettings({ ...settings, maxPages: Number(e.target.value) })} disabled={!editable} />
            </Field>
            <Field label="Per-test timeout (seconds)" htmlFor="p-timeout" error={errors.testTimeoutSeconds}>
              <Input id="p-timeout" type="number" min={5} max={600} value={settings.testTimeoutSeconds} onChange={(e) => setSettings({ ...settings, testTimeoutSeconds: Number(e.target.value) })} disabled={!editable} />
            </Field>
          </div>
          <div className="space-y-3">
            {(
              [
                ["recordVideo", "Record video of each test execution"],
                ["runOnPush", "Run tests on every push to the default branch"],
                ["runOnPullRequest", "Run tests on pull requests"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-4 text-sm">
                <span>{label}</span>
                <Switch checked={settings[key]} onCheckedChange={(v) => setSettings({ ...settings, [key]: v })} disabled={!editable} aria-label={label} />
              </label>
            ))}
          </div>
        </CardContent>
        {editable && (
          <CardFooter className="justify-end">
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </CardFooter>
        )}
      </Card>
    </form>
  );
}

function SecretsTab({ project, kind }: { project: ProjectDTO; kind: SecretDTO["kind"] }) {
  const { can } = useSession();
  const toast = useToast();
  const canRead = can("secrets:read-metadata");
  const canManage = can("secrets:manage") && project.status === "ACTIVE";
  const { data, mutate } = useApi<{ data: SecretDTO[] }>(canRead ? `/projects/${project.id}/secrets` : null);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SecretDTO | null>(null);
  const [form, setForm] = React.useState({ key: "", value: "", description: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const isEnv = kind === "ENV_VAR";
  const rows = data?.data.filter((s) => s.kind === kind) ?? [];

  function openEditor(secret?: SecretDTO) {
    setEditing(secret ?? null);
    setForm({ key: secret?.key ?? "", value: "", description: secret?.description ?? "" });
    setErrors({});
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/projects/${project.id}/secrets`, { kind, key: form.key, value: form.value, description: form.description || null });
      await mutate();
      setOpen(false);
      toast({ title: `${isEnv ? "Variable" : "Credential"} saved`, description: "The value is encrypted and can no longer be viewed.", variant: "success" });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "VALIDATION_FAILED") setErrors(err.fieldErrors);
      else toast({ title: "Could not save", description: errorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(secret: SecretDTO) {
    if (!window.confirm(`Delete ${secret.key}? This cannot be undone.`)) return;
    try {
      await api.delete(`/projects/${project.id}/secrets/${secret.id}`);
      await mutate();
      toast({ title: "Deleted", variant: "success" });
    } catch (err) {
      toast({ title: "Could not delete", description: errorMessage(err), variant: "error" });
    }
  }

  if (!canRead) {
    return (
      <Alert>
        <Lock />
        <AlertDescription>Your role cannot view project configuration secrets.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{isEnv ? "Environment variables" : "Test credentials"}</CardTitle>
          <CardDescription>
            {isEnv
              ? "Injected into the isolated test environment when your application is launched. Values are encrypted at rest and are never shown again."
              : "Accounts the AI agents use to sign in to your application under test (e.g. a staging test user). Encrypted at rest; never shown in logs, screenshots or reports."}
          </CardDescription>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => openEditor()}>
            {isEnv ? <Variable /> : <KeyRound />} Add
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={isEnv ? Variable : KeyRound}
            title={isEnv ? "No environment variables" : "No test credentials"}
            description={isEnv ? "Add variables your application needs to start, such as API base URLs." : "Add a username and password for a dedicated test account."}
            className="py-10"
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{isEnv ? "Key" : "Name"}</TH>
                <TH>Value</TH>
                <TH className="hidden sm:table-cell">Description</TH>
                <TH className="hidden sm:table-cell">Updated</TH>
                {canManage && <TH className="w-28" />}
              </TR>
            </THead>
            <TBody>
              {rows.map((s) => (
                <TR key={s.id}>
                  <TD className="font-mono text-xs">{s.key}</TD>
                  <TD className="font-mono text-xs text-muted-foreground">••••••••{s.hint ? ` ${s.hint}` : ""}</TD>
                  <TD className="hidden text-muted-foreground sm:table-cell">{s.description || "—"}</TD>
                  <TD className="hidden text-muted-foreground sm:table-cell">{relativeTime(s.updatedAt)}</TD>
                  {canManage && (
                    <TD className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEditor(s)}>
                        Replace
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(s)} aria-label={`Delete ${s.key}`}>
                        <Trash2 />
                      </Button>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={save} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{editing ? `Replace ${editing.key}` : isEnv ? "Add environment variable" : "Add test credential"}</DialogTitle>
              <DialogDescription>The value is encrypted with AES-256-GCM and is write-only.</DialogDescription>
            </DialogHeader>
            <Field label={isEnv ? "Key" : "Name"} htmlFor="s-key" error={errors.key}>
              <Input id="s-key" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder={isEnv ? "NEXT_PUBLIC_API_URL" : "Admin test user"} disabled={!!editing} className="font-mono" />
            </Field>
            <Field label={isEnv ? "Value" : "Secret (e.g. user@example.com:password)"} htmlFor="s-value" error={errors.value}>
              <Input id="s-value" type="password" autoComplete="off" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="font-mono" />
            </Field>
            <Field label="Description" htmlFor="s-desc" error={errors.description}>
              <Input id="s-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DangerTab({ project, onChanged }: { project: ProjectDTO; onChanged: (p: ProjectDTO) => void }) {
  const { can } = useSession();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");

  if (!can("projects:archive")) {
    return (
      <Alert>
        <Lock />
        <AlertDescription>Only owners and admins can archive or delete projects.</AlertDescription>
      </Alert>
    );
  }

  async function setStatus(status: "ACTIVE" | "ARCHIVED") {
    setBusy(status);
    try {
      const updated = await api.patch<ProjectDTO>(`/projects/${project.id}`, { status });
      onChanged(updated);
      toast({ title: status === "ARCHIVED" ? "Project archived" : "Project restored", variant: "success" });
    } catch (err) {
      toast({ title: "Action failed", description: errorMessage(err), variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function destroy() {
    setBusy("delete");
    try {
      await api.delete(`/projects/${project.id}`);
      toast({ title: "Project deleted", variant: "success" });
      router.push("/projects");
    } catch (err) {
      toast({ title: "Could not delete", description: errorMessage(err), variant: "error" });
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{project.status === "ACTIVE" ? "Archive project" : "Restore project"}</CardTitle>
          <CardDescription>
            {project.status === "ACTIVE"
              ? "Archived projects are read-only, keep their history, and do not count towards your plan's project limit."
              : "Restoring makes the project editable and testable again."}
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          {project.status === "ACTIVE" ? (
            <Button variant="outline" onClick={() => setStatus("ARCHIVED")} loading={busy === "ARCHIVED"}>
              <Archive /> Archive project
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setStatus("ACTIVE")} loading={busy === "ACTIVE"}>
              <RotateCcw /> Restore project
            </Button>
          )}
        </CardFooter>
      </Card>
      {project.status === "ARCHIVED" && can("projects:delete") && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Delete permanently</CardTitle>
            <CardDescription>Deletes the project, its secrets, test cases, runs, bugs and reports. This cannot be undone.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-end">
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 /> Delete project
            </Button>
          </CardFooter>
        </Card>
      )}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {project.name}?</DialogTitle>
            <DialogDescription>
              Type <span className="font-mono font-medium text-foreground">{project.slug}</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Confirm project slug" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={confirmText !== project.slug} loading={busy === "delete"} onClick={destroy}>
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
