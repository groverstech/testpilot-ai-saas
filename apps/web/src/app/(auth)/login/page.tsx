"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { Github } from "lucide-react";
import { Alert, AlertDescription, Button, Field, Input, Separator } from "@testpilot/ui";
import type { SessionDTO } from "@testpilot/shared";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { useHydrated } from "@/lib/use-hydrated";
import { AuthCard, safeNext } from "@/components/auth-card";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate } = useSWRConfig();
  const [error, setError] = React.useState<string | null>(null);
  const [githubNote, setGithubNote] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const session = await api.post<SessionDTO>("/auth/login", {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      await mutate("/auth/session", session, { revalidate: false });
      router.replace(session.organizations.length === 0 ? "/onboarding" : safeNext(params.get("next")));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  }

  async function onGithub() {
    setGithubNote(null);
    try {
      await api.get("/auth/github");
    } catch (err) {
      setGithubNote(
        err instanceof ApiClientError && err.code === "INTEGRATION_NOT_CONFIGURED"
          ? "GitHub sign-in is not configured on this deployment yet."
          : errorMessage(err),
      );
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your TestPilot AI account"
      footer={
        <>
          New to TestPilot?{" "}
          <Link href="/register" className="font-medium text-foreground underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={loading} disabled={!hydrated}>
          Sign in
        </Button>
        <div className="flex items-center gap-3 py-1">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
        <Button type="button" variant="outline" className="w-full" onClick={onGithub}>
          <Github /> Continue with GitHub
        </Button>
        {githubNote && <p className="text-center text-xs text-muted-foreground">{githubNote}</p>}
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense>
      <LoginForm />
    </React.Suspense>
  );
}
