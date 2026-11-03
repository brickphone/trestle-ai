import Link from "next/link";
import { redirect } from "next/navigation";
import { context } from "@/lib/data/repository";
import { lookupUei } from "@/lib/usaspending";
import { finishOnboarding } from "@/lib/data/actions";
import { ActionForm } from "@/components/product/action-form";
import { Input, Hidden } from "@/components/product/fields";
import { PageHeader, PageBody } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { formatUsd } from "@/lib/format";
import { DateText } from "@/components/ui/financial";
import { today } from "@/lib/finance";
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ uei?: string; page?: string; manual?: string }>;
}) {
  const ctx = await context();
  if (ctx.organization) redirect("/");
  const params = await searchParams;
  const manual = params.manual === "1";
  const uei = (params.uei ?? "").trim().toUpperCase();
  const page = Math.max(1, Math.min(500, Number(params.page) || 1));
  const result = uei && !manual ? await lookupUei(uei, fetch, page) : null;
  const currentDate = today();
  return (
    <>
      <PageHeader
        title="Set up your company"
        description="Find your federal awards or enter your company and jobs manually."
      />
      <PageBody>
        {!manual && (
          <Panel title="1. Find your company">
            <form action="/onboarding" className="flex flex-col gap-3">
              <Input
                name="uei"
                label="Unique Entity Identifier (UEI)"
                value={uei}
                hint="12 letters and numbers. No SAM.gov credentials are needed."
              />
              <div>
                <Button type="submit">Look up UEI</Button>
              </div>
            </form>
            <Link
              className="mt-3 inline-block text-accent underline"
              href="/onboarding?manual=1#company-details"
            >
              Continue with manual entry
            </Link>
          </Panel>
        )}
        {manual && (
          <Link href="/onboarding" className="text-accent underline">
            Look up company by UEI instead
          </Link>
        )}
        {result && result.kind !== "found" && (
          <p
            role="status"
            className="border border-warning bg-warning-subtle p-3 text-warning-strong"
          >
            {result.message}
          </p>
        )}
        {(manual || result) && (
          <Panel
            id="company-details"
            title={
              result?.kind === "found"
                ? "2. Confirm company and select contracts"
                : "Enter company details"
            }
            description={
              result?.kind === "found"
                ? "USAspending data is a starting point. Confirm imported contract values and dates on each job."
                : "Manual entry · Company and job information is provided by you."
            }
          >
            <ActionForm action={finishOnboarding} label="Create workspace">
              <Hidden name="uei" value={!manual && /^[A-Z0-9]{12}$/.test(uei) ? uei : ""} />
              <Hidden name="page" value={String(page)} />
              <Input
                name="name"
                label="Company name"
                value={result?.kind === "found" ? result.name : ""}
                required
              />
              {result?.kind === "found" && (
                <div className="flex flex-col gap-2">
                  {result.awards.length === 0 && (
                    <p>No contract awards found on this page. You can add jobs manually.</p>
                  )}
                  {result.awards.map((award) => (
                    <div key={award.externalId} className="rounded border border-border p-3">
                      <Checkbox
                        name="award"
                        value={award.externalId}
                        label={`${award.contractNumber} · ${award.agency ?? "Agency not available"}`}
                      />
                      <p className="mt-1 text-sm">{award.description ?? "Not available"}</p>
                      <p className="text-sm text-fg-muted">
                        Current award value:{" "}
                        {formatUsd(
                          award.contractValueCents === null ? null : award.contractValueCents / 100,
                          { cents: true },
                        )}{" "}
                        · Obligations:{" "}
                        {formatUsd(
                          award.obligationsCents === null ? null : award.obligationsCents / 100,
                          { cents: true },
                        )}{" "}
                        · <DateText value={award.startDate} /> – <DateText value={award.endDate} />
                      </p>
                      <a href={award.sourceUrl} className="text-sm text-accent underline">
                        USAspending source
                      </a>
                    </div>
                  ))}
                  {result.hasMore && (
                    <p>
                      More awards available.{" "}
                      <Link
                        href={`/onboarding?uei=${uei}&page=${page + 1}`}
                        className="text-accent underline"
                      >
                        Next page
                      </Link>{" "}
                      (selection applies to the current page).
                    </p>
                  )}
                  {page > 1 && (
                    <Link
                      href={`/onboarding?uei=${uei}&page=${page - 1}`}
                      className="text-accent underline"
                    >
                      Previous page
                    </Link>
                  )}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  name="opening_balance"
                  label="Opening bank balance ($)"
                  required
                  hint="Balance at the start of the as-of date. Enter 0 only if the balance is zero."
                />
                <Input
                  name="as_of_date"
                  label="Balance as-of date"
                  type="date"
                  value={currentDate}
                  required
                  max={currentDate}
                />
                <Input
                  name="payroll"
                  label="Weekly payroll estimate ($)"
                  hint="Optional. You can add recurring costs in Settings."
                />
              </div>
              <p className="text-sm text-fg-muted">
                Never enter government portal logins, bank credentials, SSNs or EINs.
              </p>
            </ActionForm>
          </Panel>
        )}
      </PageBody>
    </>
  );
}
