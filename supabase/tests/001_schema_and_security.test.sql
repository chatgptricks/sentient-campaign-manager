begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(49);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'promotions', 'promotions table exists');
select has_table('public', 'approval_submissions', 'approval submissions table exists');
select has_table('public', 'approval_decisions', 'approval decisions table exists');
select has_table('public', 'publications', 'publications table exists');
select has_table('public', 'publication_verifications', 'publication verifications table exists');
select has_table('public', 'invoices', 'invoices table exists');
select has_table('public', 'audit_log', 'audit table exists');
select has_table('public', 'outbox_events', 'outbox table exists');
select has_table('public', 'inbox_events', 'inbox table exists');
select has_table('public', 'idempotency_ledger', 'atomic idempotency ledger exists');
select has_view('public', 'approval_submission_state', 'approval state view exists');
select has_view('public', 'current_publications', 'current publications view exists');
select has_type('public', 'promotion_status', 'promotion status enum exists');
select ok(to_regprocedure('public.create_promotion(jsonb)') is not null, 'create promotion RPC exists');
select ok(
  to_regprocedure('public.assign_promotion_role(uuid,public.assignment_role,uuid,integer)') is not null,
  'assignment RPC exists'
);
select ok(
  to_regprocedure('public.get_promotion_allowed_actions(uuid)') is not null,
  'allowed actions RPC exists'
);
select ok(
  to_regprocedure('public.complete_verified_workflow(uuid,integer)') is not null,
  'verified workflow completion RPC exists'
);
select ok(
  to_regprocedure('public.finalize_private_asset(uuid)') is not null,
  'private asset finalization RPC exists'
);
select ok(
  to_regprocedure('public.get_operations_health()') is not null,
  'sanitized operations health RPC exists'
);
select has_trigger('public', 'approval_submissions', 'approval_submissions_immutable', 'submissions are immutable');
select has_trigger('public', 'approval_decisions', 'approval_decisions_immutable', 'decisions are immutable');
select has_trigger('public', 'publications', 'publications_immutable', 'publications are immutable');
select has_trigger(
  'public', 'publication_verifications', 'publication_verifications_immutable',
  'verifications are immutable'
);
select has_trigger('public', 'audit_log', 'audit_log_immutable', 'audit rows are immutable');
select is((select count(*)::integer from public.roles), 3, 'all three application roles are seeded');
select results_eq(
  $$select public, file_size_limit from storage.buckets where id = 'promotion-assets'$$,
  $$values (false, 26214400::bigint)$$,
  'promotion assets bucket is private and size-limited'
);
select results_eq(
  $$select allowed_mime_types from storage.buckets where id = 'promotion-assets'$$,
  $$values (array['image/jpeg','image/png','image/webp','image/gif','application/pdf']::text[])$$,
  'private storage accepts only the image and PDF contract exposed by the UI'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.promotions'::regclass),
  'RLS is enabled on promotions'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.promotions'::regclass),
  'RLS is forced on promotions'
);
select ok(
  has_table_privilege('authenticated', 'public.promotions', 'SELECT'),
  'authenticated users receive promotion SELECT subject to RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.promotions', 'UPDATE'),
  'authenticated users cannot update promotions directly'
);
select ok(
  not has_table_privilege('anon', 'public.promotions', 'SELECT'),
  'anonymous users cannot select promotions'
);
select ok(
  not has_table_privilege('authenticated', 'public.outbox_events', 'SELECT'),
  'outbox rows are not directly exposed to the frontend'
);
select ok(
  not has_table_privilege('authenticated', 'public.integration_attempts', 'SELECT'),
  'raw integration attempts are not directly exposed to the frontend'
);
select ok(
  has_function_privilege('authenticated', 'public.create_promotion(jsonb)', 'EXECUTE'),
  'authenticated users may invoke the guarded create RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.get_operations_health()', 'EXECUTE'),
  'authenticated admins may invoke the internally guarded operations RPC'
);
select ok(
  not has_function_privilege('anon', 'public.create_promotion(jsonb)', 'EXECUTE'),
  'anonymous users cannot invoke create promotion'
);
select ok(
  has_function_privilege('service_role', 'public.claim_outbox_events(text,integer)', 'EXECUTE'),
  'service role can claim outbox work'
);
select ok(
  has_function_privilege('service_role', 'public.get_outbox_scheduler_health()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.get_outbox_scheduler_health()', 'EXECUTE'),
  'only the service role can inspect scheduler secret readiness'
);
select ok(
  scheduler_health ? 'lastRunStartedEpoch'
    and jsonb_typeof(scheduler_health -> 'lastRunStartedEpoch') in ('number', 'null'),
  'scheduler health exposes the epoch contract consumed by deployment checks'
)
from (
  select public.get_outbox_scheduler_health() as scheduler_health
) health;
select ok(
  has_function_privilege('service_role', 'public.bootstrap_first_administrator(text)', 'EXECUTE'),
  'service role can perform the guarded one-time Administrator bootstrap'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.bootstrap_first_administrator(text)', 'EXECUTE'
  ),
  'authenticated users cannot invoke the first Administrator bootstrap'
);
select ok(
  position(
    'pg_advisory_xact_lock'
    in pg_get_functiondef('public.bootstrap_first_administrator(text)'::regprocedure)
  ) > 0,
  'first Administrator bootstrap serializes the zero-admin check'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_automated_publication_verification(uuid,jsonb,integer)',
    'EXECUTE'
  ),
  'service role can invoke the dedicated automated verification command'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_automated_publication_verification(uuid,jsonb,integer)',
    'EXECUTE'
  ),
  'authenticated users cannot invoke the automated verification command'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in ('promotion_assets_select', 'promotion_assets_insert')
  ),
  2,
  'private storage has read and upload policies'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'invoices_one_active_per_promotion_idx'
      and indexdef ilike '%where%'
  ),
  'invoice active uniqueness is enforced with a partial index'
);
select is(
  (select count(*)::integer from unnest(enum_range(null::public.promotion_status))),
  15,
  'all promotion states are represented'
);

select * from finish();
rollback;
