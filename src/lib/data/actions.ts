"use server";
import { billedEstimateSuggestion } from "../job-billing";
import { ActionError } from "./action-error";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { userDataClient } from "../supabase/server";
import { unwrap } from "../supabase/security";
import { toJson } from "../supabase/database.types";
import { context, requireOrganization, loadData } from "./repository";
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
import { jobObligations } from "../job-values";
import { refreshMissingObligations } from "../onboarding/editing";
import { scheduleBilledEstimate } from "../onboarding/model";
import { PAYMENT_RULES, FORECAST_DEFAULTS } from "../config";
import type { ActionResult } from "@/components/product/action-form";
async function perform(work: () => Promise<void>, target?: string): Promise<ActionResult> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ActionError) return { error: error.message };
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
    if (
      code === "PGRST202" ||
      code === "PGRST203" ||
      code === "42883" ||
      code === "PGRST204" ||
      code === "42703"
    )
      return {
        error:
          "Database setup needs updating. Run the current supabase/setup.sql in Supabase SQL Editor, then try again. Your saved progress is kept.",
      };
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
export async function useBilledEstimate(_: ActionResult, form: FormData): Promise<ActionResult> {
  return perform(async () => {
    const org = await writable(),
      id = uuid.parse(form.get("job_id")),
      expected = z.coerce
        .number()
        .int()
        .positive()
        .max(1e12)
        .parse(form.get("expected_estimate_cents"));
    const data = await loadData();
    if (data.organization.id !== org)
      throw new ActionError("Workspace changed. Refresh and try again.");
    const job = data.jobs.find((j) => j.id === id);
    if (!job) throw new ActionError("Job not available.");
    const prior = data.assumptions.find((a) => a.job_id === id),
      estimate = billedEstimateSuggestion(
        job,
        prior,
        data.invoices.filter((i) => i.job_id === id),
        data.changes,
        data.snapshots,
        today(),
      );
    if (estimate === null || estimate !== expected)
      throw new ActionError(
        "Billing details or the estimate changed. Refresh and check the amount before using it.",
      );
    const client = await userDataClient();
    const values = {
      billed_before_tracking_cents: estimate,
      billed_through_date: today(),
      billed_source: "schedule" as const,
    };
    if (prior) {
      const result = await client
        .from("forecast_assumptions")
        .update(values)
        .eq("organization_id", org)
        .eq("job_id", id)
        .eq("billed_before_tracking_cents", 0)
        .select("id")
        .maybeSingle();
      if (result.error) unwrap(result);
      if (!result.data)
        throw new ActionError("Billed so far changed. Refresh before making another change.");
    } else {
      const result = await client
        .from("forecast_assumptions")
        .insert({
          ...values,
          organization_id: org,
          job_id: id,
          enabled: true,
          cost_ratio_bps: FORECAST_DEFAULTS.costRatioBps,
          cost_profile: FORECAST_DEFAULTS.costProfile,
          duration_months: 1,
          payment_lag_days: FORECAST_DEFAULTS.paymentLagDays,
          retainage_release_days: 0,
          cost_mode: FORECAST_DEFAULTS.costMode,
        })
        .select("id")
        .single();
      if (result.error?.code === "23505")
        throw new ActionError("Billing details changed. Refresh before using an estimate.");
      unwrap(result);
    }
  });
}
export async function finishOnboarding(_: ActionResult, form: FormData): Promise<ActionResult> {
  return perform(async () => {
    const existing = await context();
    if (existing.organization) return;
    const name = z.string().trim().min(1).max(200).parse(form.get("name"));
    const uei = z
      .string()
      .regex(/^([A-Z0-9]{12})?$/)
      .parse(String(form.get("uei") ?? "").toUpperCase());
    const selected = z.array(z.string().max(250)).max(1000).parse(form.getAll("award"));
    const lookup =
      uei && selected.length ? await lookupUei(uei, fetch, { selectedAwardIds: selected }) : null;
    if (selected.length && lookup?.kind !== "found")
      throw new ActionError(
        "Could not refresh your selected contracts from USAspending. Your saved progress is kept. Try again, or return to Contracts to review your selection.",
      );
    const awards =
      lookup?.kind === "found" ? lookup.awards.filter((a) => selected.includes(a.externalId)) : [];
    if (awards.length !== selected.length)
      throw new ActionError(
        "Your selected awards have changed in USAspending. Return to Contracts to review them. Your other entries are kept.",
      );
    const supplied = z
      .array(
        z.object({
          externalId: z.string().max(250),
          billedCents: z.number().int().min(0).max(1_000_000_000_000),
          paymentLagDays: z.number().int().min(0).max(36500),
          billedSource: z.enum(["schedule", "manual"]).optional(),
          contractValueCents: z.number().int().positive().max(1e12).optional(),
        }),
      )
      .max(1000)
      .parse(JSON.parse(String(form.get("job_inputs") ?? "[]")));
    const jobInputs = awards.map((a) => {
      const input = supplied.find((value) => value.externalId === a.externalId);
      const value = a.obligationsCents ?? a.contractValueCents ?? input?.contractValueCents ?? null;
      if (value === null)
        throw new ActionError(
          "A selected job has no contract value. Enter it on the Contracts step.",
        );
      const estimate = scheduleBilledEstimate(value, a.startDate, a.endDate, today());
      if (!input && estimate === null)
        throw new ActionError("Check billed so far on the Contracts step.");
      return {
        externalId: a.externalId,
        ...(a.obligationsCents === null && a.contractValueCents === null
          ? { contractValueCents: input?.contractValueCents }
          : {}),
        billedSource: input?.billedSource ?? (input ? "manual" : "schedule"),
        billedCents: input?.billedCents ?? estimate!,
        paymentLagDays: input?.paymentLagDays ?? FORECAST_DEFAULTS.paymentLagDays,
        costRatioBps: FORECAST_DEFAULTS.costRatioBps,
      };
    });
    const balanceValue = String(form.get("opening_balance") ?? "");
    const amount = balanceValue ? money.parse(balanceValue) : null;
    const asOf = isoDate.parse(form.get("as_of_date"));
    if (asOf > today()) throw new Error("Future balance");
    const payroll = String(form.get("payroll") ?? "");
    const payrollAmount = payroll
      ? money.refine((v) => v >= 0, "Cannot be negative").parse(payroll)
      : null;
    const monthly = String(form.get("monthly") ?? "");
    const monthlyAmount = monthly
      ? money.refine((v) => v >= 0, "Cannot be negative").parse(monthly)
      : null;
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
        other_monthly_costs: monthlyAmount,
        job_inputs: toJson(jobInputs),
        retainage_bps: PAYMENT_RULES.governmentRetainageBps,
        payment_terms_days: PAYMENT_RULES.progressDays,
      }),
    );
  }, "/onboarding?done=1");
}
export async function saveContracts(_: ActionResult, form: FormData): Promise<ActionResult> {
  return perform(async () => {
    const ctx = await requireOrganization();
    if (ctx.readOnly || !ctx.isOwner) throw new ActionError("Only an owner can edit contracts.");
    const org = uuid.parse(form.get("organization_id"));
    if (org !== ctx.organization.id)
      throw new ActionError("This company is not the current workspace.");
    const contracts = z
      .array(
        z.discriminatedUnion("tracked", [
          z.object({ id: uuid, tracked: z.literal(false) }),
          z.object({
            id: uuid,
            tracked: z.literal(true),
            billedCents: z.number().int().min(0).max(1e12),
            paymentLagDays: z.number().int().min(0).max(36500),
            billedSource: z.enum(["schedule", "manual"]),
            contractValueCents: z.number().int().positive().max(1e12).optional(),
          }),
        ]),
      )
      .max(1000)
      .parse(JSON.parse(String(form.get("contracts") ?? "[]")));
    if (new Set(contracts.map((c) => c.id)).size !== contracts.length)
      throw new ActionError("Each contract must appear once.");
    const stored = await loadData(),
      refreshed = await refreshMissingObligations(stored, today(), lookupUei);
    const verified = contracts.map((input) => {
      const job = stored.jobs.find((j) => j.id === input.id && !j.voided_at);
      if (!job) throw new ActionError("Job not available.");
      const fresh = refreshed.jobs.find((j) => j.id === input.id);
      const snapshot = stored.snapshots.find((s) => s.id === job.source_snapshot_id);
      const publicAmount = jobObligations(fresh ?? job, snapshot);
      return {
        ...input,
        ...(publicAmount !== null ? { publicObligationsCents: publicAmount } : {}),
      };
    });
    const client = await userDataClient();
    unwrap(
      await client.rpc("update_contracts", { org_id: org, contract_values: toJson(verified) }),
    );
  });
}
export async function updateCompanySetup(_: ActionResult, form: FormData): Promise<ActionResult> {
  return perform(async () => {
    const ctx = await requireOrganization();
    if (ctx.readOnly || !ctx.isOwner)
      throw new ActionError("Only an owner can edit company setup.");
    const org = uuid.parse(form.get("organization_id"));
    if (org !== ctx.organization.id)
      throw new ActionError("This company is not the current workspace.");
    const nonnegative = money.refine((value) => value >= 0, "Cannot be negative");
    const optionalAmount = (key: string) => {
      const value = String(form.get(key) ?? "");
      return value === "" ? null : nonnegative.parse(value);
    };
    const name = z.string().trim().min(1).max(200).parse(form.get("name"));
    const uei = z
      .string()
      .regex(/^([A-Z0-9]{12})?$/)
      .parse(form.get("uei"));
    if ((uei || null) !== ctx.organization.uei)
      throw new ActionError("The company UEI stays unchanged when editing setup.");
    const jobs = z
      .array(
        z.object({
          externalId: uuid,
          billedCents: z.number().int().min(0).max(1_000_000_000_000),
          paymentLagDays: z.number().int().min(0).max(36500),
        }),
      )
      .max(1000)
      .parse(JSON.parse(String(form.get("job_inputs") ?? "[]")));
    const raw = String(form.get("opening_balance") ?? "");
    const opening = raw ? money.parse(raw) : null;
    const balanceDate = isoDate.parse(form.get("as_of_date"));
    if (balanceDate > today()) throw new ActionError("The balance date cannot be in the future.");
    const client = await userDataClient();
    unwrap(
      await client.rpc("update_company_setup", {
        org_id: org,
        setup_values: toJson({
          name,
          uei,
          openingBalanceCents: opening,
          balanceDate,
          monthlyCents: optionalAmount("monthly"),
          payrollCents: optionalAmount("payroll"),
          defaultCostRatioBps: FORECAST_DEFAULTS.costRatioBps,
          jobs: jobs.map((job) => ({
            id: job.externalId,
            billedCents: job.billedCents,
            paymentLagDays: job.paymentLagDays,
          })),
        }),
      }),
    );
  }, "/onboarding?done=1&edit=1");
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
          retainage_cents: input.retainage_cents ?? 0,
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
        .insert({
          ...input,
          organization_id: org,
          job_id: job || null,
          cost_scope: job ? "job" : "overhead",
        })
        .select("id")
        .single(),
    );
  }, "/settings");
}
export async function classifyCost(_: ActionResult, form: FormData): Promise<ActionResult> {
  return perform(async () => {
    const org = await writable(),
      id = uuid.parse(form.get("id")),
      job = String(form.get("job_id") ?? "");
    if (job) uuid.parse(job);
    const client = await userDataClient();
    unwrap(
      await client
        .from("recurring_costs")
        .update({ cost_scope: job ? "job" : "overhead", job_id: job || null })
        .eq("organization_id", org)
        .eq("id", id)
        .is("voided_at", null)
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
        duration_months: z.coerce.number().int().min(1).max(1200).default(1),
        billed_before_tracking_cents: money.refine((v) => v >= 0, "Cannot be negative"),
        billed_through_date: isoDate.refine((v) => v <= today(), "Cannot be in the future"),
        value_override_cents: z.union([
          z.literal("").transform(() => null),
          money.refine((v) => v >= 0, "Cannot be negative"),
        ]),
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
          {
            ...input,
            billed_source: "manual",
            enabled: form.get("enabled") === "on",
            organization_id: org,
          },
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
