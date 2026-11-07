"use client";
import * as React from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Alert, AlertDescription, Button, Field, Input } from "@testpilot/ui";
import { api, errorMessage } from "@/lib/api";
import { useHydrated } from "@/lib/use-hydrated";
import { AuthCard } from "@/components/auth-card";

export default function ForgotPasswordPage() {
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email: String(new FormData(e.currentTarget).get("email") ?? "") });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="Reset your password"
      description="We'll email you a link to choose a new password."
      footer={
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <MailCheck className="size-8 text-emerald-500" />
          <p className="text-sm">If an account exists for that email, a reset link is on its way. It expires in 1 hour.</p>
        </div>
      ) : (
        <form onSubmit={onSubmit} method="post" className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </Field>
          <Button type="submit" className="w-full" loading={loading} disabled={!hydrated}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
