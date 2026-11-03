# Design polish pass 2

The wide dashboard previously stretched its cash figures apart and enlarged SVG labels with the chart. The UI now uses near-black actions, warm neutrals and a centered content area of at most 1200px. The two cash figures form one left-aligned group with a 48px gap. Overview’s visible title/subtitle and the lettermark have been removed.

The existing SVG chart is retained. Its frame is 220px high; HTML labels stay at 12px independently of width. The domain follows the data with padding, with a zero line only near/crossing zero and a muted red area below zero when applicable. Hover and keyboard inspection show the week, closing balance and weekly money in/out. Arrow keys, Home/End, Escape, 4/13-week selection and the chart data table are supported.

Lists now show date, invoice/counterparty or cost, job context and amount. Green/red only identify incoming/outgoing money or financial status; amber identifies warnings. The organization and compact Account disclosure remain at the bottom. Hover transitions are 140ms and respect reduced motion.

## Demo and scope

All images use the same fictional, isolated demo: 3 jobs, 12 invoices spanning paid/submitted/accepted/late/rejected/draft, weekly payroll and three manual subcontract-payment estimates. The forecast dips to $34,000 in week 2 and recovers as receipts arrive. The payment estimates use the existing manual-cost interface in the test fixture; they do not claim that a subcontractor ledger exists. No production records, forecast calculations, schema, RLS policies or server actions changed.

The hosted demo account is not provisioned by this visual pass and still requires its existing server-only configuration. These are review/test renders of the real screens, not authenticated hosted screenshots.

## Before and after

Both sides use the same demo records and dates. Click an image to inspect full size.

### 1280px

| Screen              | Before                                                                         | After                                                                                     |
| ------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Overview, demo      | ![Before Overview, demo at 1280px](visual-pass2-before/overview-demo-1280.png) | ![After Overview, demo at 1280px](../e2e/visual.spec.ts-snapshots/overview-demo-1280.png) |
| Jobs                | ![Before Jobs at 1280px](visual-pass2-before/jobs-1280.png)                    | ![After Jobs at 1280px](../e2e/visual.spec.ts-snapshots/jobs-1280.png)                    |
| Government invoices | ![Before Government invoices at 1280px](visual-pass2-before/invoices-1280.png) | ![After Government invoices at 1280px](../e2e/visual.spec.ts-snapshots/invoices-1280.png) |
| Forecast            | ![Before Forecast at 1280px](visual-pass2-before/forecast-1280.png)            | ![After Forecast at 1280px](../e2e/visual.spec.ts-snapshots/forecast-1280.png)            |

### 1920px

| Screen              | Before                                                                         | After                                                                                     |
| ------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Overview, demo      | ![Before Overview, demo at 1920px](visual-pass2-before/overview-demo-1920.png) | ![After Overview, demo at 1920px](../e2e/visual.spec.ts-snapshots/overview-demo-1920.png) |
| Jobs                | ![Before Jobs at 1920px](visual-pass2-before/jobs-1920.png)                    | ![After Jobs at 1920px](../e2e/visual.spec.ts-snapshots/jobs-1920.png)                    |
| Government invoices | ![Before Government invoices at 1920px](visual-pass2-before/invoices-1920.png) | ![After Government invoices at 1920px](../e2e/visual.spec.ts-snapshots/invoices-1920.png) |
| Forecast            | ![Before Forecast at 1920px](visual-pass2-before/forecast-1920.png)            | ![After Forecast at 1920px](../e2e/visual.spec.ts-snapshots/forecast-1920.png)            |

## Interaction detail

![Weekly chart tooltip](visual-pass2-after/chart-tooltip.png)

## Validation

- 143 tests pass, including source reconciliation, conditional zero domains/shading, demo density, money formatting, token contrast and existing finance/RLS/migration tests.
- 41 Playwright checks pass: 24 responsive snapshots across 1024/1280/1440/1920, axe across 20 screen states, chart data keyboard access, real mounted chart interaction, fixed height/label-size checks and bounded layout.
- The actual chart component is mounted with an isolated test-only Vite entry against the real Next CSS/fonts. No chart library was added or replaced.
- Production build rejects Inter/Lucide. Lint and typecheck pass. Changed files are formatted; the whole-repository formatting check also flags `todo.md`, which is outside this pass and was left untouched.
- Public auth/redirect browser checks pass; 14 hosted-dependent tests remain pending without dedicated hosted credentials.

No commit or PR has been created.
