import { z } from "zod";
export const isoDate = z.iso.date();
export function addDays(day: string, days: number) {
  isoDate.parse(day);
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${isoDate.parse(to)}T00:00:00Z`) -
      Date.parse(`${isoDate.parse(from)}T00:00:00Z`)) /
      86400000,
  );
}
export const today = () => new Date().toISOString().slice(0, 10);
export function cents(value: string) {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("Enter an amount with up to two decimal places.");
  const negative = value.trim().startsWith("-");
  const [whole, decimal = ""] = value.trim().replace("-", "").split(".");
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 1_000_000_000_000)
    throw new Error("Amount is too large.");
  return negative ? -amount : amount;
}
export function retainedCents(amount: number, bps: number) {
  return Math.round((amount * bps) / 10000);
}
export function invoiceDueDate(invoice: {
  submitted_date: string | null;
  proper_receipt_date: string | null;
  payment_terms_days: number;
}) {
  const base = invoice.proper_receipt_date ?? invoice.submitted_date;
  return {
    date: base ? addDays(base, invoice.payment_terms_days) : null,
    confirmed: !!invoice.proper_receipt_date,
  };
}
export function isLate(
  invoice: {
    status: string;
    submitted_date: string | null;
    proper_receipt_date: string | null;
    payment_terms_days: number;
  },
  remaining: number,
  on: string,
) {
  const due = invoiceDueDate(invoice).date;
  return remaining > 0 && ["submitted", "accepted"].includes(invoice.status) && !!due && due < on;
}
