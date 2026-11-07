"use client";
import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Users, XCircle } from "lucide-react";
import { Alert, AlertDescription, Button, Skeleton } from "@testpilot/ui";
import { ROLE_LABELS, type Role, type SessionDTO } from "@testpilot/shared";
import { api, ApiClientError, errorMessage, fetcher } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";

interface InvitePreview {
  email: string;
  role: Role;
  organizationName: string;
  invitedBy: string;
  expiresAt: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const preview = useSWR<InvitePreview>(`/invitations/token/${encodeURIComponent(token)}`, fetcher, { shouldRetryOnError: false });
  const session = useSWR<SessionDTO>("/auth/session", fetcher, { shouldRetryOnError: false });
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const next = `/invite/${encodeURIComponent(token)}`;

  async function accept() {
    setLoading(true);
    setError(null);
    try {
      const next = await api.post<SessionDTO>(`/invitations/token/${encodeURIComponent(token)}/accept`);
      await session.mutate(next, { revalidate: false });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  async function switchAccount() {
    await api.post("/auth/logout");
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
  }

  if (preview.error) {
    return (
      <AuthCard title="Invitation unavailable">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <XCircle className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {preview.error instanceof ApiClientError ? preview.error.message : "This invitation could not be loaded."}
          </p>
        </div>
      </AuthCard>
    );
  }
  if (!preview.data) {
    return (
      <AuthCard title="Loading invitation…">
        <Skeleton className="h-24 w-full" />
      </AuthCard>
    );
  }

  const inv = preview.data;
  const signedIn = session.data?.user;
  const emailMatches = signedIn && signedIn.email.toLowerCase() === inv.email.toLowerCase();

  return (
    <AuthCard title={`Join ${inv.organizationName}`} description={`${inv.invitedBy} invited ${inv.email} as ${ROLE_LABELS[inv.role]}.`}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
          <Users className="size-5 text-muted-foreground" />
          <div className="text-sm">
            <p className="font-medium">{inv.organizationName}</p>
            <p className="text-muted-foreground">Role: {ROLE_LABELS[inv.role]}</p>
          </div>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!signedIn ? (
          <div className="grid gap-2">
            <Button asChild>
              <Link href={`/register?next=${encodeURIComponent(next)}`}>Create an account to accept</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/login?next=${encodeURIComponent(next)}`}>I already have an account</Link>
            </Button>
          </div>
        ) : emailMatches ? (
          <Button className="w-full" onClick={accept} loading={loading}>
            Accept invitation
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You are signed in as <span className="font-medium text-foreground">{signedIn.email}</span>, but this invitation was sent to{" "}
              <span className="font-medium text-foreground">{inv.email}</span>.
            </p>
            <Button variant="outline" className="w-full" onClick={switchAccount}>
              Sign in with a different account
            </Button>
          </div>
        )}
      </div>
    </AuthCard>
  );
}
