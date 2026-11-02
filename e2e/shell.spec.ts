import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const hosted =
  process.env.ALLOW_DATABASE_TESTS === "true" &&
  !!process.env.DEMO_EMAIL &&
  !!process.env.DEMO_PASSWORD;

test("sign-in and sign-up screens are accessible", async ({ page }) => {
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations.filter((v) => v.impact === "serious" || v.impact === "critical"),
    ).toEqual([]);
  }
});
test("anonymous visitors cannot enter the workspace", async ({ page }) => {
  for (const path of [
    "/",
    "/jobs",
    "/invoices",
    "/forecast",
    "/settings",
    "/onboarding",
    "/internal",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test.describe("hosted demo and staff screens", () => {
  test.skip(
    !hosted,
    "Requires a dedicated configured hosted test project and seeded demo account.",
  );
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "View demo", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
  });
  const pages = [
    { path: "/", h1: "Overview" },
    { path: "/jobs", h1: "Jobs" },
    { path: "/invoices", h1: "Government invoices" },
    { path: "/forecast", h1: "13-week forecast" },
    { path: "/settings", h1: "Settings" },
    { path: "/calculator", h1: "Cash-gap calculator" },
    { path: "/dev/components", h1: "Component reference" },
  ];

  for (const p of pages) {
    test(`${p.path} renders and has no serious a11y violations`, async ({ page }) => {
      await page.goto(p.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(p.h1);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        serious,
        JSON.stringify(
          serious.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          null,
          2,
        ),
      ).toEqual([]);
    });
  }

  test("left nav marks the current page and is keyboard reachable", async ({ page }) => {
    await page.goto("/jobs");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Jobs" })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  });

  test("data table sorts 5,000 rows within 500ms in the browser", async ({ page }) => {
    await page.goto("/dev/components");
    const table = page.getByRole("table", { name: "Synthetic firms" });
    await expect(table).toHaveAttribute("aria-rowcount", "5001");
    const header = table.getByRole("columnheader", { name: /Obligated 12m/ });
    // Measure dispatch-to-render in the browser, excluding Playwright's scrolling,
    // actionability checks and process round trips from the performance budget.
    await header.getByRole("button").click({ trial: true });
    const elapsed = await header.evaluate((element) => {
      return new Promise<number>((resolve) => {
        const started = performance.now();
        const observer = new MutationObserver(() => {
          if (element.hasAttribute("aria-sort")) {
            observer.disconnect();
            requestAnimationFrame(() => resolve(performance.now() - started));
          }
        });
        observer.observe(element, { attributes: true, attributeFilter: ["aria-sort"] });
        element.querySelector("button")!.click();
      });
    });
    await expect(header).toHaveAttribute("aria-sort", /ascending|descending/);
    expect(elapsed).toBeLessThan(500);
    // Virtualized: only a window of rows is in the DOM.
    expect(await table.locator("tbody tr").count()).toBeLessThan(80);
  });

  test("filtering the table updates the row count", async ({ page }) => {
    await page.goto("/dev/components");
    await page.getByLabel("Search firm or UEI").fill("Synthetic Firm 0042");
    await expect(page.getByText("Showing 1 of 5,000 rows")).toBeVisible();
    const table = page.getByRole("table", { name: "Synthetic firms" });
    await expect(table).toHaveAttribute("aria-rowcount", "2");
    await expect(table.locator("tbody tr")).toHaveAttribute("aria-rowindex", "2");
  });

  test("virtualized rows expose their absolute position after scrolling and sorting", async ({
    page,
  }) => {
    await page.goto("/dev/components");
    const table = page.getByRole("table", { name: "Synthetic firms" });
    await expect(table).toHaveAttribute("aria-rowcount", "5001");
    await expect(table.locator("thead tr")).toHaveAttribute("aria-rowindex", "1");
    await expect(table.locator("tbody tr").first()).toHaveAttribute("aria-rowindex", "2");
    const viewport = page.getByRole("region", { name: "Synthetic firms table, scrollable" });
    await viewport.evaluate((element) => {
      element.scrollTop = 32 * 1000;
    });
    await expect
      .poll(async () =>
        Number(await table.locator("tbody tr").first().getAttribute("aria-rowindex")),
      )
      .toBeGreaterThan(900);
    async function expectAbsoluteIndices() {
      const indices = await table.locator("tbody tr").evaluateAll((rows) =>
        rows.map((row) => ({
          index: Number(row.getAttribute("aria-rowindex")),
          position: Number(row.getAttribute("data-index")),
        })),
      );
      expect(indices.length).toBeGreaterThan(0);
      expect(indices.length).toBeLessThan(80);
      for (const [offset, row] of indices.entries()) {
        expect(row.index).toBe(row.position + 2);
        expect(row.index).toBe(indices[0]!.index + offset);
        expect(row.index).toBeLessThanOrEqual(5001);
      }
    }
    await expectAbsoluteIndices();
    await table
      .getByRole("columnheader", { name: /Obligated 12m/ })
      .getByRole("button")
      .click();
    await expectAbsoluteIndices();
    await expect(table).toHaveAttribute("aria-rowcount", "5001");
  });

  test("Internal is unavailable to demo users and calculator is absent from navigation", async ({
    page,
  }) => {
    await page.goto("/jobs");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", "/jobs");
    await expect(nav.getByRole("link", { name: /calculator/i })).toHaveCount(0);
    for (const path of ["/internal", "/internal/prospects", "/prospects", "/pipeline", "/runs"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    }
  });
});
