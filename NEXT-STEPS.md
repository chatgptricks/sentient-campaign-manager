# Sentient Promotion Manager — What's Next (2026-07-20)

## Where the project stands

Verified today in a clean Linux sandbox on current HEAD (`c370b04` — simplify workflow to creator/posting/finance):

| Check                        | Result                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Prettier                     | Pass                                                                           |
| ESLint (zero warnings)       | Pass                                                                           |
| TypeScript strict (`tsc -b`) | Pass                                                                           |
| Unit/component tests         | 35/35 pass                                                                     |
| Edge Function tests          | 50/50 pass                                                                     |
| Production build             | Pass                                                                           |
| pgTAP + real-backend E2E     | Not runnable here (needs Docker) — must run in CI or locally                   |
| Production URL               | `https://chatgptricks.github.io/sentient-campaign-manager/` responds correctly |

The old handover issues are resolved in code: only the 3 roles (Administrator/Sales/Creator) exist in runtime, no visible "Campaign" copy, no condescending helper text found, and context menus exist on Clients, Channels, Users, Promotions table, and Calendar.

One caveat: `PromotionDetailPage.tsx` (and ~25 other files) could not be read through the sandbox mount (see "Local machine issue" below), so it was verified by CI only, not in this sandbox run.

## P0 — Confirm the release is real (do first)

1. **Check CI + Deploy on GitHub for HEAD `c370b04`.** The last confirmed green deploy in the handover was `e7c0838`; five feature commits have landed since (workflow simplification, Slack DMs, seed changes). Run:
   `gh run list --repo chatgptricks/sentient-campaign-manager --branch main --limit 8`
   If `Deploy Edge Functions` fails with `docker: toomanyrequests`, it's the known ECR rate limit — rerun with `gh run rerun <ID> --failed`.
2. **Run the full Docker-gated suite once on your Mac** (the only part no environment has verified against the new simplified workflow):
   `npm run supabase:start && npm run supabase:reset && npm run test:db && npm run test:functions && E2E_REAL_BACKEND=true npm run build && E2E_REAL_BACKEND=true npm run test:e2e`
   The real-backend E2E was the last known red item; it has since been rewritten for the simplified flow (publication → Ready for invoicing directly), so it needs one confirmed green run.
3. **Manual smoke in production** with the real accounts: Sales creates client + promotion → assigns Creator → Creator starts creative, attaches link, approves, posts → Sales registers invoice. Confirm Slack DMs arrive on assignment.

## Applied on 2026-07-20

Items 4, 5, 7 and 9 are done; 6 was audited and largely already satisfied. Full suite re-verified green after the changes (format, lint, strict types, 33 unit + 50 Edge Function tests, build).

- Removed the dead verification flow: `VerificationDialog`, `verificationSchema`/`VerificationInput`, and `requestVerification`/`recordVerification`/`completeVerifiedWorkflow` from both the `CampaignService` interface and the Supabase implementation. Confirmed dead against `20260720000500_simplify_promotion_workflow.sql`, where `record_publication` transitions straight to `READY_FOR_INVOICING` and no verification action is ever emitted.
- Dropped dead statuses from live UI filters (`PUBLISHER_ASSIGNED`, `PUBLISHED`, `VERIFICATION_PENDING`) in My Work, Dashboard, and `presentation-helpers`. **Kept** them in `promotion-status.ts` labels on purpose — legacy production rows may still hold those values and would otherwise render blank.
- **Kept** the `PublicationVerification` model types: `PromotionDetailPage` still renders historical verification records read-only, which is immutable audit history, not a live action.
- Deleted `demo-service.ts`, `demo-service.test.ts`, the demo Playwright spec, and every `demoMode`/`VITE_DEMO_MODE` remnant across config, `vite-env.d.ts`, `playwright.config.ts`, `deploy.yml`, and the README. Also dropped the `db:demo` script, which pointed at an already-deleted `supabase/demo-seed.sql`.
- Copy now matches the 3-role flow in the promotion detail, login, dashboard, and finance pages.
- `deploy.yml` retries each Edge Function deploy up to 5 times with backoff, so ECR rate limits no longer fail a release. YAML and bash both syntax-checked.

Unit test count moved 35 → 33: the five demo-service tests went away and the three `PromotionDetailPage` tests came back into the run. No shipping code lost coverage.

### Still open from the audit (needs backend work, not a menu tweak)

- **Users context menu** has open/copy email/copy user ID/activate/suspend/delete but no "reset password" — `CampaignService` has no such method, so this needs a new admin RPC first.
- **Channels context menu** has open/copy handle/copy URL but no edit or deactivate — `listPublishingAccounts` is read-only; there is no create/update/deactivate path in the service layer at all.
- **Tab "jumpiness"** on the calendar is a visual judgement I can't verify without running the app.

Everything else in the handover's context-menu and calendar list is already implemented: Clients and Calendar menus are complete, weekly view has working prev/next/today navigation, no calendar renders on the Overview, and the finance route is role-gated at the router.

## P1 — Make it perfect

4. **Delete dead workflow code** left over from the 6-role → 3-role simplification:
   - Statuses `PUBLISHER_ASSIGNED`, `PUBLISHED`, `VERIFICATION_PENDING`, `VERIFIED` still live in `src/domain/promotion-status.ts` and appear in My Work filters — remove from UI surfaces if the server state machine no longer emits them (keep DB enums; migrations are forward-only).
   - `VerificationDialog` in `ActionForms.tsx` — remove if no longer reachable.
   - `src/lib/data/demo-service.ts` (1,200 lines) + demo Playwright spec — demo mode was removed from the app in `9dedfbe`; delete the service and its tests, or re-wire demo mode intentionally. Half-removed is the worst state.
5. **Copy pass on stale flow references.** A few descriptions still describe the old flow, e.g. Creative section: "owns production, approval, publication, and verification"; Resources empty state: "before creative submission". Align copy with the simplified flow.
6. **Context-menu completeness pass** (handover P1): verify right-click actions actually work end-to-end on Users (delete/reset password/copy email), Promotions (copy id/summary), Clients (archive/copy billing), Channels (deactivate/copy handle), Calendar dates (new promotion, view day). Add the cheap copy-actions; skip confirmations for non-destructive ones.
7. **Calendar QA:** weekly prev/next navigation, no jumpy tab transitions, finance view only for Sales/Admin, no calendar on Overview.

## P2 — Operational hardening

8. **Backup drill:** confirm Supabase PITR policy and do one restore into a scratch project before relying on it.
9. **Deploy resilience:** add a retry step (or image cache) for the Supabase edge-runtime pull in `deploy.yml` so ECR rate limits stop failing releases.
10. **Ops cadence:** weekly look at Admin → Operations dead-letter events, `cron.job_run_details`, and Auth errors.
11. **Optional, low value:** internal `campaign*` → `promotion*` renames. Separate branch only, keep `/campaigns` redirect, never rewrite applied migrations.

## Local machine issue worth fixing

Reading ~26 files in this folder (including `PromotionDetailPage.tsx`, several migrations, `eslint.config.js`) fails with "Resource deadlock avoided". This is the classic signature of iCloud Drive dataless files — the repo lives in `~/Desktop`, which iCloud "Desktop & Documents" sync can evict. It will also break backups and some tooling. Fix: move the repo out of Desktop/Documents (e.g. `~/dev/`), or disable iCloud Desktop sync / right-click the folder → "Keep Downloaded".

## Definition of done

CI green on HEAD, Deploy green, production smoke of the 3-role lifecycle passes, dead demo/verification code removed, `git status` clean.
