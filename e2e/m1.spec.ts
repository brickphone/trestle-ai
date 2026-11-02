import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
const hosted =
  process.env.ALLOW_DATABASE_TESTS === "true" &&
  !!process.env.SUPABASE_SECRET_KEY &&
  !!process.env.DATABASE_ADMIN_URL;
async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
  ).toEqual([]);
}
test.describe("M1 hosted workflow", () => {
  test.skip(!hosted, "Requires hosted test project credentials; no mocked authentication or RLS.");
  test("signup → manual onboarding → job → invoice → partial/full payment → forecast", async ({
    page,
  }) => {
    test.setTimeout(120000);
    const email = `m1-${randomUUID()}@example.com`,
      password = `Test-${randomUUID()}-A1`;
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false } },
    );
    await page.goto("/signup");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    // Confirm with a server-side administrative link in the dedicated test project.
    await expect(async () => {
      const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
      expect(link.error).toBeNull();
      expect(link.data.properties?.hashed_token).toBeTruthy();
    }).toPass({ timeout: 30000 });
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error) throw link.error;
    await page.goto(
      `/auth/confirm?token_hash=${encodeURIComponent(link.data.properties.hashed_token)}&type=magiclink`,
    );
    await expect(page).toHaveURL(/\/onboarding$/);
    await axe(page);
    await page.getByRole("link", { name: "Continue with manual entry" }).click();
    await page.getByLabel("Company name").fill("M1 TEST contractor");
    await page.getByLabel("Opening bank balance ($)", { exact: true }).fill("20000");
    await page.getByLabel("Weekly payroll estimate ($)").fill("1000");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
    await page.goto("/jobs");
    await page.getByLabel("Contract number", { exact: true }).fill("M1-TEST-CONTRACT");
    await page.getByLabel("Agency", { exact: true }).fill("Test agency");
    await page.getByLabel("Contract value ($)").fill("1000000");
    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel("Start date", { exact: true }).fill(today);
    await page.getByRole("button", { name: "Add job", exact: true }).click();
    await page.getByRole("link", { name: "M1-TEST-CONTRACT", exact: true }).click();
    await axe(page);
    await page.getByLabel("Invoice number", { exact: true }).fill("M1-INV-1");
    await page.getByLabel("Billing period start").fill(today);
    await page.getByLabel("Billing period end").fill(today);
    await page.getByLabel("Amount billed ($)").fill("100000");
    await page.getByLabel("Submitted date", { exact: true }).fill(today);
    await page.getByLabel("Invoice status").selectOption("submitted");
    await page.getByRole("button", { name: "Add invoice", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("M1-INV-1");
    await axe(page);
    await page.getByLabel("Payment amount ($)").fill("30000");
    await page.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(page.getByText("$65,000.00", { exact: true }).first()).toBeVisible();
    await page.getByLabel("Payment amount ($)").fill("65000");
    await page.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(page.getByText(/M1-TEST-CONTRACT · paid/)).toBeVisible();
    await page.goto("/forecast");
    await expect(
      page.getByRole("table", { name: "13-week cash forecast" }).getByRole("row"),
    ).toHaveCount(14);
    await page.locator("#week-0-sources summary").click();
    await expect(
      page.getByRole("link", { name: /Recorded progress payment/ }).first(),
    ).toBeVisible();
    await axe(page);
    // Tampering with a job identifier must not expose another tenant through a route.
    const db = postgres(process.env.DATABASE_ADMIN_URL!, { prepare: false, max: 1 });
    try {
      const [other] =
        await db`select j.id from app.jobs j join app.organizations o on o.id=j.organization_id where o.is_demo and j.voided_at is null limit 1`;
      expect(other).toBeTruthy();
      const response = await page.goto(`/jobs/${other!.id}`);
      expect(response?.status()).toBe(404);
    } finally {
      await db.end();
    }
  });
  test("staff retains access to internal shells and cannot edit contractor records", async ({
    page,
  }) => {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      { auth: { persistSession: false } },
    );
    const email = `staff-${randomUUID()}@example.com`,
      password = `Test-${randomUUID()}-A1`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    const db = postgres(process.env.DATABASE_ADMIN_URL!, { prepare: false, max: 1 });
    try {
      await db`insert into app.staff_users(user_id) values(${data.user.id})`;
    } finally {
      await db.end();
    }
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
    for (const [path, title] of [
      ["/internal", "Internal"],
      ["/internal/prospects", "Prospects"],
      ["/internal/pipeline", "Pipeline"],
      ["/internal/runs", "Data runs"],
    ]) {
      await page.goto(path!);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title!);
      await axe(page);
    }
    await page.goto("/jobs");
    await expect(page.getByRole("button", { name: "Add job", exact: true })).toBeDisabled();
  });
});
