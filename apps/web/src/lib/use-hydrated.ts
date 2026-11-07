"use client";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True once React has hydrated on the client. Auth forms keep their submit button disabled
 * until then so a fast click can never trigger a native (non-JS) form submission.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
