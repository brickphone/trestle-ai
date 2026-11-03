"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Lookup } from "@/lib/usaspending";
import { saveOnboardingDraft, findOnboardingCompany } from "@/lib/onboarding/actions";
import { preselectedAwards, type OnboardingDraft } from "@/lib/onboarding/model";
import { finishOnboarding } from "@/lib/data/actions";
import { AwardSelection, OnboardingDate } from "./award-selection";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/form";
import { readableCase } from "@/lib/display-case";
import { Icon } from "@/components/ui/icon";
import { MoneyInput } from "./money-input";
import { FORECAST_DEFAULTS } from "@/lib/config";
import { cents } from "@/lib/finance";

type Found = Extract<Lookup, { kind: "found" }>;
const titles = [
  "What’s your company’s UEI?",
  "Is this your company?",
  "Which contracts are you working on now?",
  "How much cash do you have today?",
  "Overhead not tied to jobs",
];
const helpers = [
  "We’ll find your company and federal awards using public USAspending data.",
  "Confirm the company before choosing the jobs you want to track.",
  "Choose the contracts to include in your workspace. You can add more later.",
  "This gives your cash forecast a starting point. You can update it later.",
  "Field crew payroll and job materials are counted per job. Enter office salaries, rent, insurance and equipment leases here.",
];
function validMoney(value: string, positive = false) {
  try {
    return (
      value.trim() !== "" && (positive ? cents(value) > 0 : Number.isSafeInteger(cents(value)))
    );
  } catch {
    return false;
  }
}
export function OnboardingFlow({
  initial,
  initialLookup = null,
  asOf,
  done: initiallyDone = false,
  initialError = "",
}: {
  initial: OnboardingDraft;
  initialLookup?: Found | null;
  asOf: string;
  done?: boolean;
  initialError?: string;
}) {
  const [done, setFinished] = useState(initiallyDone);
  const [draft, setDraft] = useState(initial),
    [result, setResult] = useState(initialLookup),
    [pending, setPending] = useState(false),
    [error, setError] = useState(initialError),
    [editing, setEditing] = useState(initial.manual),
    [editDate, setEditDate] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [draft.step, done]);
  const update = (patch: Partial<OnboardingDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const persist = async (next: OnboardingDraft) => {
    next = {
      ...next,
      furthestStep: Math.max(
        draft.furthestStep ?? draft.step,
        next.furthestStep ?? next.step,
        next.step,
      ),
    };
    const saved = await saveOnboardingDraft(next);
    if (saved.error) throw Error(saved.error);
    setDraft(next);
    setError("");
  };
  const run = async (work: () => Promise<void>) => {
    setPending(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to continue. Try again.");
    } finally {
      setPending(false);
    }
  };
  const manual = () =>
    run(async () => {
      setResult(null);
      setEditing(true);
      await persist({
        ...draft,
        step: 1,
        manual: true,
        uei: "",
        name: "",
        furthestStep: 1,
        selected: [],
        includeOlder: false,
      });
    });
  const back = () =>
    run(() =>
      persist({
        ...draft,
        step: draft.step === 3 && draft.manual ? 1 : Math.max(0, draft.step - 1),
      }),
    );
  const finish = async (skip = false) => {
    const next = {
      ...draft,
      payroll: skip ? "" : draft.payroll,
      monthly: skip ? "" : draft.monthly,
    };
    await persist(next);
    const form = new FormData();
    for (const [key, value] of Object.entries({
      name: next.name,
      uei: next.manual ? "" : next.uei,
      opening_balance: next.balance,
      as_of_date: next.asOf,
      payroll: next.payroll,
      monthly: next.monthly,
      include_older: next.includeOlder ? "1" : "0",
    }))
      form.set(key, value);
    for (const id of next.selected) form.append("award", id);
    form.set(
      "job_inputs",
      JSON.stringify(
        next.selected.map((externalId) => ({
          externalId,
          billedCents: cents(next.awardInputs?.[externalId]?.billed || "0"),
          paymentLagDays: Number(
            next.awardInputs?.[externalId]?.lag ?? FORECAST_DEFAULTS.paymentLagDays,
          ),
        })),
      ),
    );
    const saved = await finishOnboarding({}, form);
    if (saved.error) throw Error(saved.error);
    if (saved.success) setFinished(true);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (draft.step === 0) {
        const sameCompany = !draft.manual && result?.uei === draft.uei && !!draft.name;
        const found = await findOnboardingCompany(draft.uei, sameCompany && draft.includeOlder);
        if (found.kind !== "found") throw Error(found.message);
        const next = {
          ...draft,
          step: 1,
          manual: false,
          name: sameCompany ? draft.name : found.name,
          selected: sameCompany ? draft.selected : preselectedAwards(found.awards, asOf),
          includeOlder: sameCompany && draft.includeOlder,
          furthestStep: sameCompany ? draft.furthestStep : 1,
        };
        await persist(next);
        setResult(found);
        setEditing(false);
      } else if (draft.step === 1)
        await persist({ ...draft, step: draft.manual ? 3 : 2, name: draft.name.trim() });
      else if (draft.step === 2) await persist({ ...draft, step: 3 });
      else if (draft.step === 3) await persist({ ...draft, step: 4 });
      else await finish();
    });
  };
  const valid =
    draft.step === 0
      ? /^[A-Z0-9]{12}$/.test(draft.uei)
      : draft.step === 1
        ? !!draft.name.trim()
        : draft.step === 3
          ? validMoney(draft.balance) &&
            /^\d{4}-\d{2}-\d{2}$/.test(draft.asOf) &&
            draft.asOf <= asOf
          : draft.step === 2
            ? draft.selected.every((id) => {
                const input = draft.awardInputs?.[id];
                return (
                  !input ||
                  (validMoney(input.billed || "0") &&
                    cents(input.billed || "0") >= 0 &&
                    /^\d+$/.test(input.lag) &&
                    Number(input.lag) <= 36500)
                );
              })
            : draft.step === 4
              ? (!draft.payroll || (validMoney(draft.payroll) && cents(draft.payroll) >= 0)) &&
                (!draft.monthly || (validMoney(draft.monthly) && cents(draft.monthly) >= 0))
              : true;
  const validCurrency = (name: "balance" | "payroll" | "monthly") =>
    validMoney(draft[name]) && (name === "balance" || cents(draft[name]) >= 0);
  const currency = (name: "balance" | "payroll" | "monthly", label: string) => (
    <Field
      htmlFor={name}
      label={label}
      className="max-w-64"
      error={
        draft[name] && !validCurrency(name)
          ? name === "balance"
            ? "Enter a valid dollar amount."
            : "Enter a non-negative dollar amount."
          : undefined
      }
    >
      <div className="relative">
        <span aria-hidden="true" className="absolute top-2 left-3 text-fg-subtle">
          $
        </span>
        <MoneyInput
          id={name}
          name={name}
          inputMode="decimal"
          maxLength={30}
          aria-describedby={draft[name] && !validCurrency(name) ? `${name}-error` : undefined}
          autoComplete="off"
          value={draft[name]}
          onValueChange={(value) => update({ [name]: value })}
          className="pl-7 tabular-nums"
          aria-invalid={draft[name] !== "" && !validCurrency(name)}
        />
      </div>
    </Field>
  );
  return (
    <div className="onboarding-frame">
      {!done && (
        <nav
          aria-label="Onboarding steps"
          className={`onboarding-steps ${draft.step === 2 ? "onboarding-steps-wide" : ""}`}
        >
          <ol className="flex flex-col gap-5">
            {[
              "Company UEI",
              "Confirm company",
              "Contracts",
              "Cash today",
              "Overhead not tied to jobs",
            ].map((label, index) => {
              const skipped = draft.manual && index === 2;
              const current = index === draft.step;
              const completed = !current && !skipped && index < (draft.furthestStep ?? draft.step);
              return (
                <li key={label} className="relative text-sm">
                  {completed ? (
                    <>
                      <Icon name="check" className="absolute top-0.5 -left-6 text-fg-muted" />
                      <button
                        type="button"
                        disabled={pending}
                        className="text-left text-fg-muted hover:text-fg hover:underline disabled:opacity-50"
                        onClick={() => void run(() => persist({ ...draft, step: index }))}
                      >
                        {label}
                      </button>
                    </>
                  ) : (
                    <span
                      aria-current={current ? "step" : undefined}
                      className={current ? "font-medium text-fg" : "text-fg-subtle"}
                    >
                      {label}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <main
        id="main"
        data-onboarding-flow
        className={`mx-auto w-full ${draft.step === 2 ? "max-w-[720px]" : "max-w-[560px]"} px-6 pt-12 pb-10 sm:pt-16`}
      >
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={done ? 5 : draft.step}
          className="absolute top-[73px] right-0 left-0 h-px bg-border"
        >
          <div
            className="h-px bg-accent"
            style={{ width: `${done ? 100 : (draft.step / 5) * 100}%` }}
          />
        </div>
        <p className="mb-3 text-xs text-fg-subtle">
          {done ? "Setup complete" : `Step ${draft.step + 1} of 5`}
        </p>
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-[28px] leading-tight font-medium tracking-tight outline-none"
        >
          {done
            ? "You’re set up"
            : draft.manual && draft.step === 1
              ? "What’s your company called?"
              : titles[draft.step]}
        </h1>
        <p className="mt-3 mb-8 text-sm text-fg-muted">
          {done
            ? "Your workspace is ready. Add invoices to see when money comes in and how your cash may change."
            : draft.manual && draft.step === 1
              ? "Start with your company name. You can add jobs manually in your workspace."
              : helpers[draft.step]}
        </p>
        {done ? (
          <ButtonLink href="/" variant="primary">
            Go to overview
          </ButtonLink>
        ) : (
          <form onSubmit={submit}>
            <fieldset disabled={pending} className="flex min-w-0 flex-col items-start gap-5">
              {draft.step === 0 && (
                <>
                  <Field
                    label="Unique Entity Identifier (UEI)"
                    htmlFor="uei"
                    hint={
                      draft.uei && !/^[A-Z0-9]{12}$/.test(draft.uei)
                        ? "Enter all 12 letters and numbers."
                        : "12 letters and numbers. No SAM.gov login needed."
                    }
                    className="max-w-64"
                  >
                    <TextInput
                      id="uei"
                      name="uei"
                      maxLength={12}
                      size={12}
                      value={draft.uei}
                      onChange={(e) =>
                        update({ uei: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })
                      }
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={!!draft.uei && !/^[A-Z0-9]{12}$/.test(draft.uei)}
                      aria-describedby="uei-hint"
                      className="w-56 tracking-widest"
                    />
                  </Field>
                  <p className="text-sm text-fg-muted">
                    Don’t have one or not a federal contractor yet?{" "}
                    <button
                      type="button"
                      className="text-accent underline"
                      onClick={() => void manual()}
                    >
                      Set up manually.
                    </button>
                  </p>
                </>
              )}
              {draft.step === 1 && (
                <div className="w-full rounded border border-border p-5">
                  {editing ? (
                    <Field htmlFor="company-name" label="Company name" className="max-w-80">
                      <TextInput
                        id="company-name"
                        value={draft.name}
                        maxLength={200}
                        onChange={(e) => update({ name: e.target.value })}
                        autoComplete="organization"
                      />
                    </Field>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <p className="font-medium break-words">{readableCase(draft.name)}</p>
                      <button
                        type="button"
                        className="text-sm underline"
                        onClick={() => setEditing(true)}
                      >
                        Edit
                      </button>
                    </div>
                  )}
                  {!draft.manual && (
                    <>
                      <p className="mt-2 text-sm text-fg-muted">
                        {readableCase(result?.city) ?? "City not available"},{" "}
                        {result?.state ?? "State not available"}
                      </p>
                      <p className="mt-4 text-sm text-fg-muted">
                        {result?.totalAwards ?? 0} awards found ·{" "}
                        {result?.awards.filter((a) => a.endDate !== null && a.endDate >= asOf)
                          .length ?? 0}{" "}
                        active contracts
                      </p>
                      <p className="mt-2 text-xs text-fg-subtle">UEI {draft.uei} · USAspending</p>
                    </>
                  )}
                  {draft.manual && (
                    <p className="mt-3 text-xs text-fg-subtle">
                      Manual entry · Company information provided by you.
                    </p>
                  )}
                </div>
              )}
              {draft.step === 2 && result && (
                <div className="w-full">
                  <AwardSelection
                    result={result}
                    asOf={asOf}
                    selection={draft.selected}
                    onSelectionChange={(selected) => update({ selected })}
                    quickInputs={draft.awardInputs ?? {}}
                    onQuickInputChange={(id, input) =>
                      update({ awardInputs: { ...draft.awardInputs, [id]: input } })
                    }
                    onLoaded={(loaded) => {
                      setResult(loaded);
                      update({ includeOlder: !loaded.hasOlder });
                    }}
                  />
                </div>
              )}
              {draft.step === 3 && (
                <>
                  {currency("balance", "Current cash balance")}
                  <p className="text-sm text-fg-muted">
                    Balance at the start of{" "}
                    {draft.asOf === asOf ? "today" : <OnboardingDate value={draft.asOf} />} ·{" "}
                    <button
                      type="button"
                      className="text-accent underline"
                      onClick={() => setEditDate(!editDate)}
                    >
                      {editDate ? "Done" : "Edit date"}
                    </button>
                  </p>
                  {editDate && (
                    <Field label="Balance as-of date" htmlFor="as-of" className="max-w-64">
                      <TextInput
                        id="as-of"
                        type="date"
                        required
                        max={asOf}
                        value={draft.asOf}
                        onChange={(e) => update({ asOf: e.target.value })}
                      />
                    </Field>
                  )}
                  <p className="text-xs text-fg-subtle">Enter 0 only if your balance is zero.</p>
                </>
              )}
              {draft.step === 4 && (
                <>
                  {currency("monthly", "Monthly overhead")}
                  {currency("payroll", "Weekly office payroll (optional)")}
                </>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {draft.step > 0 && (
                  <Button type="button" onClick={() => void back()}>
                    {draft.step === 1 && !draft.manual ? "Not my company" : "Back"}
                  </Button>
                )}
                <Button variant="primary" type="submit" disabled={!valid || pending}>
                  {pending
                    ? "Saving…"
                    : draft.step === 1 && !draft.manual
                      ? "Yes, continue"
                      : draft.step === 4
                        ? "Finish setup"
                        : "Continue"}
                </Button>
                {(draft.step === 3 || draft.step === 4) && (
                  <button
                    type="button"
                    className="ml-1 text-sm text-fg-muted underline"
                    onClick={() =>
                      void run(() =>
                        draft.step === 3
                          ? persist({ ...draft, step: 4, balance: "", asOf })
                          : finish(true),
                      )
                    }
                  >
                    Skip for now
                  </button>
                )}
              </div>
            </fieldset>
            {pending && draft.step === 0 && (
              <div role="status" className="mt-6 w-full rounded border border-border p-5">
                <p className="text-sm text-fg-muted">Finding your company and awards…</p>
                <div aria-hidden="true" className="mt-4 h-4 w-3/4 rounded bg-surface-muted" />
                <div aria-hidden="true" className="mt-3 h-3 w-1/2 rounded bg-surface-muted" />
              </div>
            )}
            {error && (
              <div role="alert" className="mt-5 text-sm text-danger-strong">
                <p>{error}</p>
                {draft.step === 0 && (
                  <button
                    type="button"
                    className="mt-2 text-accent underline"
                    onClick={() => void manual()}
                  >
                    Continue with manual entry
                  </button>
                )}
              </div>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
