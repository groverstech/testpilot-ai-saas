import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Applies migrations (non-destructively) to the dedicated e2e database. The database must
 * exist (`createdb testpilot_e2e`). Tests are isolated by creating unique users and
 * organizations, so no data needs to be wiped between runs.
 */
export default function globalSetup() {
  const url = process.env.DATABASE_URL_E2E ?? "postgresql://testpilot:testpilot@localhost:5432/testpilot_e2e";
  if (!/e2e/i.test(new URL(url).pathname)) throw new Error(`Refusing to use non-e2e database ${new URL(url).pathname}`);
  execSync("pnpm exec prisma migrate deploy", {
    cwd: resolve(here, "../../packages/database"),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
