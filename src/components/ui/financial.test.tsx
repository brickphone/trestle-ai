import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Money, DateText } from "./financial";
import { moneyParts } from "@/lib/format";

describe("financial display", () => {
  it.each([
    [4940899, true, "$49,409", "", false],
    [4940899, false, "$49,408", ".99", false],
    [-12345, false, "-$123", ".45", true],
    [-12345, true, "-$123", "", true],
    [0, false, "$0", ".00", false],
    [0, true, "$0", "", false],
    [-0, false, "$0", ".00", false],
    [999999999999, false, "$9,999,999,999", ".99", false],
    [null, false, "Not available", "", false],
  ])("formats %s cents, whole=%s", (cents, whole, major, fraction, negative) => {
    expect(moneyParts(cents as number | null, whole as boolean)).toEqual({
      major,
      fraction,
      negative,
    });
  });
  it("keeps the minus sign and negative color; cents stay secondary", () => {
    const html = renderToStaticMarkup(<Money cents={-12345} />);
    expect(html).toContain("text-danger-strong");
    expect(html).toContain("-$123");
    expect(html).toContain('class="text-fg-subtle">.45');
  });
  it("shows the full UTC date including the year", () => {
    const html = renderToStaticMarkup(<DateText value="2027-01-25" />);
    expect(html).toContain('dateTime="2027-01-25"');
    expect(html).toContain('title="Jan 25, 2027"');
    expect(html).toContain(">Jan 25, 2027</time>");
  });
});
