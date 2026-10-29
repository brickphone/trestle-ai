import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const pages = [
  { path: "/", h1: "Overview" },
  { path: "/prospects", h1: "Prospects" },
  { path: "/pipeline", h1: "Pipeline" },
  { path: "/calculator", h1: "Cash-gap calculator" },
  { path: "/runs", h1: "Data runs" },
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
  await page.goto("/prospects");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link", { name: "Prospects" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});

test("data table sorts 5,000 rows without visible lag", async ({ page }) => {
  await page.goto("/dev/components");
  const table = page.getByRole("table", { name: "Synthetic firms" });
  await expect(table).toHaveAttribute("aria-rowcount", "5001");
  const header = table.getByRole("columnheader", { name: /Obligated 12m/ });
  const t0 = Date.now();
  await header.getByRole("button").click();
  await expect(header).toHaveAttribute("aria-sort", /ascending|descending/);
  expect(Date.now() - t0).toBeLessThan(500);
  // Virtualized: only a window of rows is in the DOM.
  expect(await table.locator("tbody tr").count()).toBeLessThan(80);
});

test("filtering the table updates the row count", async ({ page }) => {
  await page.goto("/dev/components");
  await page.getByLabel("Search firm or UEI").fill("Synthetic Firm 0042");
  await expect(page.getByText("Showing 1 of 5,000 rows")).toBeVisible();
});
