"use client";
import useSWR, { type SWRConfiguration } from "swr";
import { fetcher } from "./api";
import { useSession } from "./session";

/**
 * Tenant-scoped data hook. The cache key includes the active organization id so data from
 * one organization can never be served from cache after switching to another.
 */
export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  const { session } = useSession();
  const orgId = session?.activeOrganization?.id;
  return useSWR<T>(path && orgId ? [path, orgId] : null, ([p]: [string, string]) => fetcher<T>(p), config);
}
