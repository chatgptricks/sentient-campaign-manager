begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

set local role service_role;
select results_eq(
  $$select public.claim_integration_operation(
    'TEST_PROVIDER', 'TEST_OPERATION', 'idempotency:test:one',
    '11111111-1111-4111-8111-111111111111'::uuid
  ) ->> 'state'$$,
  $$values ('CLAIMED'::text)$$,
  'the first worker atomically claims an idempotency key'
);
select results_eq(
  $$select public.claim_integration_operation(
    'TEST_PROVIDER', 'TEST_OPERATION', 'idempotency:test:one',
    '22222222-2222-4222-8222-222222222222'::uuid
  ) ->> 'state'$$,
  $$values ('IN_PROGRESS'::text)$$,
  'a concurrent worker cannot execute the same operation'
);
select lives_ok(
  $$select public.complete_integration_operation(
    'idempotency:test:one',
    '11111111-1111-4111-8111-111111111111'::uuid,
    '{"externalId":"provider-123"}'::jsonb
  )$$,
  'the lock owner completes the operation'
);
select results_eq(
  $$select
    public.claim_integration_operation(
      'TEST_PROVIDER', 'TEST_OPERATION', 'idempotency:test:one',
      '22222222-2222-4222-8222-222222222222'::uuid
    ) #>> '{response,externalId}'$$,
  $$values ('provider-123'::text)$$,
  'a duplicate receives the persisted provider response without executing again'
);

select results_eq(
  $$select public.claim_integration_operation(
    'TEST_PROVIDER', 'TEST_OPERATION', 'idempotency:test:retry',
    '33333333-3333-4333-8333-333333333333'::uuid
  ) ->> 'state'$$,
  $$values ('CLAIMED'::text)$$,
  'a retry fixture is claimed'
);
select lives_ok(
  $$select public.release_integration_operation(
    'idempotency:test:retry',
    '33333333-3333-4333-8333-333333333333'::uuid,
    'TEMPORARY_FAILURE'
  )$$,
  'a failed operation releases its claim'
);
select results_eq(
  $$select public.claim_integration_operation(
    'TEST_PROVIDER', 'TEST_OPERATION', 'idempotency:test:retry',
    '44444444-4444-4444-8444-444444444444'::uuid
  ) ->> 'state'$$,
  $$values ('CLAIMED'::text)$$,
  'a released operation is immediately retryable with the same key'
);

select * from finish();
rollback;
