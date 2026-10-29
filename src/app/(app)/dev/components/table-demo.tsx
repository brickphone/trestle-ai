"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataTableColumnHelper } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Field, Select, TextInput } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/states";
import { syntheticRows, type SyntheticRow } from "@/dev/synthetic";
import { formatDate, formatInteger, formatUei, formatUsdCompact } from "@/lib/format";

const h = dataTableColumnHelper<SyntheticRow>();

const columns = h.columns([
  h.accessor("name", { header: "Firm", size: 220, sortFn: "text" }),
  h.accessor("uei", {
    header: "UEI",
    size: 130,
    cell: (c) => <span className="font-mono text-sm">{formatUei(c.getValue())}</span>,
  }),
  h.accessor("state", { header: "State", size: 70 }),
  h.accessor("naics", { header: "NAICS", size: 90 }),
  h.accessor("obligated12m", {
    header: "Obligated 12m",
    size: 130,
    meta: { align: "right", description: "Sum of federal_action_obligation, last 12 months" },
    cell: (c) => formatUsdCompact(c.getValue()),
  }),
  h.accessor("awardCount", {
    header: "Awards",
    size: 90,
    meta: { align: "right" },
    cell: (c) => formatInteger(c.getValue()),
  }),
  h.accessor("score", { header: "Score", size: 80, meta: { align: "right" } }),
  h.accessor("firstAward", {
    header: "First award",
    size: 120,
    sortFn: "text",
    cell: (c) => formatDate(c.getValue()),
  }),
  h.accessor("excluded", {
    header: "Status",
    size: 110,
    enableSorting: false,
    cell: (c) =>
      c.getValue() ? (
        <Badge tone="danger" solid>
          Excluded
        </Badge>
      ) : (
        <Badge>Active</Badge>
      ),
  }),
]);

export function TableDemo() {
  const all = useMemo(() => syntheticRows(5000), []);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!state || r.state === state) &&
        (!q || r.name.toLowerCase().includes(q) || r.uei.toLowerCase().includes(q)),
    );
  }, [all, query, state]);

  return (
    <div className="flex flex-col gap-3">
      <FilterBar
        onSubmit={(e) => e.preventDefault()}
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              setState("");
            }}
          >
            Reset
          </Button>
        }
      >
        <Field label="Search firm or UEI" htmlFor="demo-q" className="w-64">
          <TextInput id="demo-q" value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <Field label="State" htmlFor="demo-state" className="w-32">
          <Select id="demo-state" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All</option>
            {["CA", "TX", "VA", "FL", "WA", "AZ", "CO", "OH"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
      </FilterBar>
      <DataTable
        label="Synthetic firms"
        columns={columns}
        data={rows}
        totalCount={all.length}
        getRowId={(r) => r.uei}
        initialSorting={[{ id: "score", desc: true }]}
        defaultColumnVisibility={{ naics: false }}
        columnPicker
        toolbar={
          <Button size="sm">
            <Icon name="download" size={14} />
            Export CSV
          </Button>
        }
        empty={<EmptyState title="No matching firms" description="Change or reset the filters." />}
      />
    </div>
  );
}
