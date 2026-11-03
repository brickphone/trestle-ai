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
  "onboarding-awards",
  "onboarding-no-active",
  ...[1, 2, 3, 4, 5, 6].map((n) => `onboarding-step-${n}`),
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
  for (const file of await readdir(".next/static", { recursive: true })) {
    if (file.endsWith(".css")) css += await readFile(`.next/static/${file}`, "utf8");
  }
  for (const name of ["instrument-sans"]) {
    const value = css.match(new RegExp(`--font-${name}:([^;}]+)`));
    expect(value, "Build must emit the actual local font variable").not.toBeNull();
    fontVariables += `--font-${name}:${value![1]};`;
  }
});

async function screen(page: Page, name: string, directory = ".visual/after-html") {
  let markup = await readFile(`${directory}/${name}.html`, "utf8");
  // CSS-module selectors come from the actual Next build, not a reconstructed stylesheet.
  markup = markup.replace(/\b_([A-Za-z][\w]*)_[a-f0-9]+\b/g, (original, className) => {
    const match = css.match(
      new RegExp(`\\.([A-Za-z0-9_-]+_${className}(?:__[A-Za-z0-9_-]+)?)(?=[\\s{:.>,#])`),
    );
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
  if (markup.includes("data-onboarding-flow"))
    await expect(page.locator("[data-flow-mounted] [data-onboarding-flow]")).toHaveCount(1);
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

test("recorded onboarding awards group, sort and retain choices when all older pages load", async ({
  page,
}) => {
  await screen(page, "onboarding-awards");
  const picker = page.locator("[data-award-selection]");
  const active = picker.getByRole("region", { name: "Active awards" });
  const activeBoxes = active.getByRole("checkbox");
  expect(await activeBoxes.count()).toBeGreaterThan(0);
  for (const checkbox of await activeBoxes.all()) await expect(checkbox).toBeChecked();
  const endDates = await active
    .locator("li")
    .evaluateAll((rows) =>
      rows.map((row) => row.querySelectorAll("time")[1]?.getAttribute("datetime")),
    );
  expect(endDates).toEqual([...endDates].sort().reverse());
  const completed = picker
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: /^Past contracts/ }) });
  await expect(completed).not.toHaveAttribute("open");
  const checkDates = async () => {
    const dates = await page.locator("time").allTextContents();
    expect(dates.length).toBeGreaterThan(1);
    for (const date of dates) expect(date).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);
  };
  await checkDates();
  await activeBoxes.first().uncheck();
  await completed.locator("summary").click();
  for (const checkbox of await completed.getByRole("checkbox").all())
    await expect(checkbox).not.toBeChecked();
  await picker.getByRole("button", { name: "Show older awards", exact: true }).click();
  await expect(picker.getByRole("status")).toContainText("Showing 113 of 113 awards");
  await expect(active.getByRole("checkbox").first()).not.toBeChecked();
  await expect(picker.getByRole("button", { name: "Show older awards", exact: true })).toHaveCount(
    0,
  );
  await expect(picker.locator('input[name="include_older"]')).toHaveValue("1");
  const order = picker
    .locator("li")
    .filter({ hasText: /Task order 0011 under / })
    .getByRole("checkbox")
    .first();
  await expect(order).toBeVisible();
  await expect(order).not.toBeChecked();
  await expect(picker).not.toContainText("IGF::");
  await expect(picker).toContainText("Place of performance: San Diego, CA");
  await checkDates();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("current-date recording shows no active contracts instead of preselecting old awards", async ({
  page,
}) => {
  await screen(page, "onboarding-no-active");
  const picker = page.locator("[data-award-selection]");
  await expect(picker).toContainText(
    "No active federal contracts found; you can add a job manually",
  );
  await expect(picker.locator('input[type="checkbox"]:checked')).toHaveCount(0);
  await expect(picker.getByRole("status")).toContainText("Showing 1 of 113 awards");
});

for (const width of [375, 1024, 1440]) {
  test(`onboarding before screenshots ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mkdir(".visual/onboarding-before", { recursive: true });
    for (const name of ["onboarding", "onboarding-manual", "onboarding-awards"]) {
      await screen(page, name, "e2e/fixtures/onboarding-before");
      await page.screenshot({
        path: `.visual/onboarding-before/${name}-${width}.png`,
        fullPage: true,
      });
    }
  });
  for (const n of [1, 2, 3, 4, 5, 6])
    test(`onboarding step ${n} snapshot and axe ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await screen(page, `onboarding-step-${n}`);
      const steps = page.getByRole("navigation", { name: "Onboarding steps" });
      if (width >= 1280 && n < 6) {
        await expect(steps).toBeVisible();
        await expect(steps.locator('[aria-current="step"]')).toHaveText(
          [
            "Company UEI",
            "Confirm company",
            "Contracts",
            "Cash today",
            "Overhead not tied to jobs",
          ][n - 1]!,
        );
      } else await expect(steps).not.toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      if (n !== 3)
        expect(
          await page.evaluate(() => document.documentElement.scrollHeight),
        ).toBeLessThanOrEqual(900);
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);
      await mkdir(".visual/onboarding-after", { recursive: true });
      await page.screenshot({
        path: `.visual/onboarding-after/step-${n}-${width}.png`,
        fullPage: true,
      });
      await expect(page).toHaveScreenshot(`onboarding-step-${n}-${width}.png`, { fullPage: true });
    });
}
const keyboardButton = async (page: Page, name: string) => {
  await page.getByRole("button", { name, exact: true }).focus();
  await page.keyboard.press("Enter");
};
test("onboarding keyboard flow through recorded UEI, selection, balances, payroll, monthly costs and overview link", async ({
  page,
}) => {
  await screen(page, "onboarding");
  const next = page.getByRole("button", { name: "Continue", exact: true });
  await expect(next).toBeDisabled();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Unique Entity Identifier (UEI)")).toBeFocused();
  await page.keyboard.type("HSNPS86TJGM6");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Is this your company?");
  await keyboardButton(page, "Edit");
  await page.getByLabel("Company name").fill("Confirmed company");
  await page.getByLabel("Company name").press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Which contracts are you working on now?",
  );
  const checked = page.locator('[name="award"]:checked');
  expect(await checked.count()).toBeGreaterThan(0);
  const umbrella = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: /Umbrella contracts/ }) });
  await expect(umbrella).toHaveCount(1);
  {
    await umbrella.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(umbrella.locator('[type="checkbox"]:checked')).toHaveCount(0);
  }
  await keyboardButton(page, "Continue");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "How much cash do you have today?",
  );
  await page.getByLabel("Current cash balance").fill("20000");
  await keyboardButton(page, "Continue");
  await page.getByLabel("Weekly office payroll (optional)").fill("1000");
  await page.getByLabel("Monthly overhead").fill("500");
  await keyboardButton(page, "Finish setup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You’re set up");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("onboarding-test-submission")!),
  );
  expect(saved.name).toBe("Confirmed company");
  expect(saved.opening_balance).toBe("20000");
  expect(saved.monthly).toBe("500");
  expect(saved.awards.length).toBeGreaterThan(0);
  await expect(page.getByRole("link", { name: "Go to overview" })).toHaveAttribute("href", "/");
});
test("onboarding resume after reload, Back preserves data and Not my company returns to UEI", async ({
  page,
}) => {
  await screen(page, "onboarding");
  await page.getByLabel("Unique Entity Identifier (UEI)").fill("HSNPS86TJGM6");
  await keyboardButton(page, "Continue");
  await keyboardButton(page, "Not my company");
  await expect(page.getByLabel("Unique Entity Identifier (UEI)")).toHaveValue("HSNPS86TJGM6");
  await keyboardButton(page, "Continue");
  await keyboardButton(page, "Yes, continue");
  await keyboardButton(page, "Continue");
  await page.getByLabel("Current cash balance").fill("12345");
  await keyboardButton(page, "Continue");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overhead not tied to jobs");
  await keyboardButton(page, "Back");
  await expect(page.getByLabel("Current cash balance")).toHaveValue("12,345");
  await keyboardButton(page, "Continue");
  await keyboardButton(page, "Skip for now");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You’re set up");
});
test("onboarding manual entry and both skip paths send missing assumptions rather than zeros", async ({
  page,
}) => {
  await screen(page, "onboarding");
  await keyboardButton(page, "Set up manually.");
  await page.getByLabel("Company name").fill("Manual contractor");
  await keyboardButton(page, "Continue");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "How much cash do you have today?",
  );
  await keyboardButton(page, "Skip for now");
  await keyboardButton(page, "Skip for now");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You’re set up");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("onboarding-test-submission")!),
  );
  expect(saved.opening_balance).toBe("");
  expect(saved.payroll).toBe("");
  expect(saved.awards).toEqual([]);
  expect(saved.uei).toBe("");
});
test("onboarding lookup errors remain inline with manual fallback", async ({ page }) => {
  await screen(page, "onboarding");
  await page.goto("http://visual.test/onboarding?lookup-error");
  await page.getByLabel("Unique Entity Identifier (UEI)").fill("HSNPS86TJGM6");
  await keyboardButton(page, "Continue");
  await expect(page.getByRole("alert")).toContainText("USAspending unavailable");
  await keyboardButton(page, "Continue with manual entry");
  await expect(page.getByLabel("Company name")).toBeVisible();
});

test("onboarding loading skeleton and inline amount validation", async ({ page }) => {
  await screen(page, "onboarding");
  await page.goto("http://visual.test/onboarding?lookup-loading");
  await page.getByLabel("Unique Entity Identifier (UEI)").fill("HSNPS86TJGM6");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Finding your company and awards");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Is this your company?");
  await keyboardButton(page, "Yes, continue");
  await keyboardButton(page, "Continue");
  await page.getByLabel("Current cash balance").fill("not money");
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await expect(page.getByText("Enter a valid dollar amount.", { exact: true })).toBeVisible();
});

test("onboarding completed steps preserve company edits, selection and financial entries", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await screen(page, "onboarding");
  await page.getByLabel("Unique Entity Identifier (UEI)").fill("HSNPS86TJGM6");
  await keyboardButton(page, "Continue");
  await keyboardButton(page, "Edit");
  await page.getByLabel("Company name").fill("Custom company LLC");
  await keyboardButton(page, "Yes, continue");
  const first = page.locator('[name="award"]:checked').first();
  const id = await first.getAttribute("value");
  await first.uncheck();
  await keyboardButton(page, "Continue");
  await page.getByLabel("Current cash balance").fill("12345");
  await keyboardButton(page, "Continue");
  await page.getByLabel("Weekly office payroll (optional)").fill("2345");
  const nav = page.getByRole("navigation", { name: "Onboarding steps" });
  await nav.getByRole("button", { name: "Confirm company", exact: true }).click();
  await expect(page.getByLabel("Company name")).toHaveValue("Custom company LLC");
  await nav.getByRole("button", { name: "Contracts", exact: true }).click();
  await expect(page.locator(`[name="award"][value="${id}"]`)).not.toBeChecked();
  await nav.getByRole("button", { name: "Cash today", exact: true }).click();
  await expect(page.getByLabel("Current cash balance")).toHaveValue("12,345");
  await keyboardButton(page, "Continue");
  await expect(page.getByLabel("Weekly office payroll (optional)")).toHaveValue("2,345");
  await page.reload();
  await expect(nav.locator('[aria-current="step"]')).toHaveText("Overhead not tied to jobs");
});
test("onboarding account button supports keyboard, dismiss and sign out", async ({ page }) => {
  await screen(page, "onboarding");
  const button = page.getByRole("button", { name: "Account: founder@example.test" });
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(button).toBeFocused();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await button.click();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await button.click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-signed-out", "true");
});

test("onboarding step list breakpoint and centered question column", async ({ page }) => {
  await screen(page, "onboarding-step-4");
  for (const width of [1024, 1279, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const steps = page.getByRole("navigation", { name: "Onboarding steps" });
    if (width >= 1280) {
      await expect(steps).toBeVisible();
      const box = await steps.boundingBox();
      const column = await page.locator("main").boundingBox();
      expect(box!.x + box!.width).toBeLessThan(column!.x);
    } else await expect(steps).not.toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Setup progress" })).toBeVisible();
    const column = await page.locator("main").boundingBox();
    expect(Math.abs(column!.x + column!.width / 2 - width / 2)).toBeLessThan(1);
  }
  const steps = page.getByRole("navigation", { name: "Onboarding steps" });
  await expect(steps.getByRole("button", { name: "Overhead not tied to jobs" })).toHaveCount(0);
});

test("onboarding displays readable source text while saving the raw company name", async ({
  page,
}) => {
  await screen(page, "onboarding");
  await page.getByLabel("Unique Entity Identifier (UEI)").fill("HSNPS86TJGM6");
  await keyboardButton(page, "Continue");
  await expect(
    page.getByText("West Coast Building & Construction, Inc.", { exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("onboarding-test-draft")!),
  );
  expect(saved.name).toBe("WEST COAST BUILDING & CONSTRUCTION, INC.");
  await keyboardButton(page, "Yes, continue");
  await expect(page.locator("[data-award-selection]")).toContainText(
    "Renovate restroom B467 NASNI",
  );
  await expect(page.locator("[data-award-selection]")).toContainText("San Diego, CA");
});

test("onboarding money groups thousands while typing, editing and pasting without changing stored values", async ({
  page,
}) => {
  await screen(page, "onboarding-step-4");
  const balance = page.getByLabel("Current cash balance");
  await balance.pressSequentially("250000");
  await expect(balance).toHaveValue("250,000");
  await balance.press("Home");
  await balance.press("ArrowRight");
  await balance.pressSequentially("1");
  await expect(balance).toHaveValue("2,150,000");
  await balance.fill("$250,000.50");
  await expect(balance).toHaveValue("250,000.50");
  await keyboardButton(page, "Continue");
  const payroll = page.getByLabel("Weekly office payroll (optional)");
  await payroll.pressSequentially("60000");
  await expect(payroll).toHaveValue("60,000");
  await page.getByLabel("Monthly overhead").fill("1500.25");
  await expect(page.getByLabel("Monthly overhead")).toHaveValue("1,500.25");
  await keyboardButton(page, "Finish setup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You’re set up");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("onboarding-test-submission")!),
  );
  expect(saved.opening_balance).toBe("250000.50");
  expect(saved.payroll).toBe("60000");
  expect(saved.monthly).toBe("1500.25");
});

test("onboarding preserves formatted entries and the draft when finishing fails, then allows retry", async ({
  page,
}) => {
  await screen(page, "onboarding-step-5");
  await page.evaluate(() => history.replaceState(null, "", "?finish-error"));
  await page.getByLabel("Weekly office payroll (optional)").fill("60000");
  await keyboardButton(page, "Finish setup");
  await expect(page.getByRole("alert")).toContainText("supabase/setup.sql");
  await expect(page.getByLabel("Weekly office payroll (optional)")).toHaveValue("60,000");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("onboarding-test-draft")!),
  );
  expect(saved.payroll).toBe("60000");
  await page.evaluate(() => history.replaceState(null, "", "/onboarding-step-5"));
  await keyboardButton(page, "Finish setup");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("You’re set up");
});

test("projected job income and weekly job costs produce the reference sawtooth with traced sources", async ({
  page,
}) => {
  await screen(page, "forecast-projected");
  await expect(page.getByRole("table", { name: "13-week cash forecast" })).toBeVisible();
  await expect(page.locator("[data-projected-receipt]")).toHaveCount(2);
  await expect(
    page.getByText("Hollow markers: Projected, not invoiced income.", { exact: false }),
  ).toBeVisible();
  await page.locator("#week-8-sources summary").click();
  await expect(page.locator("#week-8-sources")).toContainText("Projected, not invoiced");
  await expect(page.locator("#week-8-sources")).toContainText("Gross");
  await expect(page.locator("#projection-sources")).toContainText(
    "company office overhead is added once",
  );
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await expect(page).toHaveScreenshot("forecast-projected-1440.png", { fullPage: true });
});
test("onboarding captures per-contract billed amounts and payment lag separately from office overhead", async ({
  page,
}) => {
  await screen(page, "onboarding-awards");
  const selected = page
    .locator("li[data-award-id]")
    .filter({ has: page.locator('input[name="award"]:checked') })
    .first();
  await selected.getByLabel("Billed so far", { exact: true }).fill("250000");
  await selected.getByLabel("Usual days until the government pays", { exact: true }).fill("45");
  await keyboardButton(page, "Continue");
  await keyboardButton(page, "Skip for now");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overhead not tied to jobs");
  await page.getByLabel("Monthly overhead", { exact: true }).fill("35000");
  await page.getByLabel("Weekly office payroll (optional)", { exact: true }).fill("5000");
  await keyboardButton(page, "Finish setup");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("onboarding-test-submission")!),
  );
  expect(
    JSON.parse(saved.job_inputs).some(
      (input: { billedCents: number; paymentLagDays: number }) =>
        input.billedCents === 25000000 && input.paymentLagDays === 45,
    ),
  ).toBe(true);
  expect(saved.monthly).toBe("35000");
  expect(saved.payroll).toBe("5000");
});
