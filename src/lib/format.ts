/**
 * Display formatting. Every formatter accepts null/undefined and returns
 * NOT_AVAILABLE, so missing source data is always shown explicitly and never
 * as 0, "$0" or an empty cell.
 *
 * All output is deterministic (fixed locale, explicit time zones) so server and
 * client renders match and exported CSVs are stable.
 */

export const NOT_AVAILABLE = "Not available";

type Maybe<T> = T | null | undefined;

const LOCALE = "en-US";

function toNumber(value: Maybe<number | string>): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Currency

const usdFull = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdCents = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdCompact = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** "$1,234,567". Pass `{ cents: true }` for "$1,234,567.89". Numeric strings (Postgres numeric) are accepted. */
export function formatUsd(value: Maybe<number | string>, opts: { cents?: boolean } = {}): string {
  const n = toNumber(value);
  if (n === null) return NOT_AVAILABLE;
  return (opts.cents ? usdCents : usdFull).format(n);
}

/** "$1.2M", "$850K", "$12.4B". Values under $1,000 are shown in full. */
export function formatUsdCompact(value: Maybe<number | string>): string {
  const n = toNumber(value);
  if (n === null) return NOT_AVAILABLE;
  if (Math.abs(n) < 1000) return usdFull.format(n);
  return usdCompact.format(n);
}

// ---------------------------------------------------------------------------
// Numbers & percentages

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

export function formatInteger(value: Maybe<number | string>): string {
  const n = toNumber(value);
  if (n === null) return NOT_AVAILABLE;
  return integer.format(n);
}

/** Decimal with fixed precision, e.g. years since first award: "4.2". */
export function formatDecimal(value: Maybe<number | string>, digits = 1): string {
  const n = toNumber(value);
  if (n === null) return NOT_AVAILABLE;
  return n.toLocaleString(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Ratio to percent: 0.1234 → "12.3%". Input is always a ratio (0–1), never a
 * pre-multiplied percentage, to avoid 100× errors.
 */
export function formatPercent(ratio: Maybe<number | string>, digits = 1): string {
  const n = toNumber(ratio);
  if (n === null) return NOT_AVAILABLE;
  return `${(n * 100).toLocaleString(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

/** Signed change: 0.25 → "+25.0%", -0.1 → "−10.0%", 0 → "0.0%". */
export function formatPercentChange(ratio: Maybe<number | string>, digits = 1): string {
  const n = toNumber(ratio);
  if (n === null) return NOT_AVAILABLE;
  const abs = formatPercent(Math.abs(n), digits);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
}

// ---------------------------------------------------------------------------
// Dates
//
// Date-only values from USAspending/SAM ("2024-03-15") are calendar dates with
// no time zone. They are parsed and formatted in UTC so they never shift by a
// day. Timestamps (ingestion runs) are formatted in UTC and labeled as such.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(value: Maybe<string | Date>): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const m = DATE_ONLY.exec(value);
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2024-03-15" */
export function formatDateIso(value: Maybe<string | Date>): string {
  const d = parseDate(value);
  if (!d) return NOT_AVAILABLE;
  return d.toISOString().slice(0, 10);
}

const humanDate = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "Mar 15, 2024" */
export function formatDate(value: Maybe<string | Date>): string {
  const d = parseDate(value);
  if (!d) return NOT_AVAILABLE;
  return humanDate.format(d);
}

const humanDateTime = new Intl.DateTimeFormat(LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** "Mar 15, 2024, 14:05 UTC" */
export function formatDateTime(value: Maybe<string | Date>): string {
  const d = parseDate(value);
  if (!d) return NOT_AVAILABLE;
  return `${humanDateTime.format(d)} UTC`;
}

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });

/** "3 days ago", "in 2 months", "today". `now` is injectable for tests. */
export function formatRelativeDate(value: Maybe<string | Date>, now: Date = new Date()): string {
  const d = parseDate(value);
  if (!d) return NOT_AVAILABLE;
  const seconds = (d.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(seconds);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 86400],
    ["month", 30 * 86400],
    ["week", 7 * 86400],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (abs >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** Duration in days: 1 → "1 day", 45 → "45 days". */
export function formatDays(value: Maybe<number | string>): string {
  const n = toNumber(value);
  if (n === null) return NOT_AVAILABLE;
  const rounded = Math.round(n);
  return `${integer.format(rounded)} ${Math.abs(rounded) === 1 ? "day" : "days"}`;
}

// ---------------------------------------------------------------------------
// UEI (SAM.gov Unique Entity ID)
//
// A UEI is 12 uppercase alphanumeric characters. SAM.gov documents additional
// rules (e.g. no letters O or I, first character not 0); we don't enforce
// those here because display must never hide a value the source returned.

const UEI_SHAPE = /^[A-Z0-9]{12}$/;

export function normalizeUei(value: Maybe<string>): string | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  return v.length > 0 ? v : null;
}

export function isUeiShaped(value: Maybe<string>): boolean {
  const v = normalizeUei(value);
  return v !== null && UEI_SHAPE.test(v);
}

/**
 * Uppercased UEI. `{ grouped: true }` inserts thin spaces for reading aloud on
 * calls ("ABCD 1234 EFGH"); grouped output is for display only — use the plain
 * form for copy, links and CSV.
 */
export function formatUei(value: Maybe<string>, opts: { grouped?: boolean } = {}): string {
  const v = normalizeUei(value);
  if (!v) return NOT_AVAILABLE;
  if (!opts.grouped || !UEI_SHAPE.test(v)) return v;
  return `${v.slice(0, 4)} ${v.slice(4, 8)} ${v.slice(8)}`;
}
