"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, Button, Field, Input } from "@testpilot/ui";
import { passwordSchema } from "@testpilot/shared";
import { api, errorMessage } from "@/lib/api";
import { useHydrated } from "@/lib/use-hydrated";
import { AuthCard } from "@/components/auth-card";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setFieldError(parsed.error.issues[0]!.message);
    if (password !== confirm) return setFieldError("Passwords do not match");
    setFieldError(null);
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthCard title="Invalid link">
        <p className="text-sm text-muted-foreground">
          This reset link is missing its token. <Link href="/forgot-password" className="underline">Request a new one</Link>.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" description="All other sessions will be signed out.">
      {done ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CheckCircle2 className="size-8 text-emerald-500" />
          <p className="text-sm">Your password has been reset.</p>
          <Button asChild className="w-full">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field label="New password" htmlFor="password" error={fieldError}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required autoFocus />
          </Field>
          <Field label="Confirm password" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
          <Button type="submit" className="w-full" loading={loading} disabled={!hydrated}>
            Reset password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <React.Suspense>
      <ResetForm />
    </React.Suspense>
  );
}
