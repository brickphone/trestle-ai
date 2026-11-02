# Trestle GovCon

Cash-flow software for small US federal construction prime contractors. The paid MVP will track
federal jobs, invoices to the government, subcontractor payables, and a 13-week cash forecast.
Longer term, real job data can support invoice financing; this repository does not implement lending.
Requirements will evolve with founder sales calls.

The original prospect tool is retained under `/internal`: overview, prospects, outreach pipeline,
and data runs. These remain empty page shells; ingestion, scoring and authentication are not built.
**Internal is an organizational boundary today; staff-only access will be added with auth.**
The Calculator route remains accessible at `/calculator` but is hidden from navigation.

Historical background: [`docs/wedge-segments-overview.pdf`](docs/wedge-segments-overview.pdf).
It predates the software-first direction, explores manufacturing and VA segments outside the
current scope, and claims public certified payroll/payment bond data without verification.
Do not treat those claims or its payment/retainage examples as product requirements or legal rules.
The memo itself questions routine prime-contractor retainage; actual terms must be entered explicitly.

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript (strict) · Tailwind CSS v4 (design tokens
only) · TanStack Table v9 + TanStack Virtual · Postgres on Supabase · Drizzle ORM · zod · Vitest ·
Playwright + axe.

## Setup

Requires a supported Node LTS release (22.13+ or 24+) and npm. Use npm only; `package-lock.json` is committed.

```sh
npm ci
cp .env.example .env.local   # fill in values, see below
npm run dev                  # http://localhost:3000
```

Use `localhost`, not `127.0.0.1`: Next.js blocks dev resources (HMR, client JS) requested from other
origins, so the page won't hydrate on `127.0.0.1`.

### Local database: Supabase CLI + Docker

Install and start Docker Desktop, then run the project-local CLI (no global install or hosted account
needed). `supabase/config.toml` pins Postgres 17 and the local ports. First startup pulls Docker images.

```sh
npm run db:start
npm run db:migrate  # apply pending versioned migrations, keep existing data
npm run db:check    # requires DATABASE_URL from .env.local
```

The checked-in `.env.example` uses local-only Postgres credentials. No real keys are committed.
When auth is implemented, copy the local public key from `npx supabase status` to `.env.local`.
Do not copy service-role/secret keys into any NEXT_PUBLIC variable. Application code does not yet
use the auth variables, so they can remain unset.

All DDL belongs in `supabase/migrations/<timestamp>_<name>.sql`. To change the schema:

```sh
npm run db:migration:new -- descriptive_name
# Edit the new SQL file; update src/lib/db/schema.ts alongside table changes.
npm run db:migrate
npm run db:check
```

To replay everything from scratch (deletes this project's **local** data):

```sh
npm run db:reset
npm run db:check
npm run db:stop  # retains local data for the next start
```

The baseline migration creates a private `app` schema without speculative business tables or seed
data. It is not exposed through the Data API and grants no access to browser roles. The lazy
`server-only` Drizzle/Postgres connection is in `src/lib/db/index.ts`; SQL migrations are the single
migration authority. Do not use dashboard schema edits or Drizzle push as a parallel DDL workflow.
There are no migration calls on app startup. Realtime, Storage, Edge Runtime and analytics are disabled.

Hosted later: apply the same migrations with the Supabase CLI (`supabase link`, then `supabase db push`)
and change only `DATABASE_URL` plus the public auth environment values. Use a Postgres 17 project.
The driver disables prepared statements for transaction-pooler compatibility. Never use local reset
scripts against a hosted database. Tenant authorization and staff restrictions must accompany the MVP's
data access; a server Postgres connection does not supply user-level authorization automatically.

Sources: [Supabase local development](https://supabase.com/docs/guides/local-development/cli/getting-started),
[versioned migrations](https://supabase.com/docs/guides/local-development/database-migrations),
[Drizzle + Supabase](https://orm.drizzle.team/docs/connect-supabase).

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

- Foundation and design system complete; original work is committed.
- Internal prospect pages regrouped; Calculator hidden from navigation.
- Local Supabase CLI/Docker foundation, versioned SQL migrations and server-only Drizzle connection.
- Pure, tested [cash-gap module](src/lib/cashgap/README.md), including a hand-calculated reference.
- Virtualized table exposes total row count and absolute row indices, with browser regression tests.
- Next: paid cash-flow MVP requirements (jobs, government invoices, subcontractor payables, 13-week forecast).

Cash-gap assumptions are explicit scenario inputs, not regulatory defaults. Future regulation-based
presets must live in configuration with authoritative source links. Missing actual values display
“Not available”; no synthetic values are used on product pages. The development showcase labels
its synthetic data.
