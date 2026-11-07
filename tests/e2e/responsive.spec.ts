import { expect, test } from "@playwright/test";
import { registerAndOnboard } from "./helpers";

test("mobile navigation drawer works and pages do not overflow horizontally", async ({ page }) => {
  await registerAndOnboard(page);
  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "Projects" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(drawer).toHaveCount(0);

  for (const path of ["/dashboard", "/projects", "/team", "/billing", "/settings"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0);
  }
});
