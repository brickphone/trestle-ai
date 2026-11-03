# Contractor cash-flow MVP

Cash-flow software for small US federal construction prime contractors. Branding comes from
`PRODUCT_NAME` in `src/lib/config.ts`, currently “Product”. No lending, money movement, AI features,
bank/accounting connections or SAM.gov key is required.

## Run locally

The backend is a **persistent Node.js server**, running together with the Next.js frontend.
It uses the normal Supabase client over HTTPS. No Docker, Drizzle, Postgres driver, database password,
restricted database login, or pooler is required to run the application.

Use Node LTS 22.13+ or 24+, and npm only:

```sh
npm ci
cp .env.example .env.local  # only if you do not already have this file
```

Set your existing hosted project values in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
SITE_URL=http://localhost:3000
```

`.env.local` takes precedence over `.env`. Do not leave stale local values overriding hosted ones.
The app rejects a secret/service-role key in the public key variable. Keep secrets out of source/chat.

### Create the database tables once

The URL and key connect to Supabase; the project still needs the application's schema.
Generate the setup SQL from the versioned migrations:

```sh
npm run db:sql
```

Open `supabase/setup.sql`, paste it into your project's **Supabase SQL Editor**, and run it as the
project owner. The bundle applies pending versions atomically and records them in Supabase's migration
history. It is safe to run again: already-applied versions are skipped. This also upgrades an older
installation without copying or discarding its data. The generated bundle is visible in the editor; the
source of truth remains `supabase/migrations/`. Regenerate it instead of editing it directly.

Then:

```sh
npm run db:check
npm run dev
```

Open **http://localhost:3000/signup**. Use `localhost` for development and browser tests.
`db:check` checks HTTPS Data API reachability and denial of anonymous table reads. It is not a
substitute for the authenticated RLS test suite.

If migrations have not been installed, authentication can work while the workspace cannot load.
Running `npm run dev` does not create tables or provision a project automatically.

### Auth redirects

Enable email/password Auth in Supabase. Set its Site URL to `SITE_URL` and allow:

- `http://localhost:3000/auth/callback` for development
- the deployed application origin plus `/auth/callback`

The standard PKCE flow exchanges a code at `/auth/callback`. For cross-device confirmation, email
confirmation/magic-link templates can instead use
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
Use the project's configured email delivery/SMTP. Passwords require 12–128 characters.
Magic-link sign-in does not implicitly create accounts; sign up first. No in-app alert emails are sent.

### Production

```sh
npm run build
npm start
```

Deploy as a long-running Node process with the same environment values. No serverless functions or
Supabase Edge Functions are used. Postgres functions below are database transactions, not deployed
application workers.

## How the backend works

```text
Browser → persistent Next.js Node server → Supabase Auth / Data API → Postgres
```

Server Actions validate forms, verify the Supabase user, and use an SSR Supabase client carrying
that user's access token. Ordinary data access never uses a secret/service-role key. The client is
request-scoped; there is no shared global user session.

`src/lib/supabase/server.ts` verifies the actual Data API identity with the
`request_security_context` RPC before access. It requires the `authenticated` role, the expected user
UUID, and active RLS on all twelve application tables. A service-role/owner client fails this guard.
Claims/roles are supplied by Supabase Auth and PostgREST; application code no longer sets them itself.

Application tables are in Supabase's standard `public` API schema, with enabled and forced RLS.
Private policy/trigger helpers remain in `app`. There are **no anonymous policies or table grants**.
Existing private tables are moved by migration, preserving rows, foreign keys and audit history.
The old `app_runtime` SQL login is disabled by migration; its credentials are unused and can be removed.

Simple CRUD uses `supabase.from(...)`. Multi-record writes use `security invoker` RPCs so they are
atomic and retain the caller's RLS permissions:

- `complete_onboarding`: organization, owner membership, selected source snapshots/jobs, opening
  balance, recurring payroll and onboarding state in one transaction. Its narrowly scoped private
  organization-creation helper creates only the authenticated caller's organization/membership.
- `save_government_invoice`: retainage calculation, terms snapshot, creation/edit, original-rejection
  link and row locking.
- `record_government_payment`: receipt validation, overpayment checks, receipt insertion and paid-state
  update together.
- `void_financial_record`: void reason, related status changes and soft-void together.

Paginated reads request exact row counts so Supabase's response cap cannot silently truncate a
forecast. API timestamps are normalized into domain records; financial calculations remain pure.
Types live in `src/lib/data/types.ts` and `src/lib/supabase/database.types.ts`.

## Roles and audit

| Role        | M1 access                                                                          |
| ----------- | ---------------------------------------------------------------------------------- |
| Owner       | Read/write own organization business data; update allowed company fields           |
| Member      | Read/write own operational records; no role/plan/staff administration              |
| Staff       | Read all organizations, switch organizations, access Internal; no financial writes |
| Demo member | Read only the dedicated demo organization; all application writes denied           |

Composite organization/record foreign keys reject cross-tenant links. Financial tenant IDs are
immutable. Membership/staff provisioning is administrative in M1; invitations arrive in M3. Plan and
demo flags are not writable through ordinary application grants. Staff remain read-only even when
listed as organization members.

Database triggers record financial creates/updates/deletes with actor UUID, timestamp, before/after
values in the same transaction. Audit events are append-only. Financial removal uses soft-void with
a mandatory reason. Payments must be voided before voiding their invoice; active job invoices must
be voided before voiding the job.

### Staff and demo setup (optional)

Only these administrative scripts need a server-only Supabase secret/legacy service-role key:

```dotenv
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
DEMO_EMAIL=YOUR_DEDICATED_DEMO_ACCOUNT_EMAIL
DEMO_PASSWORD=YOUR_DEDICATED_DEMO_ACCOUNT_PASSWORD
```

Create a regular Auth user and copy its UUID, then:

```sh
npm run staff:create -- AUTH_USER_UUID
npm run demo:reset
```

Both scripts use Supabase's HTTPS API; neither needs a database connection string. Their narrowly
scoped administrative RPCs are executable only by `service_role`. They are never used by ordinary
application requests. Demo accounts cannot become staff, and staff cannot become demo accounts.

“View demo” signs into the dedicated account after validating the actual API role and confirming
it has only demo membership, no real-organization access and no staff role. Cookies are installed
only after validation succeeds. Every product screen displays **Demo, fictional data · Read-only**.
RLS denies writes, and an Auth trigger blocks changes to its shared email/password/phone.

Reset voids old demo financial rows, disables prior assumptions, creates new fictional rows with
dates relative to today, and preserves audit history. It cannot repurpose a real organization's user.
Existing credentials are reused; changing `DEMO_PASSWORD` alone does not rotate an existing Auth
password. Rotation requires a coordinated administrator operation with the protection trigger.

## Migrations

All DDL lives in timestamped SQL under `supabase/migrations/`. Do not use Drizzle or dashboard table
edits as a parallel schema authority. SQL Editor execution uses the generated versioned bundle.
To add a change:

```sh
npm run db:migration:new -- descriptive_name
# Edit the new migration; update matching TypeScript records/API types.
npm run db:sql
# Run the resulting setup.sql in the hosted SQL Editor.
```

An optional CLI path, `npm run db:migrate`, can still use `DATABASE_ADMIN_URL` for teams with a direct
or session-pooler connection. This is strictly administrative and is not required by the app or the
SQL Editor path. There is no runtime provisioning step or hosted database-reset command.
`supabase/config.toml` is CLI project metadata, not an instruction to start Docker.

## Financial and forecast conventions

- Integer USD cents, basis-point percentages, Postgres dates. Product tables display cents exactly.
  Missing actual values show “Not available”.
- Regulatory defaults, authoritative links and verification notes live in `src/lib/config.ts`.
  Progress terms default to 14 calendar days. Retainage defaults to an editable 5%, including 0%:
  this is a product assumption, not a general federal requirement.
- Submission + invoice terms gives an estimated due-date basis; proper-request receipt confirms it.
  Expected receipt dates affect forecasts separately. No interest amount is calculated. Contract
  conditions and weekend/holiday interest provisions still require verification.
- Invoice terms are copied from the job on creation. Later job edits do not rewrite them. Rejection
  requires a reason; resubmission is a new invoice linked by `resubmission_of_id`.
- Partial progress/retainage receipts are separate. Paid status means the net progress amount is
  fully received; retainage may remain. Database triggers reject overpayments.
- Only approved changes affect value. Pending changes stay separate. Imported original values remain
  in immutable source snapshots; add only changes outside that baseline. Imported/user-confirmed
  data does not establish contract ownership or an underwriting verification.
- Opening balance means start of its as-of day. Forecasts span thirteen weeks from that date and
  include recorded receipts on/after it once. An old balance is flagged for refresh.
- Expected receipts use unpaid balances, explicit dates and current due-date fallbacks. Past-due or
  undated amounts are flagged and excluded until a usable date is supplied. Draft/rejected invoices
  are disclosed and excluded from expected receipts.
- Active jobs project monthly billings through the performance end date using the
  [cash-gap module](src/lib/cashgap/remaining.ts). The defaults in `FORECAST_DEFAULTS` are
  operational estimates: 30-day expected payment lag, 85% job cost ratio, even cost profile.
  These are separate from the sourced contractual payment terms. Public obligations form the
  billing base; a user-entered override takes precedence, with contract value as fallback when
  obligations are unavailable. Only approved adjustments outside the imported baseline are added.
- Remaining billing value subtracts the opening billed total and tracked invoices. Historical
  invoices up to the opening billed date replace that opening total (using the greater total),
  while later invoices are added. Every nonvoid invoice, including drafts/rejections, suppresses
  projections for overlapping calendar periods. Remaining unbilled value is divided across the
  uncovered months; there is never a real invoice plus a projected invoice for the same period.
- Each remaining calendar month, including clipped first/last months, gets an even billing
  allocation. The cost profile allocates the cost budget between those months. Each month's exact
  cost budget is paid in seven-day slices plus a month-end stub, prorated by days. Projected
  receipts deduct the job retainage percentage; no release date is invented for projected retainage.
- **No double counting:** cost-ratio projections cover field payroll/materials. Office payroll,
  rent, insurance and other overhead are separate recurring costs, counted once. If any entered
  job costs exist, they replace the entire job cost-ratio model; that job's billings still project.
  Unclassified legacy company costs are excluded while job costs are projected, with a Settings
  classification link. Existing generic company payroll is never silently reclassified as office
  payroll. Staff/demo write restrictions and financial audit triggers apply to all new fields.

- Source links preserve every projected flow. The headline uses the lowest daily net balance within
  each week, including opening cash; same-day flows are netted.

Sources: [FAR 52.232-27](https://www.acquisition.gov/far/52.232-27),
[FAR 52.232-5](https://www.acquisition.gov/far/52.232-5).

## Tests

```sh
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e -- --workers=1
```

`npm test` includes actual PostgreSQL migration/RLS/transaction tests in an ephemeral, in-memory
PGlite test harness. It uses no Docker, sockets, credentials or hosted data. Only Supabase's managed
Auth schema/roles/helpers are stubbed; all application migrations, functions, triggers, table grants
and policies execute as PostgreSQL SQL. Tests apply the generated bundle twice, check all-table RLS,
cross-org reads/writes/FKs, staff/demo/anonymous restrictions, the actual invoker-role/bypass context,
transactional rollback, payments and audit append-only behavior. This is a **test dependency only**,
not the application's backend or a substitute for a hosted Supabase test run.

Unit tests also cover user-token API guards, privileged-key rejection, demo-cookie installation,
Data API pagination/timestamps, USAspending mapping/failures, cash-gap reference and 13-week forecasts.

For live hosted integration and authenticated browser tests, configure a **dedicated test project**
in `.env.test.local` with the URL, publishable key, administrative Auth key, demo credentials and
`ALLOW_DATABASE_TESTS=true`. Install its schema with the same SQL bundle, then:

```sh
node --env-file=.env.test.local scripts/reset-demo.mjs
npm run test:db
npx playwright install chromium
npm run test:e2e -- --workers=1
```

The live bypass test invokes the same normal request guard with an administrative client and must
fail closed. Live tests also exercise user JWT RLS, staff/demo restrictions, atomic onboarding and
payments, audit records, cross-organization URLs and axe. Fixtures are retained only in the dedicated
test project. Hosted-dependent tests are explicitly skipped without configuration; public auth/axe
and unauthenticated redirect checks still run. Hosted flows have no auth/RLS fallback.

Visual regression checks run separately, without hosted credentials:

```sh
npm run test:visual
```

This builds the app, checks the emitted bundles for Inter/Lucide, renders the actual screen components
with an isolated demo (3 jobs, 12 invoices, payroll and manual subcontract-payment estimates), and runs Playwright snapshots and axe against the compiled
CSS and locally hosted fonts. The actual interactive chart is mounted with a test-only Vite entry. It does not visit authenticated app routes or verify server actions/RLS.
Snapshots cover empty/demo Overview, Jobs, Government invoices, Forecast and Settings at 1024, 1280,
1440 and 1920px. Chart labels are checked at 12px at both 1280/1920, with keyboard, hover and range-toggle tests. Axe also checks the detail, onboarding, auth, Internal and development screens.
Use `npx playwright test -c playwright.visual.config.ts --update-snapshots` after reviewing intentional
visual changes. Hosted end-to-end checks remain separate. Before/after views: [visual review](docs/visual-polish-pass2.md).

## Scope and design

M1 contains auth/tenancy, UEI onboarding/manual fallback, jobs/changes, government invoices/payments,
opening balances/costs, Overview, traceable forecast and authenticated read-only demo.
M2 remains pending: subcontractors/payables, alerts, early-pay requests/staff queue.
M3 remains pending: invitations, CSV, documents, agency averages. No full USAspending ingestion.

Internal prospect shells remain under `/internal`, staff-only. `/calculator` stays hidden from
navigation. `/dev/components` contains clearly labeled development-only synthetic component examples;
it returns 404 in production. Instrument Sans is self-hosted through `next/font/local`, with verified
tabular figures. The theme uses near-black, warm white surfaces, hairline dividers, 6–8px
corners and Phosphor regular icons behind one wrapper. Navigation is text-only. Numeric table cells
are right-aligned; summaries show whole dollars, table cents are quieter, and negatives retain their
minus signs and color. Short dates expose their full date on hover. No government imitation, gradients
or AI-generated figures.

While signed in, open `/dev/type` in development to compare Instrument
Sans, Hanken Grotesk and IBM Plex Sans on the current organization's actual Overview and invoices.
The page includes monochrome tokens, contrast ratios and a static Söhne
reference with licensing links. Open-source font binaries and OFL licenses are local; `next/font/local`
serves them without runtime Google requests. It returns 404 in production. Instrument Sans is applied throughout the app. Pass 2 uses near-black for actions and charts, with color reserved for financial meaning. The fixed-height, interactive Overview chart uses the existing
forecast's daily source flows and preserves its actual daily low point; chart data and headline values
link to existing source disclosures. No financial calculation, schema or RLS policy was changed.

Historical memo: [`docs/wedge-segments-overview.pdf`](docs/wedge-segments-overview.pdf). It predates
the current software-first direction and has unverified public payroll/bond data claims.

Implementation references: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[database functions and privileges](https://supabase.com/docs/guides/database/functions),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[USAspending award API](https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/awards/award_id.md).

## Onboarding award selection

The picker fetches every USAspending contract-search page and initially displays awards ending
within the last two calendar years, active awards and awards with unknown end dates. "Show older
awards" retrieves the rest without clearing the current selection or company fields. Counts show
visible awards versus all matching awards. The API's activity-date filter is deliberately not used
as a substitute for performance-end filtering, because that can omit old active contracts.

Only awards with an end date today or later, positive obligations, and no umbrella/minimum-guarantee
classification are preselected. Umbrella awards have their own collapsed, unchecked group. Past awards are collapsed and
unchecked; missing end dates show "Status unavailable" and are not guessed. All onboarding display
dates include the year. Task/delivery orders include their parent IDV; raw PIIDs and descriptions
remain in source snapshots while known IGF metadata flags are removed from displayed descriptions.
Performance locations come from the award's place of performance, not the recipient's address.

After updating an existing hosted project, run the updated `supabase/setup.sql` once in Supabase's
SQL Editor (or apply migration `20261103000000_onboarding_award_selection.sql` through the migration
workflow). Applied migrations are skipped. This keeps the onboarding import aligned with the picker:
up to 1,000 selections across pages, preserved raw snapshots, cleaned job descriptions and completed
job status for past performance periods. The application still needs only its normal Supabase
URL/publishable key; no database-owner credentials are used by requests.

Recorded-fixture tests replay all 113 public awards for `HSNPS86TJGM6`, including parent task orders,
locations, historical active/completed groups, current-date absence of active contracts, page failures,
full-year dates and loading older awards without losing choices. These records never seed an org.

### Focused onboarding

`/onboarding` runs outside the app shell: UEI lookup, company confirmation, award selection,
opening cash, and recurring cost estimates. Manual entry skips award selection. Skipping cash
leaves the opening balance missing; skipping payroll does not insert a zero estimate. The optional
monthly estimate becomes a monthly recurring cost. Completion creates the workspace and all
selected jobs and assumptions in one transaction, then shows a confirmation before Overview.

Progress is saved after each step in `onboarding_drafts`, scoped to the authenticated user by
forced RLS. Back preserves entries; a reload restores the last completed transition. Drafts are
deleted atomically when setup finishes. The public award details are fetched again on resume and
on completion; imported snapshots retain their original descriptions. No browser credentials or
admin database connection are used.

Apply the updated `supabase/setup.sql` in the hosted SQL Editor before testing this flow
(versioned migration `20261103001000_onboarding_drafts.sql`). Existing migrations are skipped.
The test-only browser transport in `e2e/fixtures/` uses local storage to simulate server persistence;
it is never imported by application routes. Production drafts live in Postgres, not local storage.

Onboarding browser checks cover all six screens at 375px and 1440px, heading focus, keyboard navigation,
reload/resume, lookup errors and loading state, manual entry, skipped assumptions, and older-award
selection. Before references are in `e2e/fixtures/onboarding-before/`; browser snapshots are in
`e2e/visual.spec.ts-snapshots/`. The visual suite generates full-size before/after captures in
`.visual/onboarding-before/` and `.visual/onboarding-after/` without connecting to a database.

Onboarding display casing is presentation-only: source company/city names and award descriptions
remain unchanged in drafts and source snapshots. Known agency/installation acronyms, corporate
suffixes and building identifiers are preserved. The step list appears at 1280px and above while the
question column remains centered; completed steps save the current entries before navigating back.
The account button uses a keyboard-accessible menu. The Next.js “Insight” development indicator is
not application UI; the production bundle check rejects its client markers.

Onboarding money inputs insert US thousands separators while typing (for example `250,000.50`),
but drafts and submissions keep the ungrouped decimal amount and financial records store integer
cents. The onboarding route has its own streaming loading boundary; completion does not reread the
finished draft. Final award verification fetches details only for selected awards, including past
contracts. Public-data refresh failures preserve the draft, and a stale onboarding RPC reports the
SQL bundle needed to update the database instead of a generic save error.

Apply `supabase/setup.sql` after this change (migration `20261103002000_projected_job_forecast.sql`).
It backfills the separate obligations field from original snapshots, adds billed-opening/override
inputs and recurring-cost classification, and updates atomic onboarding. Original public values
remain unchanged. Classify any existing generic company payroll in Settings before relying on the
projection: either office overhead, or work costs assigned to a job. A zero entered overhead is
allowed and creates no expense row. Run `npm test` for the hand-calculated $1.2M reference: Jan–Jun
2026, 85% costs, 30-day lag, $100K opening and $20K overhead gives a $300K shortfall on March 1,
just before the first payment on March 2. This reference includes 5% retainage.

### Editing tracked contracts

Owners use **Settings → Edit contracts** (`/contracts/edit`) in the normal app layout. The legacy
`/onboarding?edit=1` address redirects there. First-time onboarding keeps its focused step flow.
Save applies tracking, billing baseline and payment-lag changes in one user-JWT, RLS-enforced
transaction. Cancel leaves stored records unchanged. Removing tracking excludes future modeled
billings and job costs; it preserves the job, all invoices, receipts, entered costs and source snapshots.
The editor requires a positive manual contract value only when public data lacks one.

Legacy job rows can have a null dedicated obligations column. Display and forecast resolve it
from the original, matching source snapshot; the migration backfills only missing stored amounts.
If both are absent, the editor refreshes the specific awards from USAspending and Save repeats
that server-side verification. Failed lookups leave values missing rather than inventing amounts.
Award-level `total_obligation` is used for delivery orders, separately from a parent IDV or ceiling.
The recorded CJW fixture includes N6247326F0157 ($3,377,000) and N6247324F5214 ($27,095,272;
its ceiling is $27,120,272). Raw public snapshots remain unchanged.

Billed-so-far defaults to value × elapsed/total performance days, clamped to the schedule and
rounded to the nearest $1,000. It is labelled as an estimate; manual edits clear that label and
are saved with their provenance. Before the job starts it defaults to $0. Missing dates/values
or an early started job whose estimate rounds to zero require an explicit billed amount.
Active tracked jobs missing a value produce an aggregate forecast warning linked to the editor.

Apply the updated `supabase/setup.sql` before saving in hosted Supabase. The added migration
`20261104001000_contract_editing.sql` preserves all raw snapshots and financial history and
adds tracking/billing provenance. No Docker or direct database URL is needed.
