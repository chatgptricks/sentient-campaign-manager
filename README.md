# Sentient Promotion Manager

Sentient Promotion Manager is the internal system for moving a client promotion from Sales intake through creative work, approval, publishing, verification, and Finance. The React application is static and GitHub Pages-compatible. Supabase owns Auth, PostgreSQL, RLS, private Storage, transactional commands, Edge Functions, Cron, and the auditable outbox.

The complete internal workflow is implemented. External creative providers, publishing platforms, and accounting systems currently use explicit manual adapters: the application records work completed outside the system and never pretends that it published or invoiced automatically.

## What is included

- Invitation-only Supabase Auth with multiple roles per user.
- Clients, promotions, role assignments, and a server-enforced state machine.
- External creative links plus optional private image/PDF uploads.
- Immutable submissions, approval decisions, publication evidence, verification, invoices, activity, and audit history.
- In-app notifications, an atomic outbox worker, retries, dead-letter recovery, and an Admin operations console.
- HMAC-authenticated provider webhooks with timestamp and duplicate-event protection.
- Database-backed, hashed-client rate limits on public Edge entry points.
- Unit/component, Edge Function, pgTAP database, demo Playwright, and real role-based Playwright suites.
- CI and an ordered production workflow: verify, migrate, provision secrets, deploy functions, observe Cron, then publish Pages.

## Stack

- React 19, Vite, strict TypeScript, `HashRouter`, and Tailwind CSS.
- Radix UI, TanStack Query/Table, React Hook Form, and Zod.
- Supabase Auth, PostgreSQL, RLS, Storage, RPC, Vault, `pg_cron`, `pg_net`, and Edge Functions.
- Vitest, React Testing Library, pgTAP, Playwright, and GitHub Actions.

## Quick preview without Supabase

Demo mode is an explicit local preview with in-memory sample data. It is never enabled by the production workflow.

```bash
npm ci
VITE_DEMO_MODE=true VITE_BASE_PATH=/ npm run dev
```

To exercise the demo production bundle:

```bash
VITE_DEMO_MODE=true VITE_BASE_PATH=/ npm run build
VITE_DEMO_MODE=true VITE_BASE_PATH=/ npm run test:e2e
```

## Full local environment

Prerequisites are Node.js 22+, npm 10+, Git, and Docker Desktop or another Docker-compatible runtime. The Supabase CLI is pinned in `devDependencies`.

```bash
npm ci
npm run supabase:start
npm run supabase:reset
npm exec supabase status
cp .env.example .env.local
npm run dev
```

Copy the local API URL and publishable/anon key printed by `supabase status` into `.env.local`:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=your_local_publishable_or_anon_key
VITE_BASE_PATH=/
```

Only public values may use the `VITE_` prefix. Never put a service-role key, database password, provider credential, webhook secret, or internal worker secret in the browser bundle.

The reset seed creates deterministic local accounts. Every account uses password `SentientLocal!2026`.

| Role          | Email                      |
| ------------- | -------------------------- |
| Administrator | `admin@sentient.local`     |
| Sales         | `sales@sentient.local`     |
| Creator       | `creator@sentient.local`   |
| Approver      | `approver@sentient.local`  |
| Publisher     | `publisher@sentient.local` |
| Finance       | `finance@sentient.local`   |
| No access     | `norole@sentient.local`    |
| Suspended     | `suspended@sentient.local` |

## Commands

| Command                  | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `npm run dev`            | Start Vite                                                    |
| `npm run build`          | Type-check and build the static app                           |
| `npm run preview`        | Serve the production bundle locally                           |
| `npm run format:check`   | Check Prettier formatting                                     |
| `npm run lint`           | Run ESLint with zero warnings                                 |
| `npm run typecheck`      | Run strict application and tooling TypeScript checks          |
| `npm run test`           | Run unit and component tests                                  |
| `npm run test:coverage`  | Write the unit coverage report                                |
| `npm run test:db`        | Run pgTAP against local Supabase                              |
| `npm run test:functions` | Run Edge Function and adapter tests                           |
| `npm run test:e2e`       | Run demo or real-backend Playwright according to environment  |
| `npm run supabase:start` | Start local Supabase                                          |
| `npm run supabase:reset` | Rebuild the database from migrations and seed                 |
| `npm run supabase:types` | Regenerate local Supabase TypeScript definitions              |
| `npm run verify`         | Check format, lint, types, unit tests, and a production build |

For the complete real-backend gate:

```bash
npm run supabase:start
npm run supabase:reset
npm run test:db
npm run test:functions
E2E_REAL_BACKEND=true npm run build
E2E_REAL_BACKEND=true npm run test:e2e
```

## Security and data contracts

- Browser reads are protected by RLS. Workflow writes go through authenticated RPCs or Edge Functions; the UI never updates promotion status directly.
- Every privileged SQL function rechecks the active user and role. Creator and Approver must be different people.
- Approval and publication require an active resource whose validation state is `VALID`.
- A private asset stays pending until its scoped Storage object exists and `finalize_private_asset` confirms it server-side.
- External effects use an atomic mutable idempotency ledger. Append-only integration attempts remain the audit history. Provider requests receive the same stable key on every retry.
- Audit, submission, decision, publication, and verification records are immutable.
- Logs sanitize credentials, authorization headers, signed URL query strings, and sensitive fields.

## First production Administrator

Public signup is disabled by the deployment workflow. For a new Supabase project:

1. Apply the migrations.
2. In Supabase Auth, create and confirm the first internal user with `display_name` metadata. Confirmation makes its profile active.
3. From the SQL editor, invoke the one-time service-only bootstrap using the project service role:

   ```sql
   select public.bootstrap_first_administrator('admin@example.com');
   ```

4. Sign in as that Administrator and use the Admin invitation flow for every later user.

The bootstrap refuses to run once an active Administrator exists and writes an audit record. Admin commands prevent self-deactivation, removal of the caller's own Administrator role, and removal of the final active Administrator.

## Edge Function configuration

The deployment workflow provisions the required worker values. For a manual deployment, set these Edge secrets:

```bash
npm exec supabase secrets set \
  OUTBOX_PROCESSOR_SECRET='a-long-random-secret' \
  ADMIN_INVITE_REDIRECT_URL='https://your-pages-host.example/sentient-campaign-manager/' \
  ALLOWED_ORIGINS='https://your-pages-host.example' \
  --project-ref your-project-ref
```

Optional integrations use server-side secrets only:

- `INTERNAL_FUNCTION_SECRET`
- `RESEND_API_KEY` and `EMAIL_FROM`
- `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID`
- `WEBHOOK_SECRET_<PROVIDER>` for each inbound provider

When these are absent, the corresponding adapter truthfully reports manual or not configured mode.

## Cron and Vault

The outbox job runs every minute through `pg_cron` + `pg_net`. The database Vault values must match the deployed Edge Function configuration:

```sql
select vault.create_secret(
  'https://your-project-ref.supabase.co',
  'sentient_project_url'
);
select vault.create_secret(
  'the-same-value-as-OUTBOX_PROCESSOR_SECRET',
  'sentient_outbox_processor_secret'
);
```

The production workflow creates or updates both Vault values, deploys the same `OUTBOX_PROCESSOR_SECRET`, invokes the worker directly, and waits for a successful Cron run. Operational checks:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'sentient-process-outbox';

select status, start_time, end_time, return_message
from cron.job_run_details
order by start_time desc
limit 20;
```

The service-role-only `get_outbox_scheduler_health()` RPC reports scheduled/active status, secret readiness, and the latest run without returning either secret.

## Webhook contract

Send provider webhooks to `/functions/v1/provider-webhook` with:

- `x-provider`: configured provider code.
- `x-event-id`: stable provider event identifier.
- `x-webhook-timestamp`: current Unix timestamp in seconds.
- `x-webhook-signature`: `sha256=HMAC_SHA256(secret, timestamp + "." + rawBody)`.

The timestamp window is five minutes. A repeated provider/event ID returns HTTP `409`; reuse with a different payload is also rejected.
The webhook accepts at most 120 requests per client per minute, and the outbox entry point accepts 30. Client identifiers are SHA-256 hashed before storage; raw IP addresses are not retained in the rate-limit table.

## Production deployment

The `Deploy production` GitHub workflow runs only after a successful `CI` run on `main`, or by manual dispatch. Configure the `github-pages` environment with:

Variables:

- `VITE_SUPABASE_URL` — exactly `https://<project-ref>.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_BASE_PATH` — normally `/sentient-campaign-manager/`
- `PUBLIC_APP_URL` — the exact final Pages URL, including the trailing subpath slash

Encrypted secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_URL` — the production Postgres connection string used to provision Vault
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_ID`
- `OUTBOX_PROCESSOR_SECRET`
- `PRODUCTION_E2E_ACCOUNTS_JSON` — a GitHub secret containing six distinct, controlled active accounts (`admin`, `sales`, `creator`, `approver`, `publisher`, and `finance`), each with `email` and `password` fields

Keep these accounts dedicated to release verification and free of ordinary operational ownership. The production test creates uniquely prefixed, controlled audit records and exercises the full role-separated lifecycle; these records are retained as deployment evidence rather than deleted, preserving the system's immutable audit history. The workflow verifies the candidate against a clean local Supabase stack, applies migrations, provisions Vault and Edge secrets, enforces hosted `disable_signup=true`, the exact Auth Site URL, and the recovery redirect allow list, deploys every Edge Function, smoke-tests the schema and worker, observes Cron, then builds and deploys Pages. It fails if the configured public URL, Pages output, and Vite base path disagree. The final Playwright job checks the public Auth boundary, signs in with the controlled account, reads protected data, and completes the role-separated production lifecycle.

## Backup, rollback, and operations

Before launch, confirm the Supabase backup/PITR policy and perform a restore drill in a separate project. Database migrations are forward-only and should remain backward-compatible with the prior frontend during rollout. To roll back the UI, redeploy a known-good commit. To roll back database behavior, ship a new corrective migration; do not rewrite applied migrations.

Monitor the Admin operations page, Edge logs, `cron.job_run_details`, Storage growth, Auth errors, failed integration attempts, and dead-letter events. Retry a failed/dead-letter event only after its sanitized error has been understood.

## Repository layout

```text
src/                  React application, domain model, feature UI, and data services
supabase/migrations/  Schema, RLS, transactional commands, Cron, idempotency, and rate limits
supabase/functions/   Authenticated Edge Functions and explicit adapters
supabase/tests/       pgTAP security, workflow, outbox, and idempotency tests
e2e/                  Demo, real role-based, and production smoke Playwright tests
.github/workflows/    CI and ordered Supabase -> Pages release workflow
```

## Current verification boundary

This repository is implementation-complete but has not been deployed from this workspace because no production Supabase/GitHub credentials were supplied. Docker is also unavailable in the current execution environment, so the official local `supabase test db` and real-backend Playwright journey must run in CI or on a machine with Docker before launch. Unit/component, strict TypeScript, ESLint, Edge Function, build, demo E2E, and static production checks can run here.
