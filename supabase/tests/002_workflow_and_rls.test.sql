begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

create temporary table test_ids (
  key text primary key,
  id uuid not null
) on commit drop;
grant select, insert, update on test_ids to authenticated;
grant select on test_ids to service_role;

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '22222222-2222-4222-8222-222222222222';

insert into test_ids (key, id)
select 'client', (public.create_client(
  '{"name":"pgTAP Client","billing_email":"billing@example.test"}'::jsonb
) ->> 'id')::uuid;

insert into test_ids (key, id)
select 'promotion', (public.create_promotion(jsonb_build_object(
  'client_id', (select id from test_ids where key = 'client'),
  'title', 'pgTAP Promotion',
  'description', 'Full workflow test',
  'due_date', current_date + 14,
  'sales_owner_id', '22222222-2222-4222-8222-222222222222'
)) ->> 'id')::uuid;

select results_eq(
  $$select status::text, version from public.promotions where id = (select id from test_ids where key = 'promotion')$$,
  $$values ('DRAFT'::text, 1)$$,
  'Sales creates a version-one draft'
);
reset role;
select is(
  (
    select count(*)::integer from public.outbox_events
    where aggregate_id = (select id from test_ids where key = 'promotion')
      and event_type = 'PromotionCreated'
  ),
  1,
  'promotion creation writes its outbox event atomically'
);
set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '22222222-2222-4222-8222-222222222222';
select ok(
  'ASSIGN_CREATOR' = any(public.get_promotion_allowed_actions((select id from test_ids where key = 'promotion'))),
  'allowed actions are returned by the backend'
);
select throws_ok(
  format(
    'select public.update_promotion(%L::uuid, 99, %L::jsonb)',
    (select id from test_ids where key = 'promotion'),
    '{"title":"stale edit"}'
  ),
  'P0001',
  'PROMOTION_VERSION_CONFLICT',
  'stale writes are rejected'
);

set local "request.jwt.claim.sub" = '77777777-7777-4777-8777-777777777777';
select is((select count(*)::integer from public.clients), 0, 'a user without roles cannot read clients');
select is((select count(*)::integer from public.promotions), 0, 'a user without roles cannot read promotions');
select throws_ok(
  $$select public.create_client('{"name":"Forbidden Client"}'::jsonb)$$,
  'P0001', 'FORBIDDEN',
  'a user without roles cannot create clients'
);

set local "request.jwt.claim.sub" = '88888888-8888-4888-8888-888888888888';
select throws_ok(
  $$select public.create_client('{"name":"Suspended Client"}'::jsonb)$$,
  'P0001', 'USER_INACTIVE',
  'a suspended user cannot execute commands'
);

set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select is((select count(*)::integer from public.promotions), 0, 'an unassigned Creator cannot read the promotion');

set local "request.jwt.claim.sub" = '22222222-2222-4222-8222-222222222222';
select lives_ok(
  format(
    'select public.assign_promotion_role(%L::uuid, %L::public.assignment_role, %L::uuid, 1)',
    (select id from test_ids where key = 'promotion'),
    'CREATOR',
    '33333333-3333-4333-8333-333333333333'
  ),
  'Sales assigns the Creator'
);
select results_eq(
  $$select status::text, version from public.promotions where id = (select id from test_ids where key = 'promotion')$$,
  $$values ('CREATOR_ASSIGNED'::text, 2)$$,
  'Creator assignment advances state and version'
);
set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select is((select count(*)::integer from public.promotions), 1, 'the assigned Creator can read the promotion');
select lives_ok(
  format(
    'select public.start_creative_work(%L::uuid, 2)',
    (select id from test_ids where key = 'promotion')
  ),
  'Creator starts work'
);

insert into test_ids (key, id)
select 'resource-one', (
  public.attach_resource_link(
    (select id from test_ids where key = 'promotion'),
    jsonb_build_object(
      'provider', 'CANVA',
      'resource_type', 'CREATIVE_DESIGN',
      'url', 'https://www.canva.com/design/test-one',
      'display_name', 'Creative v1'
    )
  ) #>> '{resource,id}'
)::uuid;
select results_eq(
  $$select status::text, version from public.promotions where id = (select id from test_ids where key = 'promotion')$$,
  $$values ('CREATIVE_IN_PROGRESS'::text, 4)$$,
  'attaching a resource records a versioned business change'
);
reset role;
update public.promotion_resource_links
set validation_status = 'VALID', validation_message = 'Validated by deterministic pgTAP fixture.'
where id = (select id from test_ids where key = 'resource-one');
set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select lives_ok(
  format(
    'select public.submit_for_approval(%L::uuid, %L::uuid, 4)',
    (select id from test_ids where key = 'promotion'),
    (select id from test_ids where key = 'resource-one')
  ),
  'Creator submits the first creative'
);
insert into test_ids (key, id)
select 'submission-one', id
from public.approval_submissions
where promotion_id = (select id from test_ids where key = 'promotion')
  and submission_number = 1;

set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select throws_ok(
  format(
    'select public.decide_approval(%L::uuid, %L::public.approval_decision, null, 5)',
    (select id from test_ids where key = 'submission-one'),
    'REVISION_REQUESTED'
  ),
  'P0001', 'REVISION_COMMENTS_REQUIRED',
  'revision requires comments'
);
select lives_ok(
  format(
    'select public.decide_approval(%L::uuid, %L::public.approval_decision, %L, 5)',
    (select id from test_ids where key = 'submission-one'),
    'REVISION_REQUESTED',
    'Please increase the headline contrast.'
  ),
  'Creator requests a documented revision'
);
select results_eq(
  $$select status::text, version from public.promotions where id = (select id from test_ids where key = 'promotion')$$,
  $$values ('REVISION_REQUESTED'::text, 6)$$,
  'revision advances state while preserving history'
);

reset role;
select throws_ok(
  format(
    'update public.approval_decisions set comments = %L where approval_submission_id = %L::uuid',
    'tampered',
    (select id from test_ids where key = 'submission-one')
  ),
  'P0001', 'IMMUTABLE_HISTORY',
  'approval history cannot be updated even by a privileged direct statement'
);

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select lives_ok(
  format(
    'select public.start_creative_work(%L::uuid, 6)',
    (select id from test_ids where key = 'promotion')
  ),
  'Creator resumes after revision'
);
insert into test_ids (key, id)
select 'resource-two', (
  public.attach_resource_link(
    (select id from test_ids where key = 'promotion'),
    jsonb_build_object(
      'provider', 'CANVA',
      'resource_type', 'CREATIVE_DESIGN',
      'url', 'https://www.canva.com/design/test-two',
      'display_name', 'Creative v2'
    )
  ) #>> '{resource,id}'
)::uuid;
reset role;
update public.promotion_resource_links
set validation_status = 'VALID', validation_message = 'Validated by deterministic pgTAP fixture.'
where id = (select id from test_ids where key = 'resource-two');
set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select lives_ok(
  format(
    'select public.submit_for_approval(%L::uuid, %L::uuid, 8)',
    (select id from test_ids where key = 'promotion'),
    (select id from test_ids where key = 'resource-two')
  ),
  'Creator submits a new immutable version'
);
insert into test_ids (key, id)
select 'submission-two', id
from public.approval_submissions
where promotion_id = (select id from test_ids where key = 'promotion')
  and submission_number = 2;
select is(
  (select count(*)::integer from public.approval_submissions where promotion_id = (select id from test_ids where key = 'promotion')),
  2,
  'both creative submissions remain in history'
);

set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select lives_ok(
  format(
    'select public.decide_approval(%L::uuid, %L::public.approval_decision, %L, 9)',
    (select id from test_ids where key = 'submission-two'),
    'APPROVED',
    'Approved for publishing.'
  ),
  'Creator approves the latest submission'
);
select results_eq(
  $$select submission_number, state from public.approval_submission_state where promotion_id = (select id from test_ids where key = 'promotion') order by submission_number$$,
  $$values (1, 'SUPERSEDED'::text), (2, 'APPROVED'::text)$$,
  'derived submission state distinguishes superseded and approved versions'
);

set local "request.jwt.claim.sub" = '66666666-6666-4666-8666-666666666666';
select throws_ok(
  format(
    'select public.create_invoice(%L::uuid, %L::jsonb, 11)',
    (select id from test_ids where key = 'promotion'),
    '{"amount":100,"currency":"USD","invoice_number":"PREMATURE"}'
  ),
  'P0001', 'FORBIDDEN',
  'Sales cannot invoice before verification'
);

set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select lives_ok(
  format(
    'select public.start_publishing(%L::uuid, 10)',
    (select id from test_ids where key = 'promotion')
  ),
  'Creator starts publishing'
);
insert into test_ids (key, id)
select 'publication', (
  public.record_publication(
    (select id from test_ids where key = 'promotion'),
    jsonb_build_object(
      'provider', 'INSTAGRAM',
      'destination', '@sentient.test',
      'publication_url', 'https://www.instagram.com/p/test-publication',
      'artifact_resource_link_id', (select id from test_ids where key = 'resource-two'),
      'published_at', now()
    ),
    11
  ) #>> '{publication,id}'
)::uuid;
select lives_ok(
  format(
    'select public.request_publication_verification(%L::uuid, 12)',
    (select id from test_ids where key = 'publication')
  ),
  'Creator requests verification'
);
select lives_ok(
  format(
    'select public.record_publication_verification(%L::uuid, %L::jsonb, 13)',
    (select id from test_ids where key = 'publication'),
    '{"status":"FAILED","verification_method":"MANUAL","details_json":{"reason":"post still processing"}}'
  ),
  'a failed verification is recorded without ending the workflow'
);
select results_eq(
  $$select status::text, version from public.promotions where id = (select id from test_ids where key = 'promotion')$$,
  $$values ('VERIFICATION_PENDING'::text, 14)$$,
  'failed verification remains retryable'
);
reset role;
set local role service_role;
select lives_ok(
  format(
    'select public.record_automated_publication_verification(%L::uuid, %L::jsonb, 14)',
    (select id from test_ids where key = 'publication'),
    '{"status":"VERIFIED","verification_method":"AUTOMATED_CHECK","details_json":{"checked":true}}'
  ),
  'a later service-role verification succeeds without overwriting the failure'
);
select is(
  (select count(*)::integer from public.publication_verifications where publication_id = (select id from test_ids where key = 'publication')),
  2,
  'all verification attempts remain immutable evidence'
);
reset role;
set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select lives_ok(
  format(
    'select public.complete_verified_workflow(%L::uuid, 15)',
    (select id from test_ids where key = 'promotion')
  ),
  'verified workflow becomes ready for invoicing explicitly'
);

set local "request.jwt.claim.sub" = '22222222-2222-4222-8222-222222222222';
select lives_ok(
  format(
    'select public.create_invoice(%L::uuid, %L::jsonb, 16)',
    (select id from test_ids where key = 'promotion'),
    '{"amount":1250.00,"currency":"USD","invoice_number":"INV-PGTAP-001","status":"ISSUED"}'
  ),
  'Sales records the issued invoice'
);
select results_eq(
  $$select status::text, version from public.promotions where id = (select id from test_ids where key = 'promotion')$$,
  $$values ('INVOICED'::text, 17)$$,
  'the full workflow ends in INVOICED'
);
reset role;
select is(
  (
    select count(*)::integer from public.audit_log
    where aggregate_type = 'Promotion'
      and aggregate_id = (select id from test_ids where key = 'promotion')
  ),
  (
    select count(*)::integer from public.outbox_events
    where aggregate_type = 'Promotion'
      and aggregate_id = (select id from test_ids where key = 'promotion')
  ),
  'every promotion event is represented in both audit and outbox'
);

set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';
select lives_ok(
  $$select public.get_operations_health()$$,
  'Administrator can read the sanitized operations summary'
);
select lives_ok(
  $$select public.grant_user_role('33333333-3333-4333-8333-333333333333', 'CREATOR')$$,
  'Admin can grant the Creator role idempotently'
);

set local "request.jwt.claim.sub" = '22222222-2222-4222-8222-222222222222';
select throws_ok(
  $$select public.get_operations_health()$$,
  'P0001', 'FORBIDDEN',
  'non-Admin users cannot read operations health'
);
insert into test_ids (key, id)
select 'self-promotion', (public.create_promotion(jsonb_build_object(
  'client_id', (select id from test_ids where key = 'client'),
  'title', 'Self approval rejection'
)) ->> 'id')::uuid;
select lives_ok(
  format(
    'select public.assign_promotion_role(%L::uuid, %L::public.assignment_role, %L::uuid, 1)',
    (select id from test_ids where key = 'self-promotion'),
    'CREATOR',
    '33333333-3333-4333-8333-333333333333'
  ),
  'Creator is assigned to the self-approval scenario'
);

set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select lives_ok(
  format(
    'select public.start_creative_work(%L::uuid, 2)',
    (select id from test_ids where key = 'self-promotion')
  ),
  'Creator starts the self-approval scenario'
);
insert into test_ids (key, id)
select 'self-resource', (
  public.attach_resource_link(
    (select id from test_ids where key = 'self-promotion'),
    jsonb_build_object(
      'provider', 'OTHER',
      'resource_type', 'CREATIVE_DESIGN',
      'url', 'https://example.test/self-approval-artifact',
      'display_name', 'Self approval artifact'
    )
  ) #>> '{resource,id}'
)::uuid;
reset role;
update public.promotion_resource_links
set validation_status = 'VALID', validation_message = 'Validated by deterministic pgTAP fixture.'
where id = (select id from test_ids where key = 'self-resource');
set local role authenticated;
set local "request.jwt.claim.role" = 'authenticated';
set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select lives_ok(
  format(
    'select public.submit_for_approval(%L::uuid, %L::uuid, 4)',
    (select id from test_ids where key = 'self-promotion'),
    (select id from test_ids where key = 'self-resource')
  ),
  'Creator submits their work'
);
insert into test_ids (key, id)
select 'self-submission', id
from public.approval_submissions
where promotion_id = (select id from test_ids where key = 'self-promotion');
set local "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
select lives_ok(
  format(
    'select public.decide_approval(%L::uuid, %L::public.approval_decision, %L, 5)',
    (select id from test_ids where key = 'self-submission'),
    'APPROVED',
    'Approved by the same Creator'
  ),
  'the same Creator can complete approval'
);

select * from finish();
rollback;
