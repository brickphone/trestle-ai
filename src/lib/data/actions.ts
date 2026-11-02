"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { userDataClient } from "../supabase/server";
import { unwrap } from "../supabase/security";
import { toJson } from "../supabase/database.types";
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
import { isoDate, today } from "../finance";
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
    const message =
      cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string"
        ? cause.message
        : undefined;
    if (code === "23505") return { error: "A record with this reference already exists." };
    if (code === "42501" || message === "Read-only account")
      return { error: "This account does not have permission to make this change." };
    if (code === "P0001" && message) return { error: message };
    if (code === "23514" || code === "23503")
      return {
        error:
          "These values conflict with the record or its linked records. Check dates, amounts and references.",
      };
    return { error: "Unable to save. Check your entries and try again." };
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
    const client = await userDataClient();
    unwrap(
      await client.rpc("complete_onboarding", {
        company_name: name,
        company_uei: uei || null,
        company_origin: awards.length ? "usaspending" : "manual",
        awards: toJson(
          awards.map((a) => ({ ...a, companyName: lookup?.kind === "found" ? lookup.name : null })),
        ),
        opening_balance: amount,
        balance_date: asOf,
        payroll: payrollAmount,
        retainage_bps: PAYMENT_RULES.retainageBps,
        payment_terms_days: PAYMENT_RULES.progressDays,
      }),
    );
  }, "/");
}
export async function saveJob(_: ActionResult, form: FormData): Promise<ActionResult> {
  const id = String(form.get("id") ?? "");
  return perform(
    async () => {
      const org = await writable(),
        input = manualJobs.parse(Object.fromEntries(form));
      const client = await userDataClient();
      if (id) {
        uuid.parse(id);
        unwrap(
          await client
            .from("jobs")
            .update(input)
            .eq("id", id)
            .eq("organization_id", org)
            .is("voided_at", null)
            .select("id")
            .single(),
        );
      } else
        unwrap(
          await client
            .from("jobs")
            .insert({ ...input, organization_id: org })
            .select("id")
            .single(),
        );
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
    const client = await userDataClient();
    if (id) {
      uuid.parse(id);
      unwrap(
        await client
          .from("change_orders")
          .update(input)
          .eq("id", id)
          .eq("organization_id", org)
          .eq("job_id", input.job_id)
          .is("voided_at", null)
          .select("id")
          .single(),
      );
    } else
      unwrap(
        await client
          .from("change_orders")
          .insert({ ...input, organization_id: org })
          .select("id")
          .single(),
      );
  }, `/jobs/${job}`);
}
export async function saveInvoice(_: ActionResult, form: FormData): Promise<ActionResult> {
  let target = "/invoices";
  return perform(async () => {
    const org = await writable();
    const input = invoiceInput.parse(Object.fromEntries(form));
    const id = String(form.get("id") ?? "");
    const resubmission = String(form.get("resubmission_of_id") ?? "");
    const client = await userDataClient();
    const saved = unwrap(
      await client.rpc("save_government_invoice", {
        org_id: org,
        invoice_id: id ? uuid.parse(id) : null,
        invoice_values: toJson({
          ...input,
          resubmission_of_id: resubmission ? uuid.parse(resubmission) : null,
        }),
      }),
    );
    target = `/invoices/${saved}`;
  }).then((result) => {
    if (!result.error) redirect(target);
    return result;
  });
}
export async function recordPayment(_: ActionResult, form: FormData): Promise<ActionResult> {
  const invoice = String(form.get("invoice_id"));
  return perform(async () => {
    const org = await writable();
    const input = paymentInput.parse(Object.fromEntries(form));
    const client = await userDataClient();
    unwrap(
      await client.rpc("record_government_payment", { org_id: org, payment_values: toJson(input) }),
    );
  }, `/invoices/${invoice}`);
}
export async function saveBalance(_: ActionResult, form: FormData): Promise<ActionResult> {
  return perform(async () => {
    const org = await writable();
    const amount = money.parse(form.get("amount_cents")),
      day = isoDate.parse(form.get("as_of_date"));
    if (day > today()) throw new Error("Future balance");
    const job = String(form.get("job_id") ?? "");
    if (job) uuid.parse(job);
    const client = await userDataClient();
    unwrap(
      await client
        .from("cash_balance_entries")
        .insert({
          organization_id: org,
          job_id: job || null,
          amount_cents: amount,
          as_of_date: day,
        })
        .select("id")
        .single(),
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
    const client = await userDataClient();
    unwrap(
      await client
        .from("recurring_costs")
        .insert({ ...input, organization_id: org, job_id: job || null })
        .select("id")
        .single(),
    );
  }, "/settings");
}
export async function saveAssumptions(_: ActionResult, form: FormData): Promise<ActionResult> {
  const job = String(form.get("job_id"));
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
    const client = await userDataClient();
    unwrap(
      await client
        .from("forecast_assumptions")
        .upsert(
          { ...input, enabled: form.get("enabled") === "on", organization_id: org },
          { onConflict: "organization_id,job_id" },
        )
        .select("id")
        .single(),
    );
  }, `/jobs/${job}#assumptions`);
}
export async function voidRecord(_: ActionResult, form: FormData): Promise<ActionResult> {
  return perform(async () => {
    const org = await writable();
    const kind = z
        .enum(["job", "change", "invoice", "payment", "balance", "cost"])
        .parse(form.get("kind")),
      id = uuid.parse(form.get("id")),
      reason = z.string().trim().min(1).max(2000).parse(form.get("reason"));
    const client = await userDataClient();
    unwrap(
      await client.rpc("void_financial_record", {
        org_id: org,
        record_kind: kind,
        record_id: id,
        reason,
      }),
    );
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
    const client = await userDataClient();
    unwrap(
      await client
        .from("government_invoices")
        .update(input)
        .eq("id", id)
        .eq("organization_id", org)
        .is("voided_at", null)
        .neq("status", "rejected")
        .select("id")
        .single(),
    );
  }, `/invoices/${id}`);
}
export async function selectOrganization(form: FormData): Promise<void> {
  const ctx = await context();
  if (!ctx.isStaff) throw new Error("Staff access required");
  const id = uuid.parse(form.get("organization_id"));
  if (!ctx.organizations.some((o) => o.id === id)) throw new Error("Organization unavailable");
  const { cookies } = await import("next/headers");
  (await cookies()).set("organization", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  revalidatePath("/", "layout");
  redirect("/");
}
