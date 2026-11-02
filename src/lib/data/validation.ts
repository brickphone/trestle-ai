import { z } from "zod";
import { cents, isoDate, today } from "../finance";
export const optionalText = z
  .string()
  .trim()
  .max(4000)
  .transform((v) => v || null);
export const optionalDate = z.union([isoDate, z.literal("")]).transform((v) => v || null);
export const money = z.string().transform((v, ctx) => {
  try {
    return cents(v);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: e instanceof Error ? e.message : "Invalid amount" });
    return z.NEVER;
  }
});
export const positiveMoney = money.refine((v) => v > 0, "Must be greater than zero");
export const optionalMoney = z.union([z.literal("").transform(() => null), money]);
export const uuid = z.uuid();
export const jobInput = z
  .object({
    contract_number: z.string().trim().min(1).max(200),
    agency: optionalText,
    description: optionalText,
    contract_value_cents: optionalMoney.refine(
      (v) => v === null || v >= 0,
      "Value cannot be negative",
    ),
    start_date: optionalDate,
    end_date: optionalDate,
    retainage_bps: z.coerce
      .number()
      .min(0)
      .max(100)
      .transform((v) => Math.round(v * 100)),
    payment_terms_days: z.coerce.number().int().min(0).max(365),
    status: z.enum(["planned", "active", "complete", "closed"]),
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: "End date precedes start date",
    path: ["end_date"],
  });
export const invoiceInput = z
  .object({
    job_id: uuid,
    invoice_number: z.string().trim().min(1).max(200),
    period_start: isoDate,
    period_end: isoDate,
    billed_cents: positiveMoney,
    retainage_cents: z.union([z.literal("").transform(() => null), money]),
    submitted_date: optionalDate,
    proper_receipt_date: optionalDate,
    expected_payment_date: optionalDate,
    expected_retainage_date: optionalDate,
    portal: z.enum(["WAWF/PIEE", "IPP", "other"]),
    status: z.enum(["draft", "submitted", "accepted", "rejected"]),
    rejection_reason: optionalText,
  })
  .refine((v) => v.period_end >= v.period_start, {
    message: "Billing period end precedes start",
    path: ["period_end"],
  })
  .refine((v) => v.status === "draft" || !!v.submitted_date, {
    message: "Submitted date is required",
    path: ["submitted_date"],
  })
  .refine((v) => v.status !== "rejected" || !!v.rejection_reason, {
    message: "Rejection reason is required",
    path: ["rejection_reason"],
  })
  .refine(
    (v) =>
      v.retainage_cents === null || (v.retainage_cents >= 0 && v.retainage_cents <= v.billed_cents),
    { message: "Retainage must be between zero and billed amount", path: ["retainage_cents"] },
  );
export const paymentInput = z.object({
  invoice_id: uuid,
  received_date: isoDate.refine((v) => v <= today(), "Payment date cannot be in the future"),
  amount_cents: positiveMoney,
  kind: z.enum(["progress", "retainage"]),
  reference: optionalText,
});
export type InputOrigin = { kind: "manual" } | { kind: "csv"; batchId: string };
/** Manual forms and future import adapters share these validators and write services. */
export interface DataSource<T> {
  origin: InputOrigin;
  parse(input: unknown): T;
}
export const manualJobs: DataSource<z.infer<typeof jobInput>> = {
  origin: { kind: "manual" },
  parse: (input) => jobInput.parse(input),
};
