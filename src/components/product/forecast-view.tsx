import Link from "next/link";
import { SourceLink, SourceDisclosure } from "./source-link";
import type { forecast } from "@/lib/forecast";
import { formatDate } from "@/lib/format";
import { Money, DateText } from "@/components/ui/financial";
import { CashChart } from "./cash-chart";
import { Panel } from "@/components/ui/panel";
import { StatGrid, StatCard } from "@/components/ui/stat-card";
import { RecordTable, cell, link } from "./record-table";
export function ForecastView({ result }: { result: ReturnType<typeof forecast> }) {
  const showBalances = result.hasBalance || result.isContribution;
  return (
    <>
      <SourceDisclosure />
      <StatGrid>
        <StatCard
          label={
            result.isContribution ? "Lowest projected net contribution" : "Lowest projected cash"
          }
          value={
            <SourceLink target={`week-${result.lowest.index}-sources`}>
              <Money cents={showBalances ? result.lowest.minimumCents : null} whole />
            </SourceLink>
          }
          detail={
            showBalances
              ? `Week ${result.lowest.index + 1} · ${formatDate(result.lowest.minimumDay)}`
              : "Enter an opening bank balance."
          }
          footnote="Estimate · Based only on entered records and assumptions."
        />
      </StatGrid>
      <CashChart result={result} sourcePrefix="" />
      {result.issues.length > 0 && (
        <Panel title="Missing inputs and exclusions">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            {result.issues.map((issue, i) => (
              <li key={i}>
                <Link href={issue.href} className={link}>
                  {issue.label}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <p id="projection-sources" className="text-sm text-fg-muted">
        Forecast starts at the beginning of the balance as-of date. Recorded receipts on or after
        that date are included. Recurring costs are estimates. Projected, not invoiced receipts are
        separate from real invoices; any invoice suppresses the projection for its billing period.
        “Projected, assumed already invoiced, please confirm” estimates unpaid historical monthly
        billings within the payment lag, allocated from Billed so far. It adds no past job costs and
        does not reduce the future unbilled budget a second time. A $0 billed baseline produces no
        assumed receivable; confirm actual billed amounts and enter outstanding invoices. Remaining
        unbilled value is spread across uncovered months. Job cost ratios cover field payroll and
        materials; company office overhead is added once. Entered job costs replace the entire cost
        model for that job. Unclassified company costs are excluded while job costs are projected.
        Untracked jobs keep their real invoices, receipts and entered costs; future job projections
        are excluded. Projected retainage is withheld, with no assumed release date.{" "}
        {result.isContribution ? "Company cash is not allocated to this job." : ""}
      </p>
      {result.opening && (
        <p>
          <Link className={link} href={`/settings#balance-${result.opening.id}`}>
            Opening balance: <Money cents={result.opening.amount_cents} /> ·{" "}
            <DateText value={result.opening.as_of_date} />
          </Link>
        </p>
      )}
      <RecordTable
        label="13-week cash forecast"
        headers={[
          "Week",
          "Starting cash",
          "Government receipts",
          "Costs",
          "Closing cash",
          "Sources",
        ]}
      >
        {result.weeks.map((w) => (
          <tr key={w.index}>
            <th scope="row" className={cell}>
              Week {w.index + 1}
              <span className="block text-xs font-normal text-fg-muted">
                <DateText value={w.start} /> – <DateText value={w.end} />
              </span>
            </th>
            <td className={cell}>
              <SourceLink target={`week-${w.index}-sources`}>
                <Money cents={showBalances ? w.startingCents : null} />
              </SourceLink>
            </td>
            <td className={cell}>
              <SourceLink target={`week-${w.index}-sources`}>
                <Money cents={w.inflowCents} />
              </SourceLink>
            </td>
            <td className={cell}>
              <SourceLink target={`week-${w.index}-sources`}>
                <Money cents={w.outflowCents} />
              </SourceLink>
            </td>
            <td className={`${cell} ${w.closingCents < 0 ? "font-medium text-danger-strong" : ""}`}>
              <SourceLink target={`week-${w.index}-sources`}>
                <Money cents={showBalances ? w.closingCents : null} />
              </SourceLink>
            </td>
            <td className={cell}>
              <details id={`week-${w.index}-sources`}>
                <summary className="cursor-pointer text-accent">
                  {w.sources.length} source entries
                </summary>
                <p className="py-2 text-xs text-fg-muted">
                  Starting cash = opening balance + all prior-week sources. Closing cash = starting
                  cash + receipts − costs.
                </p>
                <p className="pb-2 text-xs">
                  {result.opening && (
                    <Link href={`/settings#balance-${result.opening.id}`} className={link}>
                      Opening balance
                    </Link>
                  )}
                  {w.index > 0 && (
                    <>
                      {" "}
                      +{" "}
                      <SourceLink target={`week-${w.index - 1}-sources`}>
                        Prior closing balance and source entries
                      </SourceLink>
                    </>
                  )}
                  . Lowest daily balance this week:{" "}
                  <Money cents={showBalances ? w.minimumCents : null} /> on{" "}
                  <DateText value={w.minimumDay} />. Same-day flows are netted.
                </p>
                <ul className="flex flex-col gap-2">
                  {w.sources.map((s) => (
                    <li key={s.id}>
                      <Link className={link} href={s.href}>
                        {s.label}: <Money cents={s.amountCents} />
                      </Link>
                      <span className="block text-xs text-fg-muted">
                        {s.jobId && <>{s.jobNumber} · </>}
                        <DateText value={s.date} /> · {s.estimate ? "Estimate" : "Recorded"}
                        {(s.projection === "billing" || s.projection === "assumed-receivable") &&
                          s.period && (
                            <>
                              {" "}
                              · Billing period <DateText value={s.period.start} />–
                              <DateText value={s.period.end} /> · Gross{" "}
                              <Money cents={s.grossCents} /> less withheld retainage{" "}
                              <Money cents={s.retainedCents} />
                            </>
                          )}
                      </span>
                    </li>
                  ))}
                  {!w.sources.length && <li className="text-sm">No source entries this week.</li>}
                </ul>
              </details>
            </td>
          </tr>
        ))}
      </RecordTable>
    </>
  );
}
