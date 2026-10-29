import type { SVGProps } from "react";

/**
 * Minimal stroke icon set (16px grid, 1.5px stroke). Icons are decorative by
 * default (aria-hidden); pass `aria-label` and `aria-hidden={false}` when an
 * icon is the only content of a control.
 */

const paths = {
  overview: "M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z",
  list: "M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5",
  pipeline: "M2.5 3h11l-4 5v4.5l-3 1.5V8z",
  calculator:
    "M3.5 1.5h9v13h-9zM5.5 4h5v2h-5zM5.5 8.5h1M8 8.5h1M10.5 8.5h0M5.5 11h1M8 11h1M10.5 11v0",
  runs: "M8 2.5a5.5 5.5 0 1 0 5.5 5.5M8 5v3l2 1.5M11 1.5l2.5 1L12.5 5",
  chevronRight: "M6 3.5 10.5 8 6 12.5",
  chevronDown: "M3.5 6 8 10.5 12.5 6",
  sortAsc: "M8 3.5v9M4.5 7 8 3.5 11.5 7",
  sortDesc: "M8 3.5v9M4.5 9 8 12.5 11.5 9",
  sortNone: "M5 6 8 3l3 3M5 10l3 3 3-3",
  external: "M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5v4H2.5V4h4",
  columns: "M2.5 2.5h11v11h-11zM6.2 2.5v11M9.8 2.5v11",
  download: "M8 2.5v8M4.5 7 8 10.5 11.5 7M2.5 13.5h11",
  alert: "M8 2 14.5 13.5h-13zM8 6.5v3.5M8 11.8v.2",
  info: "M8 1.75a6.25 6.25 0 1 1 0 12.5 6.25 6.25 0 0 1 0-12.5M8 7.25v4M8 4.75v.25",
  check: "M3 8.5 6.5 12 13 4.5",
  close: "M4 4l8 8M12 4l-8 8",
  search: "M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9M10.5 10.5l3 3",
  signOut: "M6.5 2.5h-4v11h4M10 5l3 3-3 3M13 8H6",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 16,
  className,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
