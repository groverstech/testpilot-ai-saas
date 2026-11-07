"use client";
import * as React from "react";
import { Laptop } from "lucide-react";
import { Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, Input } from "@testpilot/ui";
import { passwordSchema } from "@testpilot/shared";
import useSWR from "swr";
import { api, ApiClientError, errorMessage, fetcher } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useToast } from "@/components/toaster";
import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "@/components/settings-nav";
import { relativeTime } from "@/components/format";

interface SessionRow {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default function AccountSettingsPage() {
  const { session, refresh } = useSession();
  const toast = useToast();
  const [name, setName] = React.useState(session!.user.name);
  const [savingName, setSavingName] = React.useState(false);
  const [pw, setPw] = React.useState({ current: "", next: "" });
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [savingPw, setSavingPw] = React.useState(false);
  const sessions = useSWR<{ data: SessionRow[] }>("/me/sessions", fetcher);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    try {
      await api.patch("/me", { name });
      await refresh();
      toast({ title: "Profile updated", variant: "success" });
    } catch (err) {
      toast({ title: "Could not update profile", description: errorMessage(err), variant: "error" });
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(pw.next);
    if (!parsed.success) return setPwError(parsed.error.issues[0]!.message);
    setPwError(null);
    setSavingPw(true);
    try {
      await api.post("/me/password", { currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: "", next: "" });
      await sessions.mutate();
      toast({ title: "Password changed", description: "Other sessions were signed out.", variant: "success" });
    } catch (err) {
      setPwError(err instanceof ApiClientError ? err.message : errorMessage(err));
    } finally {
      setSavingPw(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api.delete(`/me/sessions/${id}`);
      await sessions.mutate();
      toast({ title: "Session revoked", variant: "success" });
    } catch (err) {
      toast({ title: "Could not revoke session", description: errorMessage(err), variant: "error" });
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <SettingsNav />
      <div className="max-w-3xl space-y-6">
        <Card>
          <form onSubmit={saveName}>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Full name" htmlFor="me-name">
                <Input id="me-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field
                label="Email"
                htmlFor="me-email"
                hint={session!.user.emailVerified ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Not verified</Badge>}
              >
                <Input id="me-email" value={session!.user.email} disabled />
              </Field>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" loading={savingName} disabled={name.trim() === session!.user.name || name.trim().length === 0}>
                Save
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <form onSubmit={changePassword} noValidate>
            <CardHeader>
              <CardTitle>Password</CardTitle>
              <CardDescription>Changing your password signs out all other sessions.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              <Field label="Current password" htmlFor="pw-current">
                <Input id="pw-current" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </Field>
              <Field label="New password" htmlFor="pw-new" error={pwError}>
                <Input id="pw-new" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </Field>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" loading={savingPw} disabled={!pw.current || !pw.next}>
                Change password
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
            <CardDescription>Devices currently signed in to your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {sessions.data?.data.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <Laptop className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">
                      {describeAgent(s.userAgent)} {s.current && <Badge variant="success">This device</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.ipAddress ?? "Unknown IP"} · last active {relativeTime(s.lastSeenAt)}
                    </p>
                  </div>
                  {!s.current && (
                    <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}>
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
