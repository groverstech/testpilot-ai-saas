"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import { Alert, AlertDescription, Button, Field, Input } from "@testpilot/ui";
import { registerSchema, type SessionDTO } from "@testpilot/shared";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { useHydrated } from "@/lib/use-hydrated";
import { AuthCard, safeNext } from "@/components/auth-card";

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate } = useSWRConfig();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const input = { name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") };
    const parsed = registerSchema.safeParse(input);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    try {
      const session = await api.post<SessionDTO>("/auth/register", parsed.data);
      await mutate("/auth/session", session, { revalidate: false });
      const next = params.get("next");
      router.replace(next ? safeNext(next) : "/onboarding");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "VALIDATION_FAILED") setFieldErrors(err.fieldErrors);
      else setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Create your account"
      description="Start testing your web applications with AI"
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
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
        <Field label="Full name" htmlFor="name" error={fieldErrors.name}>
          <Input id="name" name="name" autoComplete="name" required autoFocus aria-invalid={!!fieldErrors.name} />
        </Field>
        <Field label="Work email" htmlFor="email" error={fieldErrors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fieldErrors.email} />
        </Field>
        <Field label="Password" htmlFor="password" error={fieldErrors.password} hint="At least 10 characters, with letters and numbers.">
          <Input id="password" name="password" type="password" autoComplete="new-password" required aria-invalid={!!fieldErrors.password} />
        </Field>
        <Button type="submit" className="w-full" loading={loading} disabled={!hydrated}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}

export default function RegisterPage() {
  return (
    <React.Suspense>
      <RegisterForm />
    </React.Suspense>
  );
}
