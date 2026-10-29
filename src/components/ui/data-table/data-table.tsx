"use client";

import {
  useTable,
  type ColumnVisibilityState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatInteger } from "@/lib/format";
import { Icon } from "../icon";
import { ColumnPicker } from "./column-picker";
import { dataTableFeatures, type DataTableColumn } from "./features";

const ROW_HEIGHT = 32; // keep in sync with --spacing-row

type Controlled<T> = { value: T; onChange: (next: T) => void };

export type DataTableProps<TData extends RowData> = {
  /** Accessible name for the grid, e.g. "Prospects". */
  label: string;
  /** Must be referentially stable (module scope or useMemo). */
  columns: DataTableColumn<TData>[];
  /** Must be referentially stable. Pre-filter before passing in. */
  data: TData[];
  getRowId: (row: TData) => string;
  initialSorting?: SortingState;
  /** Control sorting from outside (saved views, URL state). */
  sorting?: Controlled<SortingState>;
  /** Default hidden columns, e.g. `{ naics: false }`. */
  defaultColumnVisibility?: ColumnVisibilityState;
  columnVisibility?: Controlled<ColumnVisibilityState>;
  /** Show the column picker in the toolbar. */
  columnPicker?: boolean;
  /** Left side of the toolbar (e.g. title, export button). */
  toolbar?: ReactNode;
  /** Scroll-viewport height. Rows are virtualized within it. */
  height?: number | string;
  /** Rendered when `data` is empty. */
  empty?: ReactNode;
  /** Total before filtering, for the "Showing x of y" footer. */
  totalCount?: number;
};

/**
 * Dense, sortable, virtualized data grid.
 *
 * Semantics: a real <table> laid out with CSS grid so rows can be absolutely
 * positioned for virtualization; aria-rowcount/aria-rowindex tell assistive
 * tech the true size. Sorting uses buttons inside <th> with aria-sort.
 * Navigation from a row should be a link in a cell (keyboard + middle-click),
 * never a click handler on <tr>.
 */
export function DataTable<TData extends RowData>({
  label,
  columns,
  data,
  getRowId,
  initialSorting = [],
  sorting,
  defaultColumnVisibility = {},
  columnVisibility,
  columnPicker = false,
  toolbar,
  height = 560,
  empty,
  totalCount,
}: DataTableProps<TData>) {
  const controlledState = useMemo(() => {
    const state: { sorting?: SortingState; columnVisibility?: ColumnVisibilityState } = {};
    if (sorting) state.sorting = sorting.value;
    if (columnVisibility) state.columnVisibility = columnVisibility.value;
    return state;
  }, [sorting, columnVisibility]);

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    enableSortingRemoval: true,
    initialState: { sorting: initialSorting, columnVisibility: defaultColumnVisibility },
    state: controlledState,
    ...(sorting
      ? {
          onSortingChange: (u) => sorting.onChange(typeof u === "function" ? u(sorting.value) : u),
        }
      : {}),
    ...(columnVisibility
      ? {
          onColumnVisibilityChange: (u) =>
            columnVisibility.onChange(typeof u === "function" ? u(columnVisibility.value) : u),
        }
      : {}),
    defaultColumn: { size: 140, minSize: 60, sortUndefined: "last" },
  });

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  // TanStack Virtual returns non-memoizable functions; the compiler skips this component by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 12,
  });

  const leafColumns = table.getAllLeafColumns();
  const pickerColumns = leafColumns.map((c) => ({
    id: c.id,
    label:
      c.columnDef.meta?.label ??
      (typeof c.columnDef.header === "string" ? c.columnDef.header : c.id),
    visible: c.getIsVisible(),
    canHide: c.getCanHide(),
  }));

  const onToggleColumn = useCallback(
    (id: string, visible: boolean) => table.getColumn(id)?.toggleVisibility(visible),
    [table],
  );

  const headerGroups = table.getHeaderGroups();
  const virtualRows = virtualizer.getVirtualItems();

  return (
    <div className="flex min-w-0 flex-col rounded-md border border-border bg-surface">
      {(toolbar || columnPicker) && (
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">{toolbar}</div>
          {columnPicker ? (
            <ColumnPicker
              columns={pickerColumns}
              onToggle={onToggleColumn}
              onReset={() => table.resetColumnVisibility()}
            />
          ) : null}
        </div>
      )}

      {rows.length === 0 && empty ? (
        <div className="p-4">{empty}</div>
      ) : (
        <div
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label={`${label} table, scrollable`}
          className="relative overflow-auto"
          style={{ height }}
        >
          <table
            aria-label={label}
            aria-rowcount={rows.length + headerGroups.length}
            className="grid min-w-full text-base"
            style={{ width: table.getTotalSize() }}
          >
            <thead className="sticky top-0 z-10 grid bg-surface-muted">
              {headerGroups.map((group) => (
                <tr
                  key={group.id}
                  aria-rowindex={1}
                  className="flex w-full border-b border-border-strong"
                >
                  {group.headers.map((header) => {
                    const col = header.column;
                    const sorted = col.getIsSorted();
                    const align = col.columnDef.meta?.align ?? "left";
                    const canSort = col.getCanSort();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          sorted === "asc"
                            ? "ascending"
                            : sorted === "desc"
                              ? "descending"
                              : undefined
                        }
                        title={col.columnDef.meta?.description}
                        className="flex h-8 items-center text-left text-xs font-semibold text-fg-muted"
                        style={{ width: header.getSize(), flex: `1 0 ${header.getSize()}px` }}
                      >
                        {header.isPlaceholder ? null : canSort ? (
                          <button
                            type="button"
                            onClick={col.getToggleSortingHandler()}
                            className={cn(
                              "flex h-full w-full items-center gap-1 px-3 hover:bg-surface-hover hover:text-fg focus-visible:-outline-offset-2",
                              align === "right" && "flex-row-reverse text-right",
                            )}
                          >
                            <span className="truncate">
                              <table.FlexRender header={header} />
                            </span>
                            <Icon
                              name={
                                sorted === "asc"
                                  ? "sortAsc"
                                  : sorted === "desc"
                                    ? "sortDesc"
                                    : "sortNone"
                              }
                              size={12}
                              className={sorted ? "text-accent" : "text-fg-subtle"}
                            />
                          </button>
                        ) : (
                          <span
                            className={cn(
                              "w-full truncate px-3",
                              align === "right" && "text-right",
                            )}
                          >
                            <table.FlexRender header={header} />
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="relative grid" style={{ height: virtualizer.getTotalSize() }}>
              {virtualRows.map((item) => {
                const row = rows[item.index];
                if (!row) return null;
                return (
                  <tr
                    key={row.id}
                    data-index={item.index}
                    aria-rowindex={item.index + headerGroups.length + 1}
                    className="absolute flex w-full border-b border-border hover:bg-surface-hover"
                    style={{ transform: `translateY(${item.start}px)`, height: ROW_HEIGHT }}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const align = cell.column.columnDef.meta?.align ?? "left";
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            "flex items-center truncate px-3 text-fg",
                            align === "right" && "justify-end text-right tabular",
                          )}
                          style={{
                            width: cell.column.getSize(),
                            flex: `1 0 ${cell.column.getSize()}px`,
                          }}
                        >
                          <span className="truncate">
                            <table.FlexRender cell={cell} />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex h-8 items-center justify-between border-t border-border px-3 text-sm text-fg-subtle">
        <span aria-live="polite">
          {totalCount !== undefined && totalCount !== rows.length
            ? `Showing ${formatInteger(rows.length)} of ${formatInteger(totalCount)} rows`
            : `${formatInteger(rows.length)} rows`}
        </span>
        <span className="hidden sm:inline">
          Click a column header to sort; Shift-click to sort by several.
        </span>
      </div>
    </div>
  );
}
