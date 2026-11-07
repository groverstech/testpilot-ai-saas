import type { AppConfig } from "../config";

/** Stricter limit for credential endpoints (per IP). */
export const authRateLimit = (config: AppConfig, max: number) => ({
  rateLimit: {
    max: config.env.RATE_LIMIT_ENABLED ? max : 1_000_000,
    timeWindow: "1 minute",
    keyGenerator: (req: { ip: string }) => req.ip,
  },
});
