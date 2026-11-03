import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { contrast, proposal as t } from "./tokens";
import { TypeComparison } from "./type-comparison";
import type { loadData } from "@/lib/data/repository";

vi.mock("@/lib/auth/actions", () => ({ viewDemo: vi.fn() }));
vi.mock("next/font/local", () => ({ default: () => ({ style: { fontFamily: "Test font" } }) }));
vi.mock("@/lib/data/repository", () => ({ loadData: vi.fn() }));

vi.mock("./soehne-reference.png", () => ({
  default: { src: "/reference.png", width: 1100, height: 720 },
}));
// Read the actual shipped binaries with the same font parser Next uses.
const require = createRequire(import.meta.url);
const mod = require("next/dist/compiled/@next/font/dist/fontkit").default;
const parse = mod.default || mod;

describe("type decision", () => {
  it("returns 404 in production before reading organization data", async () => {
    const { default: TypePage } = await import("./page");
    const { loadData } = await import("@/lib/data/repository");
    vi.stubEnv("NODE_ENV", "production");
    try {
      await expect(TypePage()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
      expect(loadData).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  for (const name of ["instrument-sans", "hanken-grotesk", "ibm-plex-sans"]) {
    it(`${name} has real equal-width figures at every proposed weight`, () => {
      const font = parse(
        readFileSync(new URL(`../../../../assets/fonts/${name}.ttf`, import.meta.url)),
      );
      for (const wght of [400, 500, 600]) {
        const instance = font.getVariation({ wght });
        const widths = [..."0123456789"].map(
          (digit) => instance.layout(digit, ["tnum"]).advanceWidth,
        );
        expect(widths[0]).toBeGreaterThan(0);
        expect(new Set(widths).size).toBe(1);
      }
    });
  }
  it("all ink, semantic and accent colors pass AA on every proposed surface", () => {
    for (const text of [
      t.ink,
      t.secondary,
      t.tertiary,
      t.positive,
      t.negative,
      t.warning,
      t.green,
      t.blue,
    ]) {
      for (const background of [t.canvas, t.surface, t.subtle, t.hover]) {
        expect(contrast(text, background), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const accent of [t.green, t.blue, t.greenHover, t.blueHover]) {
      expect(contrast(t.surface, accent)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(t.control, t.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(t.control, t.surface)).toBeGreaterThanOrEqual(3);
  });
  it("renders the actual Overview and invoice table in all three candidates without creating records", () => {
    const data: Awaited<ReturnType<typeof loadData>> = {
      organization: {
        id: "test-org",
        name: "Test workspace",
        uei: null,
        origin: "manual",
        plan: "none",
        is_demo: false,
        onboarding_complete: true,
        created_at: new Date("2026-01-01"),
      },
      organizations: [],
      isStaff: false,
      readOnly: false,
      jobs: [],
      changes: [],
      invoices: [],
      payments: [],
      balances: [],
      costs: [],
      assumptions: [],
      snapshots: [],
    };
    const html = renderToStaticMarkup(
      TypeComparison({
        data,
        candidates: [
          {
            id: "instrument",
            name: "Instrument Sans",
            fontFamily: "Instrument",
            description: "",
            verification: "",
          },
          {
            id: "hanken",
            name: "Hanken Grotesk",
            fontFamily: "Hanken",
            description: "",
            verification: "",
          },
          {
            id: "plex",
            name: "IBM Plex Sans",
            fontFamily: "Plex",
            description: "",
            verification: "",
          },
        ],
      }),
    );
    expect(html.match(/data-type-candidate=/g)).toHaveLength(3);
    expect(html.match(/Add your first job<\/h2>/g)).toHaveLength(3);
    expect(html.match(/Explore the demo company/g)).toHaveLength(3);
    expect(html).toContain("Your workspace is ready");
    // Optional artifact for isolated browser layout review; never touches Supabase.
    if (process.env.TYPE_REVIEW_HTML) writeFileSync(process.env.TYPE_REVIEW_HTML, html);
  });
});
