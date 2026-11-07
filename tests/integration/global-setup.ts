import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));

/** Applies migrations to the test database before the integration suite runs. */
export default function setup() {
  config({ path: resolve(here, "../../.env"), quiet: true });
  const url = process.env.DATABASE_URL_TEST ?? "postgresql://testpilot:testpilot@localhost:5432/testpilot_test";
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error(`Refusing to run integration tests against a database whose name does not contain "test": ${new URL(url).pathname}`);
  }
  process.env.DATABASE_URL_TEST = url;
  execSync("pnpm exec prisma migrate deploy", {
    cwd: resolve(here, "../../packages/database"),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
