import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { contrast } from "@/app/(app)/dev/type/tokens";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
const token = (name: string) =>
  css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"))![1]!;
describe("actual application color contrast", () => {
  it("every ink and accent token passes AA on all ordinary surfaces", () => {
    for (const ink of [
      "fg",
      "fg-muted",
      "fg-subtle",
      "accent",
      "accent-hover",
      "success-strong",
      "danger-strong",
      "warning-strong",
    ]) {
      for (const surface of ["canvas", "surface", "surface-muted", "surface-hover"]) {
        expect(contrast(token(ink), token(surface)), `${ink} on ${surface}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });
  it("semantic colors, inverse text and input boundaries pass their applicable thresholds", () => {
    for (const tone of ["accent", "success", "warning", "danger"]) {
      expect(contrast(token(`${tone}-strong`), token(`${tone}-subtle`))).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    for (const accent of ["accent", "accent-hover", "danger"])
      expect(contrast(token("fg-inverse"), token(accent))).toBeGreaterThanOrEqual(4.5);
    for (const surface of ["canvas", "surface"])
      expect(contrast(token("border-input"), token(surface))).toBeGreaterThanOrEqual(3);
  });
});
