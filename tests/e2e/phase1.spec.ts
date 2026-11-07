/**
 * Phase 1 acceptance: a user can register, log in, create an organization, create a project
 * and manage it with persisted data — exercised through a real browser against the real
 * web app, API and PostgreSQL database.
 */
import { expect, test } from "@playwright/test";
import { PASSWORD, registerAndOnboard, uniqueEmail } from "./helpers";

test("unauthenticated visitors are redirected to login", async ({ page }) => {
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/login\?next=%2Fprojects$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("registration validates input client-side", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Full name").fill("X");
  await page.getByLabel("Work email").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await expect(page.getByText("Password must be at least 10 characters")).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});

test("Phase 1 acceptance: register → organization → project → manage → logout → login", async ({ page }) => {
  const { email } = await registerAndOnboard(page, { name: "Acceptance Tester", org: "Acceptance Labs" });

  // Dashboard shows real (empty) data — not fabricated statistics.
  await expect(page.getByRole("heading", { name: /Good to see you, Acceptance/ })).toBeVisible();
  await expect(page.getByText("No test executions yet")).toBeVisible();
  await expect(page.getByTestId("org-switcher")).toContainText("Acceptance Labs");

  // Create a project
  await page.getByRole("link", { name: "Create your first project" }).click();
  await expect(page).toHaveURL(/\/projects\/new$/);
  await page.getByLabel("Project name").fill("Checkout Flow");
  await page.getByLabel("Description").fill("Payments and order confirmation");
  await page.getByLabel("Application URL").fill("http://localhost:5173");
  await page.getByLabel("Default branch").fill("main");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByTestId("project-name")).toHaveText("Checkout Flow");
  const projectUrl = page.url();

  // Edit settings
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByLabel("Project name").fill("Checkout Flow v2");
  await page.getByRole("button", { name: /Tablet/ }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Project saved")).toBeVisible();
  await expect(page.getByTestId("project-name")).toHaveText("Checkout Flow v2");

  // Add an encrypted environment variable — the value is never shown again.
  await page.getByRole("tab", { name: "Environment" }).click();
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByLabel("Key").fill("API_BASE_URL");
  await page.getByLabel("Value").fill("https://api.staging.example.com/v1");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("cell", { name: "API_BASE_URL", exact: true })).toBeVisible();
  await expect(page.getByText("https://api.staging.example.com/v1")).toHaveCount(0);

  // Starting a test run is honestly reported as unavailable (no fake run is created).
  await page.getByRole("button", { name: "Start test run" }).click();
  await expect(page.getByRole("heading", { name: "Test execution not available yet" })).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();

  // Persistence: reload and verify.
  await page.reload();
  await expect(page.getByTestId("project-name")).toHaveText("Checkout Flow v2");
  await expect(page.getByText("Tablet", { exact: true })).toBeVisible();

  // Archive and restore
  await page.getByRole("tab", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Archive project" }).click();
  await expect(page.getByText("This project is archived.")).toBeVisible();
  await page.goto("/projects");
  await expect(page.getByText("No projects yet")).toBeVisible();
  await page.getByRole("tab", { name: "Archived" }).click();
  await expect(page.getByTestId("project-list")).toContainText("Checkout Flow v2");
  await page.goto(projectUrl);
  await page.getByRole("tab", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Restore project" }).click();
  await expect(page.getByText("This project is archived.")).toHaveCount(0);

  // Activity feed reflects real audit events.
  await page.goto("/dashboard");
  await expect(page.getByTestId("activity-feed")).toContainText("created a project");

  // Logout, then log back in and find the persisted data.
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("WrongPassword1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Incorrect email or password")).toBeVisible();
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/projects");
  await expect(page.getByTestId("project-list")).toContainText("Checkout Flow v2");
});

test("team management: inviting requires a verified email", async ({ page }) => {
  await registerAndOnboard(page, { org: "Team Org" });
  await page.goto("/team");
  await expect(page.getByTestId("member-list")).toContainText("(you)");
  await page.getByRole("button", { name: "Invite member" }).click();
  await page.getByLabel("Email address").fill(uniqueEmail("invitee"));
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText("Verify your email address before inviting team members")).toBeVisible();
});

test("organization switching keeps tenant data separate", async ({ page }) => {
  await registerAndOnboard(page, { org: "First Tenant" });
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("First tenant app");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByTestId("project-name")).toHaveText("First tenant app");

  await page.goto("/onboarding");
  await page.getByLabel("Organization name").fill("Second Tenant");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByTestId("org-switcher")).toContainText("Second Tenant");
  await page.goto("/projects");
  await expect(page.getByText("No projects yet")).toBeVisible();

  await page.getByTestId("org-switcher").click();
  await page.getByRole("menuitem", { name: "First Tenant" }).click();
  await expect(page.getByTestId("org-switcher")).toContainText("First Tenant");
  await page.goto("/projects");
  await expect(page.getByTestId("project-list")).toContainText("First tenant app");
});

test("integrations and billing report real configuration state", async ({ page }) => {
  await registerAndOnboard(page);
  await page.goto("/integrations");
  await expect(page.getByTestId("integration-list")).toContainText("GitHub");
  await expect(page.getByTestId("integration-list")).toContainText("Not configured");
  await page.goto("/billing");
  await expect(page.getByTestId("current-plan")).toContainText("Free");
  await expect(page.getByText("Payment processing is not configured")).toBeVisible();
});

test("organization settings persist and audit log records changes", async ({ page }) => {
  await registerAndOnboard(page, { org: "Settings Org" });
  await page.goto("/settings/organization");
  await page.getByLabel("Organization name").fill("Settings Org Renamed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Organization updated")).toBeVisible();
  await page.getByLabel("New workspace name").fill("Mobile");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByTestId("workspace-list")).toContainText("Mobile");
  await page.reload();
  await expect(page.getByLabel("Organization name")).toHaveValue("Settings Org Renamed");
  await expect(page.getByRole("table")).toContainText("organization.updated");
});
