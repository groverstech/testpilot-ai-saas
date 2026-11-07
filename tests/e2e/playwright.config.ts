import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3010);
const API_PORT = Number(process.env.E2E_API_PORT ?? 4010);
export const E2E_DATABASE_URL = process.env.DATABASE_URL_E2E ?? "postgresql://testpilot:testpilot@localhost:5432/testpilot_e2e";

const apiEnv = {
  NODE_ENV: "development",
  DATABASE_URL: E2E_DATABASE_URL,
  API_PORT: String(API_PORT),
  WEB_URL: `http://localhost:${WEB_PORT}`,
  ENCRYPTION_KEYS: "e2e:" + Buffer.alloc(32, 9).toString("base64"),
  EMAIL_TRANSPORT: "log",
  ALLOW_PRIVATE_APP_URLS: "true",
  RATE_LIMIT_ENABLED: "false",
  LOG_LEVEL: "warn",
  REDIS_URL: "",
};

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  outputDir: "./.artifacts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  globalSetup: "./global-setup.ts",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } }, testIgnore: /responsive\.spec\.ts/ },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      command: "pnpm --filter @testpilot/api exec tsx src/index.ts",
      url: `http://localhost:${API_PORT}/health`,
      env: apiEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @testpilot/web exec next dev --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      env: { API_URL: `http://localhost:${API_PORT}`, NEXT_TELEMETRY_DISABLED: "1" },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
