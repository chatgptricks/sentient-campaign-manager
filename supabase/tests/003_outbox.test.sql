begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create temporary table outbox_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;
grant select, insert, update on outbox_test_ids to service_role, authenticated;

insert into public.outbox_events (
  id, aggregate_type, aggregate_id, event_type, payload_json, available_at
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Promotion', extensions.gen_random_uuid(), 'OutboxTestEvent',
  '{"test":true}'::jsonb, now() - interval '1 day'
);

insert into outbox_test_ids (key, id) values (
  'first', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_outbox_events('worker-one', 10)
    where id = (select id from outbox_test_ids where key = 'first')
      and status = 'PROCESSING'
      and attempt_count = 1
      and locked_by = 'worker-one'
  ),
  1,
  'the worker atomically claims an available event'
);
select is(
  (
    select count(*)::integer
    from public.claim_outbox_events('worker-two', 10)
    where id = (select id from outbox_test_ids where key = 'first')
  ),
  0,
  'another worker cannot claim the active lock'
);
select results_eq(
  format(
    'select public.fail_outbox_event(%L::uuid, %L, %L)::text',
    (select id from outbox_test_ids where key = 'first'),
    'worker-one',
    'TEMPORARY_PROVIDER_FAILURE'
  ),
  $$values ('FAILED'::text)$$,
  'a failed first attempt is scheduled for retry'
);
select is(
  (
    select count(*)::integer
    from public.claim_outbox_events('worker-two', 10)
    where id = (select id from outbox_test_ids where key = 'first')
  ),
  0,
  'backoff prevents immediate re-claim'
);

reset role;
update public.outbox_events
set available_at = now()
where id = (select id from outbox_test_ids where key = 'first');
set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_outbox_events('worker-two', 10)
    where id = (select id from outbox_test_ids where key = 'first')
      and attempt_count = 2
  ),
  1,
  'the event is claimable after its backoff expires'
);
select throws_ok(
  format(
    'select public.complete_outbox_event(%L::uuid, %L)',
    (select id from outbox_test_ids where key = 'first'),
    'wrong-worker'
  ),
  'P0001', 'OUTBOX_LOCK_MISMATCH',
  'only the lock owner can complete an event'
);
select lives_ok(
  format(
    'select public.complete_outbox_event(%L::uuid, %L)',
    (select id from outbox_test_ids where key = 'first'),
    'worker-two'
  ),
  'the lock owner completes the event'
);
select results_eq(
  $$select status::text, processed_at is not null from public.outbox_events where id = (select id from outbox_test_ids where key = 'first')$$,
  $$values ('PROCESSED'::text, true)$$,
  'completed events retain a processed timestamp'
);

reset role;
insert into public.outbox_events (
  id, aggregate_type, aggregate_id, event_type, payload_json, status, attempt_count,
  available_at, locked_at, locked_by
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'Promotion', extensions.gen_random_uuid(), 'DeadLetterTestEvent',
  '{"test":true}'::jsonb, 'PROCESSING', 5, now(), now(), 'worker-dead'
);
insert into outbox_test_ids (key, id) values (
  'dead', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

set local role service_role;
select results_eq(
  format(
    'select public.fail_outbox_event(%L::uuid, %L, %L)::text',
    (select id from outbox_test_ids where key = 'dead'),
    'worker-dead',
    'PERMANENT_FAILURE'
  ),
  $$values ('DEAD_LETTER'::text)$$,
  'the fifth failed attempt moves an event to dead-letter'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = 'e1111111-1111-4111-8111-111111111111';
select lives_ok(
  format(
    'select public.retry_outbox_event(%L::uuid)',
    (select id from outbox_test_ids where key = 'dead')
  ),
  'Administrator can explicitly retry a dead-letter event'
);
reset role;
set local role service_role;
select results_eq(
  $$select status::text, attempt_count, last_error from public.outbox_events where id = (select id from outbox_test_ids where key = 'dead')$$,
  $$values ('PENDING'::text, 0, null::text)$$,
  'controlled retry resets operational fields'
);

reset role;
insert into public.outbox_events (
  id, aggregate_type, aggregate_id, event_type, payload_json, status, attempt_count,
  available_at, locked_at, locked_by
)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'Promotion', extensions.gen_random_uuid(), 'AbandonedFifthAttempt',
  '{"test":true}'::jsonb, 'PROCESSING', 5, now(), now() - interval '16 minutes', 'crashed-worker'
);
insert into outbox_test_ids (key, id) values (
  'abandoned', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
);

set local role service_role;
select is(
  (
    select count(*)::integer
    from public.claim_outbox_events('recovery-worker', 10)
    where id = (select id from outbox_test_ids where key = 'abandoned')
  ),
  0,
  'an exhausted abandoned lock is not claimed for a sixth attempt'
);
select results_eq(
  $$select status::text, locked_at, locked_by, last_error
    from public.outbox_events
    where id = (select id from outbox_test_ids where key = 'abandoned')$$,
  $$values ('DEAD_LETTER'::text, null::timestamptz, null::text, 'STALE_WORKER_EXHAUSTED'::text)$$,
  'an exhausted abandoned lock is recovered into dead-letter'
);

select * from finish();
rollback;
