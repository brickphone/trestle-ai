import {
  formatDate,
  formatDateIso,
  formatShortDate,
  formatUsd,
  moneyParts,
  parseDate,
} from "@/lib/format";
import { cn } from "@/lib/cn";

export function Money({
  cents,
  whole = false,
  className,
}: {
  cents: number | null | undefined;
  whole?: boolean;
  className?: string;
}) {
  const value = moneyParts(cents, whole);
  return (
    <span
      className={cn(
        "money whitespace-nowrap tabular-nums",
        value.negative && "text-danger-strong",
        className,
      )}
      title={whole && cents != null ? formatUsd(cents / 100, { cents: true }) : undefined}
    >
      {value.major}
      {value.fraction && <span className="text-fg-subtle">{value.fraction}</span>}
    </span>
  );
}

export function DateText({ value }: { value: string | Date | null | undefined }) {
  if (!parseDate(value)) return <span>Not available</span>;
  return (
    <time dateTime={formatDateIso(value)} title={formatDate(value)}>
      {formatShortDate(value)}
    </time>
  );
}
