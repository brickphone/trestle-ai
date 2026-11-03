import { defineConfig, devices } from "@playwright/test";

/** Render-only SSR fixtures + real Next assets. No database access or production auth bypass. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "visual.spec.ts",
  snapshotPathTemplate: "{testDir}/visual.spec.ts-snapshots/{arg}{ext}",
  fullyParallel: true,
  workers: 2,
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
  expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.002 } },
});
