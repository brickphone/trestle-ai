import type { ReactNode } from "react";
export function RecordTable({
  label,
  headers,
  children,
}: {
  label: string;
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded border border-border bg-surface">
      <table aria-label={label} className="w-full text-left text-base">
        <thead className="bg-surface-muted">
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                scope="col"
                className="border-b border-border-strong px-3 py-2 text-xs font-semibold text-fg-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
export const cell = "px-3 py-2 align-top";
export const link =
  "text-accent underline decoration-border-strong underline-offset-2 hover:text-accent-strong";
