import { describe, expect, it } from "vitest";
import {
  NOT_AVAILABLE,
  formatDate,
  formatDateIso,
  formatDateTime,
  formatDays,
  formatDecimal,
  formatInteger,
  formatPercent,
  formatPercentChange,
  formatRelativeDate,
  formatUei,
  formatUsd,
  formatUsdCompact,
  isUeiShaped,
  parseDate,
} from "./format";

describe("missing values", () => {
  it.each([
    formatUsd,
    formatUsdCompact,
    formatInteger,
    formatDecimal,
    formatPercent,
    formatPercentChange,
    formatDate,
    formatDateIso,
    formatDateTime,
    formatRelativeDate,
    formatDays,
    formatUei,
  ])("%o returns Not available for null, undefined and empty string", (fn) => {
    const f = fn as (v: unknown) => string;
    expect(f(null)).toBe(NOT_AVAILABLE);
    expect(f(undefined)).toBe(NOT_AVAILABLE);
    expect(f("")).toBe(NOT_AVAILABLE);
  });

  it("never renders NaN", () => {
    expect(formatUsd("abc")).toBe(NOT_AVAILABLE);
    expect(formatPercent(Number.NaN)).toBe(NOT_AVAILABLE);
    expect(formatDate("not a date")).toBe(NOT_AVAILABLE);
  });
});

describe("formatUsd", () => {
  it("formats whole dollars by default", () => {
    expect(formatUsd(1234567.89)).toBe("$1,234,568");
    expect(formatUsd(0)).toBe("$0");
  });
  it("formats cents on request", () => {
    expect(formatUsd(1234567.891, { cents: true })).toBe("$1,234,567.89");
  });
  it("accepts Postgres numeric strings", () => {
    expect(formatUsd("250000.00")).toBe("$250,000");
  });
  it("keeps negative obligations (deobligations) visible", () => {
    expect(formatUsd(-5000)).toBe("-$5,000");
  });
});

describe("formatUsdCompact", () => {
  it.each([
    [999, "$999"],
    [1000, "$1K"],
    [850_000, "$850K"],
    [1_234_567, "$1.2M"],
    [15_000_000, "$15M"],
    [12_400_000_000, "$12.4B"],
    [-2_500_000, "-$2.5M"],
  ])("%d → %s", (input, expected) => {
    expect(formatUsdCompact(input)).toBe(expected);
  });
});

describe("numbers and percentages", () => {
  it("formats integers and decimals", () => {
    expect(formatInteger(12345.6)).toBe("12,346");
    expect(formatDecimal(4.25, 1)).toBe("4.3");
    expect(formatDecimal(4, 2)).toBe("4.00");
  });
  it("treats percent input as a ratio", () => {
    expect(formatPercent(0.1234)).toBe("12.3%");
    expect(formatPercent(1)).toBe("100.0%");
    expect(formatPercent(0.5, 0)).toBe("50%");
  });
  it("signs percent changes with a true minus", () => {
    expect(formatPercentChange(0.25)).toBe("+25.0%");
    expect(formatPercentChange(-0.1)).toBe("−10.0%");
    expect(formatPercentChange(0)).toBe("0.0%");
  });
  it("pluralizes days", () => {
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(45)).toBe("45 days");
    expect(formatDays(1200)).toBe("1,200 days");
  });
});

describe("dates", () => {
  it("parses date-only strings as UTC calendar dates (no off-by-one)", () => {
    const d = parseDate("2024-03-01");
    expect(d?.toISOString()).toBe("2024-03-01T00:00:00.000Z");
    expect(formatDateIso("2024-03-01")).toBe("2024-03-01");
    expect(formatDate("2024-03-01")).toBe("Mar 1, 2024");
  });
  it("formats timestamps in UTC with a label", () => {
    expect(formatDateTime("2026-10-29T14:05:00Z")).toBe("Oct 29, 2026, 14:05 UTC");
  });
  it("formats relative dates against an injected now", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    expect(formatRelativeDate("2026-10-26T12:00:00Z", now)).toBe("3 days ago");
    expect(formatRelativeDate("2026-10-29T11:59:30Z", now)).toBe("just now");
    expect(formatRelativeDate("2026-10-28T12:00:00Z", now)).toBe("yesterday");
  });
});

describe("UEI", () => {
  it("uppercases and trims", () => {
    expect(formatUei(" abcd1234efgh ")).toBe("ABCD1234EFGH");
  });
  it("groups for reading only when well-formed", () => {
    expect(formatUei("ABCD1234EFGH", { grouped: true })).toBe("ABCD 1234 EFGH");
    expect(formatUei("SHORT", { grouped: true })).toBe("SHORT");
  });
  it("checks shape", () => {
    expect(isUeiShaped("ABCD1234EFGH")).toBe(true);
    expect(isUeiShaped("ABCD-1234-EF")).toBe(false);
    expect(isUeiShaped(null)).toBe(false);
  });
});
