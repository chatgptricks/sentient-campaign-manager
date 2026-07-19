do $$
declare
  sales_role_id uuid;
  creator_role_id uuid;
begin
  select id into sales_role_id from public.roles where code = 'SALES';
  select id into creator_role_id from public.roles where code = 'CREATOR';

  if sales_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    select user_role.user_id, sales_role_id
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    where role.code = 'FINANCE'
    on conflict do nothing;
  end if;

  if creator_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    select user_role.user_id, creator_role_id
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    where role.code in ('APPROVER', 'PUBLISHER')
    on conflict do nothing;
  end if;

  delete from public.user_roles user_role
  using public.roles role
  where role.id = user_role.role_id
    and role.code in ('FINANCE', 'APPROVER', 'PUBLISHER');
end $$;

create or replace function public.current_user_can_view_promotion(promotion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.promotions promotion
    where promotion.id = $1
      and public._user_has_any_role(auth.uid())
      and (
        public._user_has_role(auth.uid(), 'ADMINISTRATOR')
        or promotion.sales_owner_id = auth.uid()
        or promotion.creator_id = auth.uid()
      )
  );
$$;

create or replace function public.current_user_can_manage_promotion(promotion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.promotions promotion
    where promotion.id = $1
      and (
        public._user_has_role(auth.uid(), 'ADMINISTRATOR')
        or (
          promotion.sales_owner_id = auth.uid()
          and public._user_has_role(auth.uid(), 'SALES')
        )
      )
  );
$$;

create or replace function public.current_user_can_approve_promotion(promotion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.promotions promotion
    where promotion.id = $1
      and (
        public._user_has_role(auth.uid(), 'ADMINISTRATOR')
        or (
          promotion.creator_id = auth.uid()
          and public._user_has_role(auth.uid(), 'CREATOR')
        )
        or (
          promotion.sales_owner_id = auth.uid()
          and public._user_has_role(auth.uid(), 'SALES')
        )
      )
  );
$$;

create or replace function public.current_user_can_publish_promotion(promotion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_can_approve_promotion($1);
$$;

create or replace function public.current_user_can_invoice_promotion(promotion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.promotions promotion
    where promotion.id = $1
      and promotion.status in ('READY_FOR_INVOICING', 'INVOICED')
      and (
        public._user_has_role(auth.uid(), 'ADMINISTRATOR')
        or public._user_has_role(auth.uid(), 'SALES')
      )
  );
$$;

create or replace function public.current_user_can_upload_promotion_asset(promotion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.promotions promotion
    where promotion.id = $1
      and promotion.status not in ('CANCELLED', 'INVOICED')
      and (
        public._user_has_role(auth.uid(), 'ADMINISTRATOR')
        or (
          promotion.sales_owner_id = auth.uid()
          and public._user_has_role(auth.uid(), 'SALES')
        )
        or (
          promotion.creator_id = auth.uid()
          and public._user_has_role(auth.uid(), 'CREATOR')
        )
      )
  );
$$;

create or replace function public.get_promotion_allowed_actions(promotion_id uuid)
returns public.promotion_action[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  actions public.promotion_action[] := '{}';
  promotion public.promotions%rowtype;
  actor_is_admin boolean;
  can_manage boolean;
  can_work boolean;
  latest_submission public.approval_submissions%rowtype;
begin
  if not public.current_user_can_view_promotion(get_promotion_allowed_actions.promotion_id) then
    return actions;
  end if;

  select item.* into promotion
  from public.promotions item
  where item.id = get_promotion_allowed_actions.promotion_id;

  actor_is_admin := public._user_has_role(actor_id, 'ADMINISTRATOR');
  can_manage := public.current_user_can_manage_promotion(promotion.id);
  can_work := actor_is_admin
    or (
      promotion.creator_id = actor_id
      and public._user_has_role(actor_id, 'CREATOR')
    )
    or (
      promotion.sales_owner_id = actor_id
      and public._user_has_role(actor_id, 'SALES')
    );

  if (can_manage or can_work) and promotion.status not in ('CANCELLED', 'INVOICED') then
    actions := array_append(actions, 'UPDATE_PROMOTION');
    actions := array_append(actions, 'CANCEL_PROMOTION');
  end if;

  if can_manage and promotion.status not in ('CANCELLED', 'INVOICED') then
    actions := array_append(actions, 'ASSIGN_CREATOR');
  end if;

  if public.current_user_can_upload_promotion_asset(promotion.id) then
    actions := array_append(actions, 'ATTACH_RESOURCE');
  end if;

  if can_work and promotion.status in ('DRAFT', 'CREATOR_ASSIGNED', 'REVISION_REQUESTED') then
    actions := array_append(actions, 'START_CREATIVE_WORK');
  end if;

  if can_work
    and promotion.status = 'CREATIVE_IN_PROGRESS'
    and exists (
      select 1 from public.promotion_resource_links resource
      where resource.promotion_id = promotion.id
        and resource.archived_at is null
        and resource.validation_status = 'VALID'
    )
  then
    actions := array_append(actions, 'SUBMIT_FOR_APPROVAL');
  end if;

  if promotion.status = 'SUBMITTED_FOR_APPROVAL' then
    select submission.* into latest_submission
    from public.approval_submissions submission
    where submission.promotion_id = promotion.id
    order by submission.submission_number desc
    limit 1;

    if can_work
      and latest_submission.id is not null
      and not exists (
        select 1 from public.approval_decisions decision
        where decision.approval_submission_id = latest_submission.id
      )
    then
      actions := array_append(actions, 'DECIDE_APPROVAL');
    end if;
  end if;

  if can_work and promotion.status in ('APPROVED', 'PUBLISHER_ASSIGNED') then
    actions := array_append(actions, 'START_PUBLISHING');
  end if;
  if can_work and promotion.status = 'PUBLISHING_IN_PROGRESS' then
    actions := array_append(actions, 'RECORD_PUBLICATION');
  end if;
  if can_work and promotion.status = 'PUBLISHED' then
    actions := array_append(actions, 'REQUEST_PUBLICATION_VERIFICATION');
  end if;
  if can_work and promotion.status = 'VERIFICATION_PENDING' then
    actions := array_append(actions, 'RECORD_PUBLICATION_VERIFICATION');
  end if;
  if can_work and promotion.status = 'VERIFIED' then
    actions := array_append(actions, 'COMPLETE_VERIFIED_WORKFLOW');
  end if;
  if public.current_user_can_invoice_promotion(promotion.id)
    and promotion.status = 'READY_FOR_INVOICING'
  then
    actions := array_append(actions, 'CREATE_INVOICE');
  end if;

  return actions;
end;
$$;

create or replace function public.start_creative_work(promotion_id uuid, expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  promotion public.promotions%rowtype;
begin
  select item.* into promotion
  from public.promotions item
  where item.id = start_creative_work.promotion_id
  for update;
  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_approve_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Creator, Sales owner, or Administrator can start creative work.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> start_creative_work.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status not in ('DRAFT', 'CREATOR_ASSIGNED', 'REVISION_REQUESTED') then
    perform public._domain_error(
      'PROMOTION_INVALID_TRANSITION', 'Creative work cannot start from the current state.',
      jsonb_build_object('from', promotion.status, 'to', 'CREATIVE_IN_PROGRESS'), correlation_id
    );
  end if;

  update public.promotions item
  set
    creator_id = coalesce(item.creator_id, actor_id),
    status = 'CREATIVE_IN_PROGRESS',
    version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, 'CreativeWorkStarted', actor_id, promotion.version, correlation_id,
    '{}'::jsonb
  );
  return public._promotion_dto(promotion);
end;
$$;

create or replace function public.submit_for_approval(
  promotion_id uuid,
  resource_id uuid,
  expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  promotion public.promotions%rowtype;
  resource public.promotion_resource_links%rowtype;
  submission public.approval_submissions%rowtype;
  next_number integer;
begin
  select item.* into promotion
  from public.promotions item
  where item.id = submit_for_approval.promotion_id
  for update;
  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_approve_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Creator, Sales owner, or Administrator can mark work ready for approval.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> submit_for_approval.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status <> 'CREATIVE_IN_PROGRESS' then
    perform public._domain_error(
      'PROMOTION_INVALID_TRANSITION', 'Creative work can only be submitted while in progress.',
      jsonb_build_object('from', promotion.status, 'to', 'SUBMITTED_FOR_APPROVAL'), correlation_id
    );
  end if;

  select item.* into resource
  from public.promotion_resource_links item
  where item.id = submit_for_approval.resource_id
    and item.promotion_id = promotion.id
    and item.archived_at is null;
  if resource.id is null then
    perform public._domain_error('ACTIVE_CREATIVE_RESOURCE_REQUIRED', 'An active promotion resource is required.', '{}'::jsonb, correlation_id);
  end if;
  if resource.validation_status <> 'VALID' then
    perform public._domain_error('RESOURCE_NOT_USABLE', 'The selected resource must pass validation before submission.', '{}'::jsonb, correlation_id);
  end if;

  select coalesce(max(item.submission_number), 0) + 1 into next_number
  from public.approval_submissions item
  where item.promotion_id = promotion.id;
  insert into public.approval_submissions (
    promotion_id, submission_number, resource_link_id, submitted_by
  ) values (
    promotion.id, next_number, resource.id, actor_id
  ) returning * into submission;

  update public.promotions item
  set
    approver_id = coalesce(item.approver_id, item.creator_id, actor_id),
    status = 'SUBMITTED_FOR_APPROVAL',
    version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, 'ApprovalSubmitted', actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'submissionId', submission.id,
      'submissionNumber', submission.submission_number,
      'resourceId', resource.id,
      'approverId', promotion.approver_id
    )
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'submission', to_jsonb(submission));
end;
$$;

create or replace function public.decide_approval(
  submission_id uuid,
  decision public.approval_decision,
  comments text,
  expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  promotion public.promotions%rowtype;
  submission public.approval_submissions%rowtype;
  recorded_decision public.approval_decisions%rowtype;
  next_status public.promotion_status;
  event_name text;
begin
  select item.* into submission
  from public.approval_submissions item
  where item.id = decide_approval.submission_id;
  if submission.id is null then
    perform public._domain_error('SUBMISSION_NOT_FOUND', 'Approval submission was not found.', '{}'::jsonb, correlation_id);
  end if;

  select item.* into promotion
  from public.promotions item
  where item.id = submission.promotion_id
  for update;
  if not public.current_user_can_approve_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Creator, Sales owner, or Administrator can decide this submission.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> decide_approval.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status <> 'SUBMITTED_FOR_APPROVAL' then
    perform public._domain_error('PROMOTION_INVALID_TRANSITION', 'There is no pending approval in the current state.', '{}'::jsonb, correlation_id);
  end if;
  if submission.submission_number <> (
    select max(item.submission_number)
    from public.approval_submissions item
    where item.promotion_id = promotion.id
  ) then
    perform public._domain_error('SUBMISSION_SUPERSEDED', 'Only the latest submission can be decided.', '{}'::jsonb, correlation_id);
  end if;
  if exists (
    select 1 from public.approval_decisions item
    where item.approval_submission_id = submission.id
  ) then
    perform public._domain_error('SUBMISSION_ALREADY_DECIDED', 'Submission already has a final decision.', '{}'::jsonb, correlation_id);
  end if;
  if decide_approval.decision = 'REVISION_REQUESTED'
    and length(btrim(coalesce(decide_approval.comments, ''))) = 0
  then
    perform public._domain_error('REVISION_COMMENTS_REQUIRED', 'Revision comments are required.', '{}'::jsonb, correlation_id);
  end if;

  insert into public.approval_decisions (
    approval_submission_id, promotion_id, decision, comments, decided_by
  ) values (
    submission.id,
    promotion.id,
    decide_approval.decision,
    nullif(btrim(decide_approval.comments), ''),
    actor_id
  ) returning * into recorded_decision;

  next_status := case decide_approval.decision
    when 'APPROVED' then 'APPROVED'::public.promotion_status
    when 'REVISION_REQUESTED' then 'REVISION_REQUESTED'::public.promotion_status
  end;
  event_name := case decide_approval.decision
    when 'APPROVED' then 'PromotionApproved'
    when 'REVISION_REQUESTED' then 'PromotionRevisionRequested'
  end;
  update public.promotions item
  set status = next_status, version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, event_name, actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'submissionId', submission.id,
      'decisionId', recorded_decision.id,
      'comments', recorded_decision.comments
    )
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'decision', to_jsonb(recorded_decision));
end;
$$;

create or replace function public.start_publishing(promotion_id uuid, expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  promotion public.promotions%rowtype;
begin
  select item.* into promotion
  from public.promotions item
  where item.id = start_publishing.promotion_id
  for update;
  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_publish_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Creator, Sales owner, or Administrator can start publishing.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> start_publishing.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status not in ('APPROVED', 'PUBLISHER_ASSIGNED') then
    perform public._domain_error(
      'PROMOTION_INVALID_TRANSITION', 'Publishing cannot start from the current state.',
      jsonb_build_object('from', promotion.status, 'to', 'PUBLISHING_IN_PROGRESS'), correlation_id
    );
  end if;

  update public.promotions item
  set
    publisher_id = coalesce(item.publisher_id, item.creator_id, actor_id),
    status = 'PUBLISHING_IN_PROGRESS',
    version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, 'PublishingStarted', actor_id, promotion.version, correlation_id,
    '{}'::jsonb
  );
  return public._promotion_dto(promotion);
end;
$$;

create or replace function public.record_publication(
  promotion_id uuid,
  input jsonb,
  expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  promotion public.promotions%rowtype;
  publication public.publications%rowtype;
  artifact_id uuid := public.safe_uuid(input ->> 'artifact_resource_link_id');
begin
  select item.* into promotion
  from public.promotions item
  where item.id = record_publication.promotion_id
  for update;
  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_publish_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Creator, Sales owner, or Administrator can record publication.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> record_publication.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status <> 'PUBLISHING_IN_PROGRESS' then
    perform public._domain_error(
      'PROMOTION_INVALID_TRANSITION', 'Publication cannot be recorded from the current state.',
      jsonb_build_object('from', promotion.status, 'to', 'PUBLISHED'), correlation_id
    );
  end if;
  if length(btrim(coalesce(input ->> 'provider', ''))) = 0
    or length(btrim(coalesce(input ->> 'destination', ''))) = 0
  then
    perform public._domain_error('PUBLICATION_FIELDS_REQUIRED', 'Provider and destination are required.', '{}'::jsonb, correlation_id);
  end if;
  if coalesce(input ->> 'publication_url', '') !~* '^https://[^[:space:]]+$' then
    perform public._domain_error('PUBLICATION_URL_INVALID', 'Publication URL must be valid HTTPS.', '{}'::jsonb, correlation_id);
  end if;
  if artifact_id is null or not exists (
    select 1
    from public.approval_submissions submission
    join public.approval_decisions decision on decision.approval_submission_id = submission.id
    where submission.promotion_id = promotion.id
      and submission.resource_link_id = artifact_id
      and decision.decision = 'APPROVED'
  ) then
    perform public._domain_error('APPROVED_ARTIFACT_REQUIRED', 'Publication must reference an approved creative resource.', '{}'::jsonb, correlation_id);
  end if;

  insert into public.publications (
    promotion_id,
    provider,
    destination,
    external_publication_id,
    publication_url,
    artifact_resource_link_id,
    published_by,
    published_at,
    event_type
  ) values (
    promotion.id,
    btrim(input ->> 'provider'),
    btrim(input ->> 'destination'),
    nullif(btrim(input ->> 'external_publication_id'), ''),
    btrim(input ->> 'publication_url'),
    artifact_id,
    actor_id,
    coalesce(nullif(input ->> 'published_at', '')::timestamptz, now()),
    'PUBLISHED'
  ) returning * into publication;

  update public.promotions item
  set status = 'PUBLISHED', version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, 'PublicationRecorded', actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'publicationId', publication.id,
      'provider', publication.provider,
      'destination', publication.destination,
      'publicationUrl', publication.publication_url
    )
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'publication', to_jsonb(publication));
end;
$$;

create or replace function public.request_publication_verification(
  publication_id uuid,
  expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  promotion public.promotions%rowtype;
  publication public.publications%rowtype;
begin
  select item.* into publication
  from public.publications item
  where item.id = request_publication_verification.publication_id;
  if publication.id is null then
    perform public._domain_error('PUBLICATION_NOT_FOUND', 'Publication was not found.', '{}'::jsonb, correlation_id);
  end if;
  select item.* into promotion
  from public.promotions item
  where item.id = publication.promotion_id
  for update;

  if not public.current_user_can_publish_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Creator, Sales owner, or Administrator can request verification.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> request_publication_verification.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status <> 'PUBLISHED' or publication.event_type <> 'PUBLISHED' then
    perform public._domain_error('PROMOTION_INVALID_TRANSITION', 'Only a published promotion can request verification.', '{}'::jsonb, correlation_id);
  end if;
  if exists (
    select 1
    from public.publications newer
    where newer.supersedes_publication_id = publication.id
  ) then
    perform public._domain_error('PUBLICATION_SUPERSEDED', 'A superseded publication cannot be verified.', '{}'::jsonb, correlation_id);
  end if;

  update public.promotions item
  set status = 'VERIFICATION_PENDING', version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, 'PublicationVerificationRequested', actor_id, promotion.version, correlation_id,
    jsonb_build_object('publicationId', publication.id)
  );
  return public._promotion_dto(promotion);
end;
$$;

create or replace function public._record_publication_verification(
  publication_id uuid,
  input jsonb,
  expected_version integer,
  actor_id uuid,
  caller_is_service boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  correlation_id uuid := extensions.gen_random_uuid();
  promotion public.promotions%rowtype;
  publication public.publications%rowtype;
  verification public.publication_verifications%rowtype;
  result_status public.verification_status;
  method text;
  can_verify boolean;
  event_name text;
begin
  select item.* into publication
  from public.publications item
  where item.id = _record_publication_verification.publication_id;
  if publication.id is null then
    perform public._domain_error('PUBLICATION_NOT_FOUND', 'Publication was not found.', '{}'::jsonb, correlation_id);
  end if;
  select item.* into promotion
  from public.promotions item
  where item.id = publication.promotion_id
  for update;

  can_verify := caller_is_service or public.current_user_can_publish_promotion(promotion.id);
  if not can_verify then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Creator, Sales owner, or Administrator can verify publication.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> _record_publication_verification.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status <> 'VERIFICATION_PENDING' then
    perform public._domain_error('PROMOTION_INVALID_TRANSITION', 'Publication verification is not pending.', '{}'::jsonb, correlation_id);
  end if;

  if nullif(input ->> 'status', '') is null then
    perform public._domain_error('VERIFICATION_STATUS_INVALID', 'Verification status is required.', '{}'::jsonb, correlation_id);
  end if;
  begin
    result_status := (input ->> 'status')::public.verification_status;
  exception when invalid_text_representation then
    perform public._domain_error('VERIFICATION_STATUS_INVALID', 'Verification status is invalid.', '{}'::jsonb, correlation_id);
  end;
  method := case
    when caller_is_service then 'WEBHOOK'
    else 'MANUAL'
  end;

  insert into public.publication_verifications (
    publication_id,
    status,
    method,
    details,
    verified_by
  ) values (
    publication.id,
    result_status,
    method,
    jsonb_strip_nulls(jsonb_build_object(
      'notes', nullif(btrim(coalesce(input ->> 'notes', '')), ''),
      'source', input ->> 'source',
      'raw', input -> 'raw'
    )),
    actor_id
  ) returning * into verification;

  event_name := case result_status
    when 'VERIFIED' then 'PublicationVerified'
    when 'FAILED' then 'PublicationVerificationFailed'
    when 'UNAVAILABLE' then 'PublicationVerificationUnavailable'
  end;

  update public.promotions item
  set
    status = case when result_status = 'VERIFIED' then 'VERIFIED'::public.promotion_status else item.status end,
    version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, event_name, actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'publicationId', publication.id,
      'verificationId', verification.id,
      'status', verification.status
    )
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'verification', to_jsonb(verification));
end;
$$;
