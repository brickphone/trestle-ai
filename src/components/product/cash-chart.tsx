"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { forecast } from "@/lib/forecast";
import { addDays } from "@/lib/finance";
import { formatDate, formatShortDate, formatUsd, formatUsdCompact } from "@/lib/format";
import { Money, DateText } from "@/components/ui/financial";

type Result = ReturnType<typeof forecast>;
/** Display the existing daily, netted forecast flows without smoothing. */
export function chartSeries(result: Result) {
  let cents = result.weeks[0]!.startingCents;
  const start = result.weeks[0]!.start;
  const points = [{ day: 0, date: start, cents }];
  for (let day = 0; day < 91; day++) {
    const date = addDays(start, day);
    cents += result.weeks[Math.floor(day / 7)]!.sources.filter((s) => s.date === date).reduce(
      (sum, s) => sum + s.amountCents,
      0,
    );
    points.push({ day: day + 1, date, cents });
  }
  return points;
}
export function chartDomain(values: number[]) {
  const minimum = Math.min(...values),
    maximum = Math.max(...values);
  const distance = minimum > 0 ? minimum : maximum < 0 ? -maximum : 0;
  const showZero = distance <= Math.max(Math.abs(minimum), Math.abs(maximum)) * 0.2;
  const min = showZero ? Math.min(0, minimum) : minimum;
  const max = showZero ? Math.max(0, maximum) : maximum;
  const padding = Math.max((max - min) * 0.1, Math.abs(max) * 0.02, 100);
  return { min: min - padding, max: max + padding, showZero };
}

export function CashChart({
  result,
  sourcePrefix = "/forecast",
}: {
  result: Result;
  sourcePrefix?: string;
}) {
  const id = useId();
  const [range, setRange] = useState<4 | 13>(13);
  const [active, setActive] = useState<number | null>(null);
  if (!result.hasBalance && !result.isContribution)
    return (
      <p className="py-8 text-fg-muted">Enter an opening balance to see your cash projection.</p>
    );
  const weeks = result.weeks.slice(0, range);
  const days = range * 7;
  const points = chartSeries(result).slice(0, days + 1);
  const domain = chartDomain(points.map((p) => p.cents));
  const y = (cents: number) => ((domain.max - cents) / (domain.max - domain.min)) * 184;
  const x = (day: number) => (day / days) * 1000;
  const low = points.reduce((a, b) => (b.cents < a.cents ? b : a));
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(2)},${y(p.cents).toFixed(2)}`)
    .join(" ");
  const selected = active === null ? null : weeks[active];
  const crosshair = selected ? ((selected.index + 0.5) / range) * 100 : 0;
  const zeroY = Math.max(0, Math.min(184, y(0)));
  const ticks = [domain.max, (domain.max + domain.min) / 2, domain.min].filter(
    (value) => !domain.showZero || Math.abs(value) > 0.001,
  );
  const lowIndex = Math.min(range - 1, Math.max(0, Math.floor((low.day - 1) / 7)));
  return (
    <figure className="cash-chart" data-cash-chart aria-labelledby={`${id}-heading`}>
      <figcaption className="cash-chart-heading">
        <p id={`${id}-heading`} className="text-sm font-medium">
          {result.isContribution ? "Net contribution" : "Cash projection"}{" "}
          <span className="ml-2 text-xs font-normal text-fg-subtle">Estimate</span>
        </p>
        <div className="chart-range" role="group" aria-label="Forecast range">
          {([4, 13] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => {
                setRange(value);
                setActive(null);
              }}
            >
              {value} weeks
            </button>
          ))}
        </div>
      </figcaption>
      <div className="chart-frame">
        {ticks.map((value, i) => (
          <span
            key={i}
            data-chart-label
            className="chart-y-label"
            style={{ top: 8 + y(value) }}
            title={formatUsd(value / 100)}
          >
            {formatUsdCompact(value / 100)}
          </span>
        ))}
        {domain.showZero && (
          <span data-chart-label className="chart-y-label" style={{ top: 8 + y(0) }}>
            $0
          </span>
        )}
        <div
          className="chart-plot"
          tabIndex={0}
          role="group"
          aria-label="Interactive cash projection"
          aria-describedby={`${id}-instructions ${id}-summary`}
          onFocus={() => setActive((index) => index ?? 0)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) {
              event.preventDefault();
              if (event.key === "Escape") setActive(null);
              else if (event.key === "Home") setActive(0);
              else if (event.key === "End") setActive(range - 1);
              else
                setActive((index) =>
                  Math.max(
                    0,
                    Math.min(range - 1, (index ?? 0) + (event.key === "ArrowRight" ? 1 : -1)),
                  ),
                );
            }
          }}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setActive(
              Math.max(
                0,
                Math.min(
                  range - 1,
                  Math.floor(((event.clientX - bounds.left) / bounds.width) * range),
                ),
              ),
            );
          }}
          onPointerLeave={(event) => {
            if (document.activeElement !== event.currentTarget) setActive(null);
          }}
        >
          <svg viewBox="0 0 1000 184" preserveAspectRatio="none" aria-hidden className="chart-svg">
            {domain.min < 0 && (
              <rect
                data-below-zero
                x="0"
                y={zeroY}
                width="1000"
                height={184 - zeroY}
                fill="var(--color-danger-subtle)"
              />
            )}
            {ticks.map((value, i) => (
              <line
                key={i}
                x1="0"
                x2="1000"
                y1={y(value)}
                y2={y(value)}
                stroke="var(--color-border)"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {domain.showZero && (
              <line
                data-zero-line
                x1="0"
                x2="1000"
                y1={y(0)}
                y2={y(0)}
                stroke="var(--color-border-input)"
                strokeDasharray="3 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <path
              d={path}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {selected && (
              <line
                data-crosshair
                x1={crosshair * 10}
                x2={crosshair * 10}
                y1="0"
                y2="184"
                stroke="var(--color-border-input)"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          <span
            className={`chart-low-dot ${low.cents < 0 ? "chart-low-negative" : ""}`}
            style={{ left: `${(low.day / days) * 100}%`, top: `${(y(low.cents) / 184) * 100}%` }}
          />
          <span
            data-chart-label
            className={`chart-low-label ${low.cents < 0 ? "text-danger-strong" : ""}`}
            style={{
              left: `${(low.day / days) * 100}%`,
              top: `${(y(low.cents) / 184) * 100}%`,
              transform: `translate(${low.day / days > 0.8 ? "-100%" : low.day / days < 0.2 ? "0" : "-50%"},-100%)`,
            }}
            title={`${formatDate(low.date)} · Week ${lowIndex + 1}`}
          >
            Low {formatUsd(low.cents / 100)}
          </span>
          {[0, Math.floor(days / 3), Math.floor((days * 2) / 3), days - 1].map((day, i) => (
            <span
              key={day}
              data-chart-label
              className="chart-x-label"
              style={{
                left: `${(day / (days - 1)) * 100}%`,
                transform: `translateX(${i === 0 ? "0" : i === 3 ? "-100%" : "-50%"})`,
              }}
              title={formatDate(addDays(points[0]!.date, day))}
            >
              {formatShortDate(addDays(points[0]!.date, day))}
            </span>
          ))}
        </div>
        {selected && (
          <div
            id={`${id}-tooltip`}
            className="chart-tooltip"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            style={{
              left: `clamp(64px,calc(64px + (100% - 76px) * ${crosshair / 100} - 108px),calc(100% - 224px))`,
            }}
          >
            <p className="mb-3 text-xs text-fg-subtle">
              Week {selected.index + 1} · <DateText value={selected.start} /> –{" "}
              <DateText value={selected.end} />
            </p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-xs">
              <dt>Projected balance</dt>
              <dd className="text-right font-medium">
                <Money cents={selected.closingCents} />
              </dd>
              <dt>Money in</dt>
              <dd className="text-right">
                <Money
                  cents={selected.inflowCents}
                  className={selected.inflowCents > 0 ? "text-success-strong" : undefined}
                />
              </dd>
              <dt>Money out</dt>
              <dd className="text-right">
                <Money cents={-selected.outflowCents} />
              </dd>
            </dl>
          </div>
        )}
      </div>
      <p id={`${id}-summary`} className="sr-only">
        Estimate. Lowest projected {formatUsd(low.cents / 100)} in week {lowIndex + 1},{" "}
        {formatDate(low.date)}. The data table lists weekly amounts and their sources.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-fg-subtle">
        <p id={`${id}-instructions`}>Daily flows · Use left/right arrow keys to inspect weeks</p>
        <Link
          className="text-accent underline underline-offset-2"
          href={sourcePrefix || "#week-0-sources"}
        >
          Forecast sources
        </Link>
      </div>
      <details className="mt-4 text-sm">
        <summary className="w-fit cursor-pointer text-accent">Show chart data</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="record-table" aria-label="Cash projection chart data">
            <thead>
              <tr>
                {["Week", "Starting", "Money in", "Money out", "Closing", "Lowest", "Sources"].map(
                  (h) => (
                    <th
                      key={h}
                      scope="col"
                      data-numeric={(h !== "Week" && h !== "Sources") || undefined}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.index}>
                  <th scope="row">
                    {w.index + 1} · <DateText value={w.start} />
                  </th>
                  <td>
                    <Money cents={w.startingCents} />
                  </td>
                  <td>
                    <Money cents={w.inflowCents} />
                  </td>
                  <td>
                    <Money cents={-w.outflowCents} />
                  </td>
                  <td>
                    <Money cents={w.closingCents} />
                  </td>
                  <td>
                    <Money cents={w.minimumCents} />
                  </td>
                  <td>
                    <Link
                      className="text-accent underline"
                      href={`${sourcePrefix}#week-${w.index}-sources`}
                    >
                      Week {w.index + 1} sources
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
