"use client";
import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@testpilot/ui";
import { api, errorMessage } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";

function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = React.useState<{ status: "pending" | "ok" | "error"; message?: string }>({ status: "pending" });
  const started = React.useRef(false);

  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ status: "error", message: "This verification link is missing its token." });
      return;
    }
    api
      .post("/auth/verify-email", { token })
      .then(() => setState({ status: "ok" }))
      .catch((err) => setState({ status: "error", message: errorMessage(err) }));
  }, [token]);

  return (
    <AuthCard title="Email verification">
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        {state.status === "pending" && <Loader2 className="size-8 animate-spin text-muted-foreground" />}
        {state.status === "ok" && (
          <>
            <CheckCircle2 className="size-8 text-emerald-500" />
            <p className="text-sm">Your email address is verified.</p>
          </>
        )}
        {state.status === "error" && (
          <>
            <XCircle className="size-8 text-destructive" />
            <p className="text-sm">{state.message}</p>
          </>
        )}
        {state.status !== "pending" && (
          <Button asChild className="mt-2 w-full">
            <Link href="/dashboard">Continue to dashboard</Link>
          </Button>
        )}
      </div>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <React.Suspense>
      <Verify />
    </React.Suspense>
  );
}
