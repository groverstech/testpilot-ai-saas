"use client";
import * as React from "react";
import useSWR, { useSWRConfig } from "swr";
import { useRouter } from "next/navigation";
import type { Permission, SessionDTO } from "@testpilot/shared";
import { api, ApiClientError, fetcher } from "./api";

interface SessionContextValue {
  session: SessionDTO | null;
  isLoading: boolean;
  refresh: () => Promise<SessionDTO | undefined>;
  can: (permission: Permission) => boolean;
  switchOrganization: (id: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR<SessionDTO>("/auth/session", fetcher, {
    shouldRetryOnError: (err) => !(err instanceof ApiClientError && err.status === 401),
    revalidateOnFocus: true,
  });

  const unauthenticated = error instanceof ApiClientError && error.status === 401;

  React.useEffect(() => {
    if (unauthenticated) {
      const next = window.location.pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [unauthenticated, router]);

  const value = React.useMemo<SessionContextValue>(
    () => ({
      session: data ?? null,
      isLoading,
      refresh: () => mutate(),
      can: (p) => Boolean(data?.activeOrganization?.permissions.includes(p)),
      switchOrganization: async (id) => {
        const next = await api.post<SessionDTO>(`/organizations/${id}/switch`);
        // Drop every cached tenant-scoped response before showing the new organization.
        await globalMutate(() => true, undefined, { revalidate: false });
        await mutate(next, { revalidate: false });
        router.push("/dashboard");
      },
      logout: async () => {
        await api.post("/auth/logout");
        await globalMutate(() => true, undefined, { revalidate: false });
        window.location.href = "/login";
      },
    }),
    [data, isLoading, mutate, globalMutate, router],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
