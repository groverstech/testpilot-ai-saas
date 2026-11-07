"use client";
import type { ApiErrorBody } from "@testpilot/shared";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  /** Field → message map for VALIDATION_FAILED responses. */
  get fieldErrors(): Record<string, string> {
    if (this.code !== "VALIDATION_FAILED" || !Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as Array<{ path: string; message: string }>) {
      if (!out[d.path]) out[d.path] = d.message;
    }
    return out;
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      // Required by the API's CSRF defence for state-changing requests.
      ...(method !== "GET" ? { "x-testpilot-csrf": "1" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = (json as ApiErrorBody | undefined)?.error;
    throw new ApiClientError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T = void>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

/** SWR fetcher */
export const fetcher = <T,>(path: string) => api.get<T>(path);

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
