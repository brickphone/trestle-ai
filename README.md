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
installation without copying or discarding its data. The generated bundle is ignored by Git; the
source of truth is `supabase/migrations/`.

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
- Future billings use the existing [cash-gap module](src/lib/cashgap/README.md): fixed 30-day months,
  even billing, even/front-loaded costs, explicit lag and retainage release. Existing non-rejected
  invoices, including drafts, replace the earliest model billings. Historical unbilled modeled work
  is not silently carried forward. Disabled assumptions are disclosed.
- Choose entered recurring costs or modeled costs; overlapping inputs exclude the model with a
  warning. Company-wide cash/costs are never allocated to a job automatically. Job views without
  an explicit opening balance show net contribution.
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
and unauthenticated redirect checks still run. No mocked auth/RLS fallback exists in the browser suite.

## Scope and design

M1 contains auth/tenancy, UEI onboarding/manual fallback, jobs/changes, government invoices/payments,
opening balances/costs, Overview, traceable forecast and authenticated read-only demo.
M2 remains pending: subcontractors/payables, alerts, early-pay requests/staff queue.
M3 remains pending: invitations, CSV, documents, agency averages. No full USAspending ingestion.

Internal prospect shells remain under `/internal`, staff-only. `/calculator` stays hidden from
navigation. `/dev/components` contains clearly labeled development-only synthetic component examples;
it returns 404 in production. Existing tokens, Public Sans, tabular figures, 4px spacing and accessible
control borders remain. No government imitation, gradients or AI-generated figures.

Historical memo: [`docs/wedge-segments-overview.pdf`](docs/wedge-segments-overview.pdf). It predates
the current software-first direction and has unverified public payroll/bond data claims.

Implementation references: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[database functions and privileges](https://supabase.com/docs/guides/database/functions),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[USAspending award API](https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/awards/award_id.md).
