import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/lib/data/actions", () => ({ saveJob: vi.fn(), saveInvoice: vi.fn() }));
import { JobForm } from "../job-form";
import { InvoiceForm } from "../invoice-form";
import { demo } from "./fixtures";
import { PAYMENT_RULES } from "@/lib/config";
it("new government job/invoice retainage defaults to zero independently of subcontractor defaults", () => {
  expect(renderToStaticMarkup(<JobForm />)).toMatch(/name="retainage_bps"[^>]*value="0"/);
  expect(renderToStaticMarkup(<InvoiceForm jobs={demo.jobs} />)).toMatch(
    /name="retainage_cents"[^>]*value="0"/,
  );
  expect(PAYMENT_RULES.subcontractorRetainageBps).toBe(500);
  const existing = renderToStaticMarkup(
    <InvoiceForm jobs={demo.jobs} invoice={demo.invoices[0]} />,
  );
  expect(existing).toContain(`value="${(demo.invoices[0]!.retainage_cents / 100).toFixed(2)}"`);
});
it("status labels use sentence case while persisted option values remain unchanged", () => {
  const html = renderToStaticMarkup(<JobForm />);
  expect(html).toContain('value="complete">Completed</option>');
  expect(html).toContain('value="active" selected="">Active</option>');
});
