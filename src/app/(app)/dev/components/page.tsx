import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, EstimateBadge, PartialDataBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, NumberInput, Select, TextInput } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { PageBody, PageHeader } from "@/components/ui/page-header";
import { DescriptionList, Panel } from "@/components/ui/panel";
import { StatCard, StatGrid } from "@/components/ui/stat-card";
import {
  Callout,
  EmptyState,
  ErrorState,
  LoadingState,
  NotAvailable,
} from "@/components/ui/states";
import {
  formatDate,
  formatDateIso,
  formatPercent,
  formatPercentChange,
  formatUei,
  formatUsd,
  formatUsdCompact,
} from "@/lib/format";
import { TableDemo } from "./table-demo";

export const metadata: Metadata = { title: "Component reference" };

/**
 * Development-only reference for the design system. All values on this page
 * are synthetic and labeled as such. Returns 404 in production builds.
 */
export default function ComponentReferencePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      <PageHeader
        title="Component reference"
        breadcrumbs={[
          { label: "Overview", href: "/" },
          { label: "Development" },
          { label: "Components" },
        ]}
        description="Design-system components with synthetic values. Development builds only."
        meta={<Badge tone="warning">Synthetic data</Badge>}
        actions={
          <>
            <Button variant="secondary">Secondary</Button>
            <Button variant="primary">Primary</Button>
          </>
        }
      />
      <PageBody>
        <Callout tone="warning" title="Synthetic values">
          Every firm, figure and UEI on this page is generated for layout testing and does not
          describe a real entity.
        </Callout>

        <StatGrid>
          <StatCard label="Firms ingested" value="1,284" detail="Segment A · California" />
          <StatCard
            label="In target band"
            value="612"
            detail={`${formatPercent(612 / 1284)} of ingested`}
          />
          <StatCard
            label="Obligated, last 12 months"
            value={formatUsdCompact(48_200_000)}
            detail={formatPercentChange(0.124) + " vs prior 12 months"}
          />
          <StatCard
            label="Subaward volume"
            value={formatUsdCompact(3_100_000)}
            footnote={<PartialDataBadge />}
          />
          <StatCard
            label="Peak cash need"
            value={formatUsdCompact(312_000)}
            footnote={<EstimateBadge />}
          />
        </StatGrid>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Detail panel" description="DescriptionList inside a Panel" id="demo-panel">
            <DescriptionList
              items={[
                {
                  label: "UEI",
                  value: <span className="font-mono">{formatUei("SYN000000001")}</span>,
                },
                { label: "Registration status", value: <Badge tone="success">Active</Badge> },
                {
                  label: "Initial registration",
                  value: formatDate("2016-04-12"),
                  note: formatDateIso("2016-04-12"),
                },
                {
                  label: "Total obligated (5y)",
                  value: formatUsd(8_412_330),
                  numeric: true,
                  note: "Sum of transaction obligations",
                },
                { label: "Largest award", value: formatUsd(1_950_000), numeric: true },
                {
                  label: "Congressional district",
                  value: <NotAvailable reason="Not provided by source" />,
                },
              ]}
            />
          </Panel>

          <Panel title="Badges, buttons, inputs" id="demo-controls">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Badge>Neutral</Badge>
                <Badge tone="accent">In target band</Badge>
                <Badge tone="success">Active</Badge>
                <Badge tone="warning">Expiring soon</Badge>
                <Badge tone="danger">Expired</Badge>
                <Badge tone="danger" solid>
                  Excluded
                </Badge>
                <PartialDataBadge />
                <EstimateBadge />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Primary</Button>
                <Button>Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
                <Button disabled>Disabled</Button>
                <Button size="sm">
                  <Icon name="external" size={14} />
                  View on USAspending
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contract value" htmlFor="demo-value" hint="Base and all options">
                  <NumberInput id="demo-value" prefix="$" defaultValue={750000} />
                </Field>
                <Field label="Payment lag" htmlFor="demo-lag">
                  <NumberInput id="demo-lag" suffix="days" defaultValue={45} />
                </Field>
                <Field label="Segment" htmlFor="demo-seg">
                  <Select id="demo-seg" defaultValue="a">
                    <option value="a">A · Federal construction</option>
                    <option value="b">B · DoD manufacturing</option>
                  </Select>
                </Field>
                <Field label="Owner" htmlFor="demo-owner" error="Owner is required">
                  <TextInput id="demo-owner" aria-invalid aria-describedby="demo-owner-error" />
                </Field>
              </div>
            </div>
          </Panel>
        </div>

        <Panel
          title="Data table"
          description="5,000 synthetic rows, virtualized"
          id="demo-table"
          flush
        >
          <div className="p-4">
            <TableDemo />
          </div>
        </Panel>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <EmptyState title="No firms yet" description="Shown when a query returns nothing." />
          <LoadingState rows={3} />
          <ErrorState
            title="SAM.gov request failed"
            description="Enrichment for 12 firms did not complete."
            detail="HTTP 429 Too Many Requests"
          />
        </div>
      </PageBody>
    </>
  );
}
