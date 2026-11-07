import { z } from "zod";
import { parseKeyRing, type KeyRing } from "@testpilot/shared/crypto";

const bool = (def: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? def : v === "true" || v === "1"));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: optionalString,
  WEB_URL: z.string().url().default("http://localhost:3000"),
  /** Comma-separated extra origins allowed to make state-changing requests. */
  ALLOWED_ORIGINS: optionalString,
  COOKIE_SECURE: bool(false),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  ENCRYPTION_KEYS: optionalString,
  ENCRYPTION_KEY: optionalString,
  EMAIL_TRANSPORT: z.enum(["smtp", "log", "memory"]).optional(),
  SMTP_URL: optionalString,
  EMAIL_FROM: z.string().default("TestPilot AI <no-reply@testpilot.local>"),
  RATE_LIMIT_ENABLED: bool(true),
  TRUST_PROXY: bool(false),
  ALLOW_PRIVATE_APP_URLS: bool(false),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Integrations — presence is reported by /integrations; never logged or returned.
  GITHUB_APP_ID: optionalString,
  GITHUB_APP_SLUG: optionalString,
  GITHUB_APP_PRIVATE_KEY: optionalString,
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  GITHUB_WEBHOOK_SECRET: optionalString,
  ANTHROPIC_API_KEY: optionalString,
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  S3_ENDPOINT: optionalString,
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  PLAN_LIMITS_JSON: optionalString,
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env;
  isProd: boolean;
  isTest: boolean;
  keyRing: KeyRing;
  allowedOrigins: string[];
  emailTransport: "smtp" | "log" | "memory";
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid API configuration:\n${issues}`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === "production";

  const keySpec = env.ENCRYPTION_KEYS ?? env.ENCRYPTION_KEY;
  if (!keySpec) {
    throw new Error(
      "ENCRYPTION_KEYS (or ENCRYPTION_KEY) is required. Generate one with:\n  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const keyRing = parseKeyRing(keySpec);

  const emailTransport = env.EMAIL_TRANSPORT ?? (env.SMTP_URL ? "smtp" : env.NODE_ENV === "test" ? "memory" : "log");
  if (emailTransport === "smtp" && !env.SMTP_URL) throw new Error("EMAIL_TRANSPORT=smtp requires SMTP_URL");
  if (isProd && emailTransport !== "smtp") {
    throw new Error("Production requires a real email transport: set SMTP_URL (verification and reset emails).");
  }
  if (isProd && !env.COOKIE_SECURE) throw new Error("Production requires COOKIE_SECURE=true");
  if (isProd && env.ALLOW_PRIVATE_APP_URLS) throw new Error("ALLOW_PRIVATE_APP_URLS must not be enabled in production");

  const webOrigin = new URL(env.WEB_URL).origin;
  const allowedOrigins = [
    webOrigin,
    ...(env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((o) => new URL(o).origin),
  ];

  return { env, isProd, isTest: env.NODE_ENV === "test", keyRing, allowedOrigins, emailTransport };
}
