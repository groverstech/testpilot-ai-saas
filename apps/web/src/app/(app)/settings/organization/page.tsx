"use client";
import * as React from "react";
import { Lock, Plus } from "lucide-react";
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
  Field,
  Input,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@testpilot/ui";
import type { AuditLogDTO, OrganizationDTO, Paginated } from "@testpilot/shared";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { useToast } from "@/components/toaster";
import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { describeAction, formatDate } from "@/components/format";

export default function OrganizationSettingsPage() {
  const { can, refresh } = useSession();
  const toast = useToast();
  const { data: org, mutate } = useApi<OrganizationDTO>("/organizations/current");
  const audit = useApi<Paginated<AuditLogDTO>>(can("audit:read") ? "/audit-logs?pageSize=25" : null);
  const [form, setForm] = React.useState<{ name: string; slug: string } | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [wsName, setWsName] = React.useState("");
  const [wsSaving, setWsSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (org && !form) setForm({ name: org.name, slug: org.slug });
  }, [org, form]);

  const editable = can("org:update");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setErrors({});
    try {
      const updated = await api.patch<OrganizationDTO>("/organizations/current", form);
      await mutate(updated, { revalidate: false });
      await refresh();
      toast({ title: "Organization updated", variant: "success" });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "VALIDATION_FAILED") setErrors(err.fieldErrors);
      else if (err instanceof ApiClientError && err.code === "SLUG_TAKEN") setErrors({ slug: err.message });
      else toast({ title: "Could not save", description: errorMessage(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function addWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setWsSaving(true);
    try {
      await api.post("/organizations/current/workspaces", { name: wsName });
      setWsName("");
      await mutate();
      toast({ title: "Workspace created", variant: "success" });
    } catch (err) {
      toast({ title: "Could not create workspace", description: errorMessage(err), variant: "error" });
    } finally {
      setWsSaving(false);
    }
  }

  async function destroy() {
    setDeleting(true);
    try {
      await api.delete("/organizations/current", { confirm });
      window.location.href = "/dashboard";
    } catch (err) {
      toast({ title: "Could not delete organization", description: errorMessage(err), variant: "error" });
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav />
      <div className="max-w-3xl space-y-6">
        {!form ? (
          <Skeleton className="h-48 w-full" />
        ) : (
        <Card>
          <form onSubmit={save} noValidate>
            <CardHeader>
              <CardTitle>General</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Organization name" htmlFor="org-name" error={errors.name}>
                <Input id="org-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!editable} />
              </Field>
              <Field label="URL slug" htmlFor="org-slug" error={errors.slug}>
                <Input id="org-slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })} disabled={!editable} className="font-mono" />
              </Field>
            </CardContent>
            {editable && (
              <CardFooter className="justify-end">
                <Button type="submit" loading={saving}>
                  Save
                </Button>
              </CardFooter>
            )}
          </form>
        </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
            <CardDescription>Group related projects. Every organization has a default workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="flex flex-wrap gap-2" data-testid="workspace-list">
              {org?.workspaces.map((w) => (
                <li key={w.id}>
                  <Badge variant="outline" className="px-2.5 py-1 text-sm">
                    {w.name} {w.isDefault && <span className="text-muted-foreground">(default)</span>}
                  </Badge>
                </li>
              ))}
            </ul>
            {can("workspaces:manage") && (
              <form onSubmit={addWorkspace} className="flex gap-2">
                <Input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="New workspace name" aria-label="New workspace name" />
                <Button type="submit" variant="outline" loading={wsSaving} disabled={wsName.trim().length < 2}>
                  <Plus /> Add
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
            <CardDescription>Security-relevant activity in this organization.</CardDescription>
          </CardHeader>
          <CardContent>
            {!can("audit:read") ? (
              <Alert>
                <Lock />
                <AlertDescription>Only owners and admins can view the audit log.</AlertDescription>
              </Alert>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Actor</TH>
                    <TH>Action</TH>
                  </TR>
                </THead>
                <TBody>
                  {audit.data?.data.map((a) => (
                    <TR key={a.id}>
                      <TD className="whitespace-nowrap text-muted-foreground">{formatDate(a.createdAt)}</TD>
                      <TD>{a.actor?.name ?? "System"}</TD>
                      <TD>
                        {describeAction(a.action)} <span className="font-mono text-xs text-muted-foreground">{a.action}</span>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {can("org:delete") && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-destructive">Delete organization</CardTitle>
              <CardDescription>Permanently deletes the organization, all projects, test data and member access.</CardDescription>
            </CardHeader>
            <CardFooter className="justify-end">
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                Delete organization
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {org?.name}?</DialogTitle>
            <DialogDescription>
              This cannot be undone. Type <span className="font-mono font-medium text-foreground">{org?.slug}</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirm organization slug" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={confirm !== org?.slug} loading={deleting} onClick={destroy}>
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
