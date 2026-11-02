# Contractor cash-flow MVP

Cash-flow software for small US federal construction prime contractors. Product branding comes
from `PRODUCT_NAME` in `src/lib/config.ts`, currently “Product”. Requirements evolve with sales calls.
No lending, money movement, bank/accounting integrations, or SAM.gov key is required.

## Milestones

- **M1 implemented:** password/magic-link auth, organizations/memberships, global staff registry,
  restricted database transactions and RLS, UEI onboarding/manual fallback, jobs/change orders,
  government invoices/partial payments, opening balances/recurring costs, Overview, traceable
  13-week forecast, authenticated read-only demo.
- **M1 hosted verification pending:** migrations, RLS/bypass/audit/payment integration checks,
  demo provisioning, authenticated browser flows and axe checks need a configured hosted test project.
  Passing unit tests and a production build do not establish that database isolation works.
- **M2 pending:** subcontractors/payables, alerts/read state, early-pay requests/staff queue.
- **M3 pending:** teammate invitations, CSV import/export, documents/attachments, agency averages.

Internal prospect shells remain at `/internal`, `/internal/prospects`, `/internal/pipeline`,
`/internal/runs`. They require staff access already because M1 introduces contractor accounts.
No ingestion/scoring was added. `/calculator` stays hidden from navigation. The development-only
`/dev/components` reference retains its clearly labeled synthetic component examples and is 404 in production.

Historical memo: [`docs/wedge-segments-overview.pdf`](docs/wedge-segments-overview.pdf).
It predates the software-first direction, explores out-of-scope segments, and has unverified claims
about public certified payroll/payment bond data. Do not use it as a source of legal rules.

## Stack and setup

Next.js 16 App Router/Cache Components, strict TypeScript, Tailwind 4 project tokens, Public Sans,
TanStack Table/Virtual, Supabase Postgres/Auth, Drizzle, zod, Vitest, Playwright + axe. npm only.
Use Node LTS 22.13+ or 24+.

**Hosted Supabase only. Docker is not used by this workflow.** No service is provisioned automatically.

```sh
npm ci
cp .env.example .env.local
# Fill in hosted project values, then follow the database setup below.
npm run dev
```

Open `http://localhost:3000`; use `localhost` for Next.js development and browser tests.

### Environment

`.env*` is ignored except the example. Keep credentials out of source, logs and chat.

| Variable                        | Consumer                                                           |
| ------------------------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`                  | Server application only; restricted `app_runtime` login            |
| `DATABASE_ADMIN_URL`            | Administrative scripts and migrations only; project database owner |
| `NEXT_PUBLIC_SUPABASE_URL`      | Hosted Supabase project URL                                        |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/legacy anon key; never a secret/service-role key       |
| `SUPABASE_SECRET_KEY`           | Administrative Auth scripts only; secret/legacy service-role key   |
| `SITE_URL`                      | Application origin used for Auth email redirects                   |
| `DEMO_EMAIL`, `DEMO_PASSWORD`   | Server-only credentials for the dedicated demo account             |
| `ALLOW_DATABASE_TESTS`          | Explicit test-project opt-in; never enable against customer data   |

The Supabase secret key and admin connection are not imported by application code. Authentication
is verified with Supabase `getUser()`; cookie contents are not trusted as user identity.

### Hosted database setup

1. Create/use a hosted Supabase project with Postgres 17. Get connection details from its Connect
   panel. Use a direct or session-pooler administrative URL for schema changes. URL-encode passwords
   and use SSL as required by the project.
2. Set `DATABASE_ADMIN_URL`. Choose a separate strong runtime password and put it in `DATABASE_URL`.
   Its username must be `app_runtime` for direct connections, or `app_runtime.<project-ref>` for the
   hosted pooler. Do not use `postgres` in the runtime URL.
3. Apply versioned migrations and provision the restricted login:

```sh
npm run db:migrate
npm run db:provision-runtime
npm run db:check
```

`db:migrate` invokes the project-local Supabase CLI with the explicit administrative URL. It never
starts a local stack. The CLI may ask for confirmation of the listed pending migrations.
`db:provision-runtime` sets only the runtime login password. `db:check` asserts the restricted login,
active RLS and no rows without an identity. It does not replace the full security test suite.

Migrations run in order from `supabase/migrations`. The baseline private `app` schema is followed by
identity roles; tenancy; jobs/snapshots/changes; invoices/payments; forecast inputs; audit triggers;
RLS/grants; demo-login protection; contract-value integrity. No application-startup DDL is used.

Create future changes with `npm run db:migration:new -- descriptive_name`, then update the matching
Drizzle declarations in `src/lib/db/schema.ts`. SQL migrations are the sole DDL authority; do not
use dashboard edits or Drizzle push as a second migration path. Fix deployed schemas with new
migrations. There is deliberately no hosted database-reset command.

`supabase/config.toml` is retained as CLI project metadata; its local-service settings are not an
instruction to start Docker and are not applied to hosted Auth/Storage by `db:migrate`.

### Hosted Auth setup

Enable email/password authentication. Set the Auth Site URL to `SITE_URL` and allow these redirect URLs:

- `http://localhost:3000/auth/callback` for development
- the deployed application origin plus `/auth/callback`

The default PKCE flow exchanges a code at `/auth/callback`. For cross-device confirmation, email
confirmation/magic-link templates can instead point to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
Use the project's configured email delivery/SMTP settings; passwords require 12–128 characters.
Magic-link sign-in does not implicitly create accounts. Sign up first. No application alert emails are sent.

Sources: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[magic links](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[migrations](https://supabase.com/docs/guides/local-development/database-migrations).

## Roles, RLS and audit

`app_runtime` is a non-owner, non-superuser login with no RLS bypass and no inherited table access.
Every ordinary request opens a transaction, asserts that login, switches locally to `app_request`,
sets the **verified** user's claims locally, and checks `row_security_active` before queries run.
Role/claims reset at transaction end. Accidentally using the owner URL fails closed.

All twelve application tables have enabled/forced RLS. Tenant IDs on financial records are immutable.
Composite organization/record foreign keys reject cross-tenant links. There are no anonymous policies.

| Role        | M1 access                                                                          |
| ----------- | ---------------------------------------------------------------------------------- |
| Owner       | Read/write own organization business records; edit allowed company fields          |
| Member      | Read/write own operational records; no role/plan/staff administration              |
| Staff       | Read all organizations, switch organizations, access Internal; no financial writes |
| Demo member | Read only the dedicated demo organization; all application writes denied           |

Membership/staff provisioning is administrative in M1; invitations arrive in M3. Plan/demo flags
are not writable through ordinary application grants. A staff user remains read-only even if also
listed as an organization member.

Create a regular Auth user, get its UUID from Supabase Auth, and provision staff access:

```sh
npm run staff:create -- AUTH_USER_UUID
```

Financial creates/updates/deletes write before/after audit events in the same transaction. Triggers
record actor UUIDs from verified claims; administrative seed operations have no user actor. Audit
events cannot be edited/deleted. Ordinary financial removal uses soft-void with a mandatory reason.
Payments must be voided before voiding their invoice; the UI prevents voiding a job with active invoices.

Sources: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Demo company

Set `DEMO_EMAIL` and a strong `DEMO_PASSWORD` for a dedicated account, then:

```sh
npm run demo:reset
```

“View demo” on the sign-in screen signs into this account server-side. No credentials are sent to
browser bundles. The server verifies that the account belongs only to the demo organization.
Every product screen displays **Demo, fictional data · Read-only**. Data stays in the flagged demo
organization and never enters a real organization. RLS denies its writes. A database trigger also
blocks password/email/phone changes to the shared account through Auth APIs.

Reset voids old financial demo rows, disables prior assumptions, creates new fictional records with
dates relative to today, and retains the append-only audit history. It refuses to repurpose an account
already belonging to a real organization. Existing credentials are reused; changing the environment
password alone does not rotate an existing Auth password. Credential rotation requires an explicit
administrator operation coordinated with the demo-login protection trigger.

## Financial and forecast conventions

- USD integer cents; basis-point percentages; Postgres dates. Missing actual values show “Not available”.
- Regulatory configuration and source/verification notes live in `src/lib/config.ts`. Progress terms
  default to 14 calendar days; retainage defaults to an editable 5%, including 0%. This retainage
  default is a product assumption, not a general federal mandate.
- Submission + invoice terms gives an estimated due-date basis; a proper-request receipt date confirms
  the basis. Expected receipt dates affect forecasts separately. No interest amount is calculated.
  Contract conditions and weekend/holiday interest provisions still require verification.
- Invoice terms are copied from the job when created. Later job edits do not rewrite invoice terms.
  Rejection requires a reason; resubmission creates a new invoice linked with `resubmission_of_id`.
- Payments support separate progress/retainage receipts and partial payments. Database triggers reject
  overpayments. Paid status means the **net progress amount** is fully received; retainage may remain.
- Only approved changes affect contract value. Pending changes stay separate. Imported baseline values
  remain immutable in source snapshots; add only changes outside that baseline.
- Opening bank balance means **start of the as-of day**. A 13-week forecast is anchored to that date;
  same-day and subsequent recorded receipts are included once. An old balance is flagged for refresh.
- Expected receipts use unpaid balances and explicit expected dates, falling back to due dates only
  when current. Past-due/undated amounts are flagged and excluded until a usable date is supplied.
- Future billings use the existing [cash-gap module](src/lib/cashgap/README.md): fixed 30-day months,
  even billing, even/front-loaded costs, explicit lag/retainage release. Existing non-rejected invoices,
  including drafts, replace the earliest modeled billings. Unbilled modeled work before the forecast
  date is not silently carried forward. Disabled assumptions and draft/rejected invoices are disclosed.
- Select entered recurring costs **or** modeled costs; conflicting inputs exclude the modeled scenario
  and show a warning. Explicit mode does not add cash-gap costs. No hidden weekly payroll estimates.
- Weekly views preserve source entries; the headline finds the lowest daily net balance, including
  opening cash, so a positive week-end balance cannot hide a midweek shortfall. Same-day flows are netted.
- Per-job views use only job-scoped costs and an explicitly entered job balance. Otherwise they show
  net contribution; company cash and company-wide costs are never allocated automatically.

Sources: [FAR 52.232-27](https://www.acquisition.gov/far/52.232-27),
[FAR 52.232-5](https://www.acquisition.gov/far/52.232-5).

## USAspending and data sources

On-demand lookup confirms exact UEI, fetches award pages/details server-side and preserves source
links/allowlisted originals. `base_exercised_options` supplies current award value when available;
`total_obligation` remains separate. An absent value stays absent. Users confirm/edit imported data.
API failures/not-found results retain manual onboarding. No full ingestion pipeline or SAM dependency.

Manual forms share zod validators through the data-source interface in `src/lib/data/validation.ts`.
CSV adapters will use these same validated write paths in M3. No government-portal scraping/logins,
bank credentials, SSNs, or EINs are requested or stored in structured fields. Documents are M3.

Sources: [recipient API](https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/autocomplete/recipient.md),
[award API](https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/awards/award_id.md).

## Tests

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Pure tests cover due-date bases/late flags, cents/retainage, rejected invoices, source mapping/failure
fixtures, the $1M cash-gap reference, and a hand-calculated 13-week forecast including partial-payment
replacement, cost overlap, per-job contribution, calendar boundaries and intraweek cash shortfalls.

For database and authenticated browser tests, configure **a dedicated hosted test project** in
`.env.test.local` with the same variables and `ALLOW_DATABASE_TESTS=true`. Never point it at customer
data. Apply/provision/seed that project explicitly:

```sh
node --env-file=.env.test.local scripts/migrate.mjs
node --env-file=.env.test.local scripts/provision-runtime.mjs
node --env-file=.env.test.local scripts/reset-demo.mjs
npm run test:db
npx playwright install chromium
npm run test:e2e -- --workers=1
```

Database tests execute the actual request transaction wrapper with unfiltered queries: org A/B
isolation, cross-tenant writes/FKs, identity reset, staff read-only, demo read-only, audit append-only,
payment bounds, all-table RLS, and refusal of an owner connection. The bypass test must pass before
M1 is accepted as security-verified. Integration fixtures are retained only in this dedicated test project.

Browser tests cover sign-up/confirmation/manual onboarding, jobs/invoices/partial/full payments,
forecast source links, cross-org detail URLs, staff access, demo/read-only screens, virtualized table
ARIA semantics and axe checks. Tests requiring hosted credentials are explicitly skipped without them;
public auth/accessibility and unauthenticated redirects still run. Browser tests do not substitute mocked authentication or RLS.

## Design system

Project-only tokens in `src/app/globals.css`; Tailwind defaults for colors/radii/shadows/type are reset.
Public Sans UI, tabular numerals, IBM Plex Mono UEIs, 4px grid, small radii and accessible control borders.
Reusable primitives live in `src/components/ui`; product forms/tables/source links in
`src/components/product`. Calm, dense enterprise UI; no government imitation or AI-generated figures.
