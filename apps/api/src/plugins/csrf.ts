import type { FastifyInstance } from "fastify";
import { ApiError } from "../lib/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_HEADER = "x-testpilot-csrf";

/**
 * CSRF defence for cookie-authenticated, state-changing requests:
 *  1. Session cookie is SameSite=Lax (blocks cross-site POSTs from carrying it).
 *  2. A custom request header is required. Browsers cannot attach custom headers to
 *     cross-origin requests without a CORS preflight, and this API grants no CORS.
 *  3. When the browser sends an Origin header, it must be an allowed origin.
 * Endpoints authenticated by signatures (webhooks) opt out with `config: { csrf: false }`.
 */
export function registerCsrf(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    const routeConfig = request.routeOptions.config as { csrf?: boolean } | undefined;
    if (routeConfig?.csrf === false) return;

    const origin = request.headers.origin;
    if (origin && !app.config.allowedOrigins.includes(origin)) {
      throw new ApiError(403, "CSRF_ORIGIN_REJECTED", "Request origin is not allowed");
    }
    if (request.headers[CSRF_HEADER] !== "1") {
      throw new ApiError(403, "CSRF_HEADER_MISSING", `Missing ${CSRF_HEADER} header`);
    }
  });
}
