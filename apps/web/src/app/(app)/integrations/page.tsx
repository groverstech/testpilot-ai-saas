"use client";
import * as React from "react";
import { Bot, CheckCircle2, CircleDashed, CreditCard, Database, Github, HardDrive, Mail } from "lucide-react";
import { Badge, Button, Card, CardContent, Skeleton } from "@testpilot/ui";
import type { IntegrationStatusDTO } from "@testpilot/shared";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { useToast } from "@/components/toaster";
import { PageHeader } from "@/components/page-header";

const ICONS: Record<IntegrationStatusDTO["id"], React.ComponentType<{ className?: string }>> = {
  github: Github,
  anthropic: Bot,
  storage: HardDrive,
  queue: Database,
  email: Mail,
  stripe: CreditCard,
};

export default function IntegrationsPage() {
  const { can } = useSession();
  const toast = useToast();
  const { data } = useApi<{ data: IntegrationStatusDTO[] }>("/integrations");
  const [connecting, setConnecting] = React.useState(false);

  async function connectGithub() {
    setConnecting(true);
    try {
      await api.post("/github/connect");
    } catch (err) {
      const missing = err instanceof ApiClientError && (err.details as { missing?: string[] } | undefined)?.missing;
      toast({
        title: err instanceof ApiClientError && err.code === "INTEGRATION_NOT_CONFIGURED" ? "GitHub App not configured" : "Cannot connect yet",
        description: missing && missing.length ? `Missing server configuration: ${missing.join(", ")}` : errorMessage(err),
        variant: "error",
      });
    } finally {
      setConnecting(false);
    }
  }

  return (
    <>
      <PageHeader title="Integrations" description="Services this deployment of TestPilot AI is connected to." />
      {!data ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="integration-list">
          {data.data.map((i) => {
            const Icon = ICONS[i.id];
            return (
              <li key={i.id}>
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-3 p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="text-sm font-semibold">{i.name}</h2>
                          {i.configured ? (
                            <Badge variant="success">
                              <CheckCircle2 className="size-3" /> Configured
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <CircleDashed className="size-3" /> Not configured
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{i.description}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{i.details}</p>
                    {i.missing.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Requires: <span className="font-mono">{i.missing.join(", ")}</span>
                      </p>
                    )}
                    {i.id === "github" && can("integrations:manage") && (
                      <div className="mt-auto pt-1">
                        <Button variant="outline" size="sm" onClick={connectGithub} loading={connecting}>
                          <Github /> Connect GitHub
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
