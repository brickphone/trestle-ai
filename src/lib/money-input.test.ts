import { describe, it, expect } from "vitest";
import { formatMoneyInput, ungroupMoneyInput, moneyInputCaret } from "./money-input";
import { cents } from "./finance";
describe("USD input grouping", () => {
  it.each([
    ["250000", "250,000"],
    ["60000", "60,000"],
    ["1234567.89", "1,234,567.89"],
    ["-250000.5", "-250,000.5"],
    ["0", "0"],
    ["0.00", "0.00"],
    ["1234.", "1,234."],
    ["1234.0", "1,234.0"],
    ["", ""],
    ["-", "-"],
    [".", "."],
    ["bad", "bad"],
  ])("formats %s as %s", (raw, display) => expect(formatMoneyInput(raw)).toBe(display));
  it("accepts a pasted USD amount without changing the stored cents", () => {
    const raw = ungroupMoneyInput("$250,000.50");
    expect(raw).toBe("250000.50");
    expect(cents(raw)).toBe(25000050);
  });
  it("preserves cursor position in the middle and at the end", () => {
    expect(moneyInputCaret("1234", 4, "1,234")).toBe(5);
    expect(moneyInputCaret("1253,456", 3, "1,253,456")).toBe(4);
    expect(moneyInputCaret("250000", 3, "250,000")).toBe(3);
  });
});
