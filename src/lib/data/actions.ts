"use server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withDb } from "../db";
import * as s from "../db/schema";
import { context, requireOrganization } from "./repository";
import {
  manualJobs,
  invoiceInput,
  paymentInput,
  money,
  positiveMoney,
  optionalDate,
  optionalText,
  uuid,
} from "./validation";
import { retainedCents, isoDate, today } from "../finance";
import { lookupUei } from "../usaspending";
import { PAYMENT_RULES } from "../config";
import type { ActionResult } from "@/components/product/action-form";
async function perform(work: () => Promise<void>, target?: string): Promise<ActionResult> {
  try {
    await work();
  } catch (error) {
    if (error instanceof z.ZodError)
      return {
        error: error.issues
          .map((i) => `${i.path.join(" ").replaceAll("_", " ")}: ${i.message}`)
          .join("; "),
      };
    const cause = error instanceof Error && "cause" in error ? error.cause : error;
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
    if (code === "23505") return { error: "A record with this reference already exists." };
    if (code === "42501") return { error: "You do not have permission to make this change." };
    if (code === "P0001" && cause instanceof Error) return { error: cause.message };
    if (code === "23514" || code === "23503")
      return {
        error:
          "These values conflict with the record or its linked records. Check dates, amounts and references.",
      };
    return {
      error:
        error instanceof Error && error.message === "Read-only account"
          ? "This account is read-only."
          : "Unable to save. Check your entries and try again.",
    };
  }
  revalidatePath("/", "layout");
  if (target) redirect(target);
  return { success: "Saved." };
}
async function writable() {
  const ctx = await requireOrganization();
  if (ctx.readOnly) throw new Error("Read-only account");
  return ctx.organization.id;
}
export async function finishOnboarding(_: ActionResult, form: FormData): Promise<ActionResult> {
  return perform(async () => {
    const existing = await context();
    if (existing.organization) throw new Error("Already onboarded");
    const name = z.string().trim().min(1).max(200).parse(form.get("name"));
    const uei = z
      .string()
      .regex(/^([A-Z0-9]{12})?$/)
      .parse(String(form.get("uei") ?? "").toUpperCase());
    const selected = z.array(z.string().max(250)).max(20).parse(form.getAll("award"));
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .parse(form.get("page") ?? 1);
    const lookup = uei && selected.length ? await lookupUei(uei, fetch, page) : null;
    if (selected.length && lookup?.kind !== "found") throw new Error("Lookup failed");
    const awards =
      lookup?.kind === "found" ? lookup.awards.filter((a) => selected.includes(a.externalId)) : [];
    if (awards.length !== selected.length) throw new Error("Awards changed; refresh selection");
    const balanceValue = String(form.get("opening_balance") ?? "");
    const amount = balanceValue ? money.parse(balanceValue) : null;
    const asOf = isoDate.parse(form.get("as_of_date"));
    if (asOf > today()) throw new Error("Future balance");
    const payroll = String(form.get("payroll") ?? "");
    const payrollAmount = payroll ? positiveMoney.parse(payroll) : null;
    await withDb(async (tx) => {
      const [row] = await tx.execute<{ id: string }>(
        sql`select app.create_organization(${name},${uei || null},${awards.length ? "usaspending" : "manual"}) as id`,
      );
      if (!row) throw new Error("Organization not created");
      const org = row.id;
      for (const award of awards) {
        const [snapshot] = await tx
          .insert(s.sourceSnapshots)
          .values({
            organization_id: org,
            external_id: award.externalId,
            source_url: award.sourceUrl,
            original: { ...award, companyName: lookup?.kind === "found" ? lookup.name : null },
          })
          .returning();
        await tx.insert(s.jobs).values({
          organization_id: org,
          source_snapshot_id: snapshot!.id,
          contract_number: award.contractNumber,
          agency: award.agency,
          description: award.description,
          contract_value_cents: award.contractValueCents,
          start_date: award.startDate,
          end_date: award.endDate,
          retainage_bps: PAYMENT_RULES.retainageBps,
          payment_terms_days: PAYMENT_RULES.progressDays,
          status: "active",
        });
      }
      if (amount !== null)
        await tx
          .insert(s.cashBalanceEntries)
          .values({ organization_id: org, amount_cents: amount, as_of_date: asOf });
      if (payrollAmount !== null)
        await tx.insert(s.recurringCosts).values({
          organization_id: org,
          label: "Weekly payroll estimate",
          category: "payroll",
          amount_cents: payrollAmount,
          frequency: "weekly",
          start_date: asOf,
        });
      await tx
        .update(s.organizations)
        .set({ onboarding_complete: true })
        .where(eq(s.organizations.id, org));
    });
  }, "/");
}
export async function saveJob(_: ActionResult, form: FormData): Promise<ActionResult> {
  const id = String(form.get("id") ?? "");
  return perform(
    async () => {
      const org = await writable();
      const input = manualJobs.parse(Object.fromEntries(form));
      await withDb(async (tx) => {
        if (id) {
          uuid.parse(id);
          const rows = await tx
            .update(s.jobs)
            .set(input)
            .where(and(eq(s.jobs.id, id), eq(s.jobs.organization_id, org)))
            .returning();
          if (!rows.length) throw new Error("Missing job");
        } else await tx.insert(s.jobs).values({ ...input, organization_id: org });
      });
    },
    id ? `/jobs/${id}` : "/jobs",
  );
}
export async function saveChange(_: ActionResult, form: FormData): Promise<ActionResult> {
  const job = String(form.get("job_id"));
  return perform(async () => {
    const org = await writable();
    const input = z
      .object({
        job_id: uuid,
        reference: z.string().trim().min(1).max(200),
        amount_cents: money,
        date: isoDate,
        status: z.enum(["pending", "approved", "rejected"]),
        notes: optionalText,
      })
      .parse(Object.fromEntries(form));
    const id = String(form.get("id") ?? "");
    await withDb(async (tx) => {
      if (id) {
        uuid.parse(id);
        const rows = await tx
          .update(s.changeOrders)
          .set(input)
          .where(
            and(
              eq(s.changeOrders.id, id),
              eq(s.changeOrders.organization_id, org),
              eq(s.changeOrders.job_id, input.job_id),
            ),
          )
          .returning();
        if (!rows.length) throw new Error("Missing change");
      } else await tx.insert(s.changeOrders).values({ ...input, organization_id: org });
    });
  }, `/jobs/${job}`);
}
export async function saveInvoice(_: ActionResult, form: FormData): Promise<ActionResult> {
  let target = "/invoices";
  return perform(async () => {
    const org = await writable();
    const input = invoiceInput.parse(Object.fromEntries(form));
    const id = String(form.get("id") ?? "");
    const resubmission = String(form.get("resubmission_of_id") ?? "");
    await withDb(async (tx) => {
      const [job] = await tx
        .select()
        .from(s.jobs)
        .where(and(eq(s.jobs.id, input.job_id), eq(s.jobs.organization_id, org)))
        .for("update");
      if (!job || job.voided_at) throw new Error("Missing job");
      const values = {
        ...input,
        retainage_cents:
          input.retainage_cents ?? retainedCents(input.billed_cents, job.retainage_bps),
      };
      if (id) {
        uuid.parse(id);
        const [invoice] = await tx
          .select()
          .from(s.governmentInvoices)
          .where(
            and(eq(s.governmentInvoices.id, id), eq(s.governmentInvoices.organization_id, org)),
          )
          .for("update");
        if (!invoice || invoice.voided_at) throw new Error("Missing invoice");
        // Snapshot terms are unchanged by edits to the job defaults.
        await tx.update(s.governmentInvoices).set(values).where(eq(s.governmentInvoices.id, id));
        target = `/invoices/${id}`;
      } else {
        const [invoice] = await tx
          .insert(s.governmentInvoices)
          .values({
            ...values,
            organization_id: org,
            payment_terms_days: job.payment_terms_days,
            resubmission_of_id: resubmission ? uuid.parse(resubmission) : null,
          })
          .returning();
        target = `/invoices/${invoice!.id}`;
      }
    });
    // perform's target is chosen after the transaction below.
    revalidatePath("/", "layout");
  }).then((result) => {
    if (!result.error) redirect(target);
    return result;
  });
}
export async function recordPayment(_: ActionResult, form: FormData): Promise<ActionResult> {
  const invoiceId = String(form.get("invoice_id"));
  return perform(async () => {
    const org = await writable();
    const input = paymentInput.parse(Object.fromEntries(form));
    await withDb(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(s.governmentInvoices)
        .where(
          and(
            eq(s.governmentInvoices.id, input.invoice_id),
            eq(s.governmentInvoices.organization_id, org),
          ),
        )
        .for("update");
      if (!invoice) throw new Error("Missing invoice");
      await tx.insert(s.governmentPayments).values({ ...input, organization_id: org });
      const [paid] = await tx
        .select({
          amount: sql<number>`coalesce(sum(${s.governmentPayments.amount_cents}),0)::float8`,
        })
        .from(s.governmentPayments)
        .where(
          and(
            eq(s.governmentPayments.invoice_id, input.invoice_id),
            eq(s.governmentPayments.kind, "progress"),
            sql`${s.governmentPayments.voided_at} is null`,
          ),
        );
      if (paid?.amount === invoice.billed_cents - invoice.retainage_cents)
        await tx
          .update(s.governmentInvoices)
          .set({ status: "paid" })
          .where(eq(s.governmentInvoices.id, input.invoice_id));
    });
  }, `/invoices/${invoiceId}`);
}
export async function saveBalance(_: ActionResult, form: FormData): Promise<ActionResult> {
  return perform(async () => {
    const org = await writable();
    const amount = money.parse(form.get("amount_cents")),
      day = isoDate.parse(form.get("as_of_date"));
    if (day > today()) throw new Error("Future balance");
    const job = String(form.get("job_id") ?? "");
    if (job) uuid.parse(job);
    await withDb((tx) =>
      tx.insert(s.cashBalanceEntries).values({
        organization_id: org,
        job_id: job || null,
        amount_cents: amount,
        as_of_date: day,
      }),
    );
  }, "/forecast");
}
export async function saveCost(_: ActionResult, form: FormData): Promise<ActionResult> {
  return perform(async () => {
    const org = await writable();
    const input = z
      .object({
        label: z.string().trim().min(1).max(200),
        category: z.enum(["payroll", "other"]),
        amount_cents: positiveMoney,
        frequency: z.enum(["weekly", "monthly"]),
        start_date: isoDate,
        end_date: optionalDate,
      })
      .refine((v) => !v.end_date || v.end_date >= v.start_date, {
        message: "End date precedes start date",
        path: ["end_date"],
      })
      .parse(Object.fromEntries(form));
    const job = String(form.get("job_id") ?? "");
    if (job) uuid.parse(job);
    await withDb((tx) =>
      tx.insert(s.recurringCosts).values({ ...input, organization_id: org, job_id: job || null }),
    );
  }, "/settings");
}
export async function saveAssumptions(_: ActionResult, form: FormData): Promise<ActionResult> {
  const jobId = String(form.get("job_id"));
  return perform(async () => {
    const org = await writable();
    const input = z
      .object({
        job_id: uuid,
        cost_ratio_bps: z.coerce
          .number()
          .min(0)
          .max(1000)
          .transform((v) => Math.round(v * 100)),
        cost_profile: z.enum(["even", "front-loaded"]),
        duration_months: z.coerce.number().int().min(1).max(1200),
        payment_lag_days: z.coerce.number().int().min(0).max(36500),
        retainage_release_days: z.coerce.number().int().min(0).max(36500),
        cost_mode: z.enum(["explicit", "modeled"]),
      })
      .parse(Object.fromEntries(form));
    const enabled = form.get("enabled") === "on";
    await withDb(async (tx) => {
      const [existing] = await tx
        .select()
        .from(s.forecastAssumptions)
        .where(
          and(
            eq(s.forecastAssumptions.organization_id, org),
            eq(s.forecastAssumptions.job_id, input.job_id),
          ),
        );
      if (existing)
        await tx
          .update(s.forecastAssumptions)
          .set({ ...input, enabled })
          .where(eq(s.forecastAssumptions.id, existing.id));
      else
        await tx.insert(s.forecastAssumptions).values({ ...input, enabled, organization_id: org });
    });
  }, `/jobs/${jobId}#assumptions`);
}
export async function voidRecord(_: ActionResult, form: FormData): Promise<ActionResult> {
  return perform(async () => {
    const org = await writable();
    const kind = z
      .enum(["job", "change", "invoice", "payment", "balance", "cost"])
      .parse(form.get("kind"));
    const id = uuid.parse(form.get("id"));
    const reason = z.string().trim().min(1).max(2000).parse(form.get("reason"));
    await withDb(async (tx) => {
      const table = {
        job: s.jobs,
        change: s.changeOrders,
        invoice: s.governmentInvoices,
        payment: s.governmentPayments,
        balance: s.cashBalanceEntries,
        cost: s.recurringCosts,
      }[kind];
      if (kind === "payment") {
        const [payment] = await tx
          .select()
          .from(s.governmentPayments)
          .where(
            and(eq(s.governmentPayments.id, id), eq(s.governmentPayments.organization_id, org)),
          );
        if (payment && payment.kind === "progress" && !payment.voided_at) {
          await tx
            .select()
            .from(s.governmentInvoices)
            .where(eq(s.governmentInvoices.id, payment.invoice_id))
            .for("update");
          await tx
            .update(s.governmentInvoices)
            .set({ status: "accepted" })
            .where(
              and(
                eq(s.governmentInvoices.id, payment.invoice_id),
                eq(s.governmentInvoices.status, "paid"),
              ),
            );
        }
      }
      if (kind === "job") {
        const [invoice] = await tx
          .select()
          .from(s.governmentInvoices)
          .where(
            and(
              eq(s.governmentInvoices.job_id, id),
              sql`${s.governmentInvoices.voided_at} is null`,
            ),
          );
        if (invoice) throw new Error("Void the job invoices first");
      }
      const rows = await tx
        .update(table)
        .set({ voided_at: new Date(), void_reason: reason })
        .where(and(eq(table.id, id), eq(table.organization_id, org)))
        .returning({ id: table.id });
      if (!rows.length) throw new Error("Missing record");
    });
  });
}

export async function updateInvoiceTiming(_: ActionResult, form: FormData): Promise<ActionResult> {
  const id = String(form.get("invoice_id"));
  return perform(async () => {
    const org = await writable();
    uuid.parse(id);
    const input = z
      .object({
        expected_payment_date: optionalDate,
        expected_retainage_date: optionalDate,
        proper_receipt_date: optionalDate,
      })
      .parse(Object.fromEntries(form));
    await withDb(async (tx) => {
      const rows = await tx
        .update(s.governmentInvoices)
        .set(input)
        .where(
          and(
            eq(s.governmentInvoices.id, id),
            eq(s.governmentInvoices.organization_id, org),
            sql`${s.governmentInvoices.voided_at} is null`,
            sql`${s.governmentInvoices.status} <> 'rejected'`,
          ),
        )
        .returning();
      if (!rows.length) throw new Error("Missing invoice");
    });
  }, `/invoices/${id}`);
}

export async function selectOrganization(form: FormData): Promise<void> {
  const ctx = await context();
  if (!ctx.isStaff) throw new Error("Staff access required");
  const id = uuid.parse(form.get("organization_id"));
  if (!ctx.organizations.some((o) => o.id === id)) throw new Error("Organization unavailable");
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  jar.set("organization", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  revalidatePath("/", "layout");
  redirect("/");
}
