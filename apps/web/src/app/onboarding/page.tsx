"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { Building2 } from "lucide-react";
import { Alert, AlertDescription, Button, Card, CardContent, Field, Input } from "@testpilot/ui";
import { createOrganizationSchema, slugify, type SessionDTO } from "@testpilot/shared";
import { api, ApiClientError, errorMessage, fetcher } from "@/lib/api";
import { Logo } from "@/components/logo";

export default function OnboardingPage() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: session } = useSWR<SessionDTO>("/auth/session", fetcher);
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const effectiveSlug = slugTouched ? slug : name.trim().length >= 2 ? slugify(name) : "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Only send a slug the user typed; otherwise the API derives a unique one from the name.
    const parsed = createOrganizationSchema.safeParse({ name, slug: slugTouched && slug ? slug : undefined });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      return setErrors(errs);
    }
    setErrors({});
    setError(null);
    setLoading(true);
    try {
      await api.post("/organizations", parsed.data);
      // Refresh the cached session so the app shell sees the new active organization.
      await mutate("/auth/session");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "SLUG_TAKEN") setErrors({ slug: err.message });
      else if (err instanceof ApiClientError && err.code === "VALIDATION_FAILED") setErrors(err.fieldErrors);
      else setError(errorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-6">
        <Logo />
        {session?.organizations.length ? (
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </Button>
        ) : null}
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-10 sm:pt-20">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-border bg-muted/50">
              <Building2 className="size-5 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">
              {session?.organizations.length ? "Create another organization" : `Welcome${session ? `, ${session.user.name.split(" ")[0]}` : ""}`}
            </h1>
            <p className="text-sm text-muted-foreground">
              Organizations hold your projects, team members and billing. You can invite your team next.
            </p>
          </div>
          <Card>
            <CardContent className="p-6">
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Field label="Organization name" htmlFor="org-name" error={errors.name}>
                  <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." autoFocus />
                </Field>
                <Field label="Organization URL" htmlFor="org-slug" error={errors.slug} hint={slugTouched ? "Lowercase letters, numbers and hyphens." : "Generated from the name; a suffix is added if it is taken."}>
                  <div className="flex items-center rounded-md border border-input bg-muted/40 pl-3 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
                    <span className="shrink-0">testpilot.ai/</span>
                    <input
                      id="org-slug"
                      className="h-9 w-full rounded-r-md bg-background px-2 text-foreground outline-none"
                      value={effectiveSlug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setSlug(e.target.value.toLowerCase());
                      }}
                      placeholder="acme"
                    />
                  </div>
                </Field>
                <Button type="submit" className="w-full" loading={loading}>
                  Create organization
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
