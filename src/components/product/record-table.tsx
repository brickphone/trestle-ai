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
    <div
      className="min-w-0 overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-label={`${label} table`}
    >
      <table aria-label={label} className="record-table text-base">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                scope="col"
                data-numeric={
                  /amount|value|billed|outstanding|retainage|cash|receipts|costs/i.test(h) ||
                  undefined
                }
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const cell = "align-top";
export const link =
  "text-accent underline decoration-border-strong underline-offset-2 hover:text-accent-strong";
