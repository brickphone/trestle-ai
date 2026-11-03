import { readFile, readdir, mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const snapshotScreens = [
  "overview-empty",
  "overview-demo",
  "jobs",
  "invoices",
  "forecast",
  "settings",
];
const otherScreens = [
  "job-detail",
  "invoice-detail",
  "invoice-rejected",
  "onboarding",
  "onboarding-manual",
  "calculator",
  "internal",
  "prospects",
  "pipeline",
  "runs",
  "components",
  "type",
  "login",
  "signup",
];
let css = "";
let fontVariables = "";
test.beforeAll(async () => {
  for (const file of await readdir(".next/static/chunks")) {
    if (file.endsWith(".css")) css += await readFile(`.next/static/chunks/${file}`, "utf8");
  }
  for (const name of ["instrument-sans"]) {
    const value = css.match(new RegExp(`--font-${name}:([^;}]+)`));
    expect(value, "Build must emit the actual local font variable").not.toBeNull();
    fontVariables += `--font-${name}:${value![1]};`;
  }
});

async function screen(page: Page, name: string) {
  let markup = await readFile(`.visual/after-html/${name}.html`, "utf8");
  // CSS-module selectors come from the actual Next build, not a reconstructed stylesheet.
  markup = markup.replace(/\b_([A-Za-z][\w]*)_[a-f0-9]+\b/g, (original, className) => {
    const match = css.match(new RegExp(`\\.([A-Za-z0-9_-]+_${className})(?=[\\s{:.>,#])`));
    if (!match) throw new Error(`Missing compiled CSS-module class: ${className}`);
    return match[1]!;
  });
  await page.context().route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "visual.test") return route.abort();
    if (url.pathname === "/visual-client.js")
      return route.fulfill({
        contentType: "text/javascript",
        body: await readFile(".visual/client/entry.js"),
      });
    if (route.request().resourceType() === "font") {
      const file = url.pathname.split("/").at(-1)!;
      return route.fulfill({
        contentType: file.endsWith(".ttf") ? "font/ttf" : "font/woff2",
        body: await readFile(`.next/static/media/${file}`),
      });
    }
    if (route.request().resourceType() === "image") {
      return route.fulfill({
        contentType: "image/png",
        body: await readFile("src/app/(app)/dev/type/soehne-reference.png"),
      });
    }
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang="en" style="${fontVariables.replaceAll('"', "&quot;")}"><head><meta charset="utf-8"><title>Demo, fictional data · Visual test</title><style>${css}</style></head><body>${markup}<script type="module" src="/visual-client.js"></script></body></html>`,
    });
  });
  await page.goto(`http://visual.test/${name}`);
  await page.waitForFunction(() => document.documentElement.dataset.visualClient === "ready");
  const charts = (markup.match(/data-cash-chart=/g) ?? []).length;
  if (charts)
    await expect(page.locator("[data-chart-mounted] [data-cash-chart]")).toHaveCount(charts);
  await page.evaluate(() => document.fonts.ready);
}

for (const name of snapshotScreens)
  for (const width of [1024, 1280, 1440, 1920]) {
    test(`${name} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await screen(page, name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      expect(await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(
        /instrument/i,
      );
      expect(await page.locator("nav[aria-label='Primary'] svg").count()).toBe(0);
      await expect(page).toHaveScreenshot(`${name}-${width}.png`, { fullPage: true });
      if (width === 1440 || width === 1280 || width === 1920) {
        await mkdir(".visual/after", { recursive: true });
        await page.screenshot({ path: `.visual/after/${name}-${width}.png`, fullPage: true });
        if (width === 1920) {
          await mkdir("docs/visual-pass2-after", { recursive: true });
          await page.screenshot({ path: `docs/visual-pass2-after/${name}-1920-viewport.png` });
        }
      }
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }

test("chart data opens with the keyboard and points to source weeks", async ({ page }) => {
  await screen(page, "overview-demo");
  const toggle = page.getByText("Show chart data", { exact: true });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("table", { name: "Cash projection chart data" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Week 13 sources", exact: true })).toHaveAttribute(
    "href",
    "/forecast#week-12-sources",
  );
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("chart inspection supports arrow keys, Home/End, Escape, hover and range selection", async ({
  page,
}) => {
  await screen(page, "overview-demo");
  const chart = page.locator("[data-cash-chart]").first();
  const plot = chart.getByRole("group", { name: "Interactive cash projection" });
  await plot.focus();
  await expect(chart.getByRole("status")).toContainText("Week 1");
  await plot.press("ArrowRight");
  await expect(chart.getByRole("status")).toContainText("Week 2");
  await plot.press("End");
  await expect(chart.getByRole("status")).toContainText("Week 13");
  await plot.press("Home");
  await expect(chart.getByRole("status")).toContainText("Week 1");
  await plot.press("Escape");
  await expect(chart.getByRole("status")).toHaveCount(0);
  await plot.evaluate((el) => (el as HTMLElement).blur());
  const bounds = (await plot.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + 60);
  await expect(chart.getByRole("status")).toContainText("Week 10");
  await expect(chart.getByRole("status")).toContainText("Projected balance");
  await mkdir("docs/visual-pass2-after", { recursive: true });
  await chart.screenshot({ path: "docs/visual-pass2-after/chart-tooltip.png" });
  await chart.getByRole("button", { name: "4 weeks", exact: true }).click();
  await expect(chart.getByRole("button", { name: "4 weeks", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await chart.getByText("Show chart data", { exact: true }).click();
  await expect(chart.getByRole("table").locator("tbody tr")).toHaveCount(4);
  await plot.focus();
  await plot.press("End");
  await expect(chart.getByRole("status")).toContainText("Week 4");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("chart stays 220px high with identical 12px labels at 1280 and 1920", async ({ page }) => {
  await screen(page, "overview-demo");
  for (const width of [1280, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page
        .locator(".chart-frame")
        .first()
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBe(220);
    const sizes = await page
      .locator("[data-chart-label]")
      .evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).fontSize))]);
    expect(sizes).toEqual(["12px"]);
    expect(
      await page.locator(".workspace-content").evaluate((el) => el.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(1264);
  }
});

for (const name of otherScreens)
  test(`${name} passes axe and fits at 1024px`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 1000 });
    await screen(page, name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    if (name === "type") {
      const padding = await page
        .getByRole("heading", { name: "Compare three fonts", exact: true })
        .evaluate((el) => getComputedStyle(el.parentElement!.parentElement!).padding);
      expect(padding).not.toBe("0px");
    }
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
