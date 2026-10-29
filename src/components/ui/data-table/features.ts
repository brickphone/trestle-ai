import {
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type CellData,
  type ColumnDef,
  type RowData,
  type TableFeatures,
} from "@tanstack/react-table";

/**
 * The single TanStack Table v9 feature set used by every grid in the app.
 * Filtering happens before data reaches the table (filter bar → filtered
 * array), which keeps the grid fast at 5,000+ rows and the filter logic
 * testable outside React.
 */
export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  columnSizingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    text: sortFn_text,
    datetime: sortFn_datetime,
    basic: sortFn_basic,
  },
});

export type DataTableFeatures = typeof dataTableFeatures;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- columns of mixed value types
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>;

export function dataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

declare module "@tanstack/table-core" {
  // Must mirror the original declaration's type parameters exactly.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    /** Right-align numeric columns. */
    align?: "left" | "right";
    /** Plain-text name for the column picker and CSV header when `header` is not a string. */
    label?: string;
    /** Tooltip on the header: source field or definition (traceability). */
    description?: string;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}
