# Trestle GovCon

Internal prospecting and pre-underwriting tool for small US federal contractors. It finds and
pre-scores firms from public government data (USAspending.gov, SAM.gov) for two segments:

- **Segment A — Federal construction contractors** (lead), California by default.
- **Segment B — DoD manufacturing suppliers**, nationwide.

Strategy context: [`docs/wedge-segments-overview.pdf`](docs/wedge-segments-overview.pdf).
Internal use only, for two founders. No lending or customer-facing features.

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript (strict) · Tailwind CSS v4 (design tokens
only) · TanStack Table v9 + TanStack Virtual · Postgres on Supabase · Drizzle ORM · zod · Vitest ·
Playwright + axe.

## Setup

Requires Node 20+ and npm.

```sh
npm install
cp .env.example .env.local   # fill in values, see below
npm run dev                  # http://localhost:3000
```

Use `localhost`, not `127.0.0.1`: Next.js blocks dev resources (HMR, client JS) requested from other
origins, so the page won't hydrate on `127.0.0.1`.

### Environment variables

Validated with zod in `src/lib/env.ts`. Each variable group is checked when it's first used, and a
missing or malformed value produces an error that lists every problem. Server secrets are only
reachable through `src/lib/server-env.ts` (`server-only`), so importing them into a client
component fails the build.

| Variable                        | Used by           | Notes                                       |
| ------------------------------- | ----------------- | ------------------------------------------- |
| `DATABASE_URL`                  | server, scripts   | Postgres connection string (Supabase)       |
| `NEXT_PUBLIC_SUPABASE_URL`      | browser, server   | Supabase project URL (auth)                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser, server   | Publishable key, safe for the browser       |
| `SAM_API_KEY`                   | enrichment script | SAM.gov public API key. Never in the client |

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server                                    |
| `npm run build`     | Production build                              |
| `npm run lint`      | ESLint (Next core-web-vitals + TS + Prettier) |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm run format`    | Prettier (with Tailwind class sorting)        |
| `npm test`          | Unit tests (Vitest)                           |
| `npm run test:e2e`  | Playwright smoke + axe accessibility tests    |

The first time you run e2e tests, install the browser with `npx playwright install chromium`.

## Design system

Tokens live in `src/app/globals.css` (`@theme`). Tailwind's default palette, radii, shadows and type
scale are **reset**, so only project tokens compile. For example, `bg-blue-500` or `rounded-xl`
produce no CSS.

- **Color:** neutral grays, one navy accent, success / warning / danger. All text tokens meet
  WCAG AA (≥ 4.5:1). Form-control borders use `border-input` (3.7:1, WCAG 1.4.11).
- **Type:** Public Sans (UI) and IBM Plex Mono (UEIs), with tabular numerals everywhere. The 12px
  minimum and 14px body are tuned for density.
- **Spacing and shape:** 4px grid (Tailwind's default spacing base), 2–4px radii, 1px borders. The
  only shadow is `shadow-menu`, used for popovers.
- **Components** (`src/components/ui`): `PageHeader` + breadcrumbs, `DataTable` (sortable,
  virtualized, column picker), `FilterBar` + form fields, `StatCard`, `Panel` + `DescriptionList`,
  `Badge` (incl. `PartialDataBadge`, `EstimateBadge`), and `EmptyState` / `LoadingState` /
  `ErrorState` / `NotAvailable`.
- **Formatting** (`src/lib/format.ts`): USD (full and compact), dates (ISO and human, with
  calendar dates handled as UTC), percentages (input is always a ratio), and UEI. Every formatter
  returns "Not available" for missing values.

In development, `/dev/components` shows every component with clearly labeled synthetic values,
including a 5,000-row table. It returns 404 in production builds.

## Status

- [x] Part 1: project setup and design system
- [ ] Part 2: USAspending ingestion
- [ ] Part 3: SAM.gov enrichment
- [ ] Part 4: firm model and aggregation
- [ ] Part 5: scoring engine
- [ ] Part 6: cash-gap estimator
- [ ] Part 7: web interface and auth
