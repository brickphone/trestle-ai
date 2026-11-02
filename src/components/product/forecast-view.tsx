import Link from "next/link";
import { SourceLink } from "./source-link";
import type { forecast } from "@/lib/forecast";
import { formatUsd, formatDate } from "@/lib/format";
import { Panel } from "@/components/ui/panel";
import { StatGrid, StatCard } from "@/components/ui/stat-card";
import { RecordTable, cell, link } from "./record-table";
export function ForecastView({ result }: { result: ReturnType<typeof forecast> }) {
  const showBalances = result.hasBalance || result.isContribution;
  return (
    <>
      <StatGrid>
        <StatCard
          label={
            result.isContribution ? "Lowest projected net contribution" : "Lowest projected cash"
          }
          value={
            <SourceLink target={`week-${result.lowest.index}-sources`}>
              {formatUsd(showBalances ? result.lowest.minimumCents / 100 : null, { cents: true })}
            </SourceLink>
          }
          detail={
            showBalances
              ? `Week ${result.lowest.index + 1} · ${formatDate(result.lowest.start)}`
              : "Enter an opening bank balance."
          }
          footnote="Estimate · Based only on entered records and assumptions."
        />
      </StatGrid>
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
      <p className="text-sm text-fg-muted">
        Forecast starts at the beginning of the balance as-of date. Recorded receipts on or after
        that date are included. Recurring costs are estimates.{" "}
        {result.isContribution ? "Company cash is not allocated to this job." : ""}
      </p>
      {result.opening && (
        <p>
          <Link className={link} href={`/settings#balance-${result.opening.id}`}>
            Opening balance: {formatUsd(result.opening.amount_cents / 100, { cents: true })} ·{" "}
            {formatDate(result.opening.as_of_date)}
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
                {formatDate(w.start)} – {formatDate(w.end)}
              </span>
            </th>
            <td className={cell}>
              <SourceLink target={`week-${w.index}-sources`}>
                {formatUsd(showBalances ? w.startingCents / 100 : null, { cents: true })}
              </SourceLink>
            </td>
            <td className={cell}>
              <SourceLink target={`week-${w.index}-sources`}>
                {formatUsd(w.inflowCents / 100, { cents: true })}
              </SourceLink>
            </td>
            <td className={cell}>
              <SourceLink target={`week-${w.index}-sources`}>
                {formatUsd(w.outflowCents / 100, { cents: true })}
              </SourceLink>
            </td>
            <td className={`${cell} ${w.closingCents < 0 ? "font-medium text-danger-strong" : ""}`}>
              <SourceLink target={`week-${w.index}-sources`}>
                {formatUsd(showBalances ? w.closingCents / 100 : null, { cents: true })}
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
                  {formatUsd(showBalances ? w.minimumCents / 100 : null, { cents: true })} on{" "}
                  {formatDate(w.minimumDay)}. Same-day flows are netted.
                </p>
                <ul className="flex flex-col gap-2">
                  {w.sources.map((s) => (
                    <li key={s.id}>
                      <Link className={link} href={s.href}>
                        {s.label}: {formatUsd(s.amountCents / 100, { cents: true })}
                      </Link>
                      <span className="block text-xs text-fg-muted">
                        {formatDate(s.date)} · {s.estimate ? "Estimate" : "Recorded"}
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
