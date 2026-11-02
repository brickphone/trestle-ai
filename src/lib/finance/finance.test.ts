import { describe, it, expect } from "vitest";
import { addDays, cents, retainedCents, invoiceDueDate, isLate } from ".";
import { invoiceInput } from "../data/validation";
describe("financial rules", () => {
  it("uses proper receipt for confirmed dates, submission only for estimates", () => {
    const invoice = {
      submitted_date: "2026-01-30",
      proper_receipt_date: null,
      payment_terms_days: 14,
      status: "submitted",
    };
    expect(invoiceDueDate(invoice)).toEqual({ date: "2026-02-13", confirmed: false });
    expect(invoiceDueDate({ ...invoice, proper_receipt_date: "2026-02-02" })).toEqual({
      date: "2026-02-16",
      confirmed: true,
    });
    expect(isLate(invoice, 100, "2026-02-13")).toBe(false);
    expect(isLate(invoice, 100, "2026-02-14")).toBe(true);
    expect(isLate(invoice, 0, "2026-02-14")).toBe(false);
    expect(isLate({ ...invoice, status: "rejected" }, 100, "2026-02-14")).toBe(false);
  });
  it("rounds retainage to cents, including zero, and parses dollars without float drift", () => {
    expect(cents("1000.01")).toBe(100001);
    expect(cents("-0.01")).toBe(-1);
    expect(retainedCents(101, 500)).toBe(5);
    expect(retainedCents(100, 0)).toBe(0);
    expect(() => cents("1.001")).toThrow();
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("requires rejection reason and validates zero/manual retainage", () => {
    const invoice = {
      job_id: "06a02f6b-7145-4e33-84fe-a54762149800",
      invoice_number: "1",
      period_start: "2026-01-01",
      period_end: "2026-01-31",
      billed_cents: "100",
      retainage_cents: "0",
      submitted_date: "2026-02-01",
      proper_receipt_date: "",
      expected_payment_date: "",
      expected_retainage_date: "",
      portal: "IPP",
      status: "rejected",
      rejection_reason: "",
    };
    expect(invoiceInput.safeParse(invoice).success).toBe(false);
    expect(
      invoiceInput.parse({ ...invoice, rejection_reason: "Missing schedule" }).retainage_cents,
    ).toBe(0);
    expect(
      invoiceInput.parse({ ...invoice, status: "submitted", retainage_cents: "" }).retainage_cents,
    ).toBeNull();
  });
});
