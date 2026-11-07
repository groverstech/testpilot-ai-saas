import { expect, type Page } from "@playwright/test";

export const PASSWORD = "E2ePassword123";

export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** Registers through the real UI and completes organization onboarding. */
export async function registerAndOnboard(page: Page, opts: { name?: string; email?: string; org?: string } = {}) {
  const email = opts.email ?? uniqueEmail();
  await page.goto("/register");
  await page.getByLabel("Full name").fill(opts.name ?? "E2E User");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Organization name").fill(opts.org ?? `E2E Org ${Date.now()}`);
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("dashboard-stats")).toBeVisible();
  return { email };
}
