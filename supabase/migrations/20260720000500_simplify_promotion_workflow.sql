alter table public.publications
  add column if not exists publishing_account_id uuid references public.publishing_accounts (id) on delete restrict;

create unique index if not exists publications_promotion_account_current_idx
  on public.publications (promotion_id, publishing_account_id)
  where publishing_account_id is not null
    and event_type = 'PUBLISHED'
    and supersedes_publication_id is null;

delete from public.user_roles user_role
using public.roles role
where role.id = user_role.role_id
  and role.code in ('FINANCE', 'APPROVER', 'PUBLISHER');

delete from public.roles
where code in ('FINANCE', 'APPROVER', 'PUBLISHER');

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
        or public._user_has_role(auth.uid(), 'SALES')
        or promotion.creator_id = auth.uid()
        or promotion.status = 'SUBMITTED_FOR_APPROVAL'
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
      and promotion.status = 'SUBMITTED_FOR_APPROVAL'
      and public._user_has_any_role(auth.uid())
  );
$$;

create or replace function public.current_user_can_publish_promotion(promotion_id uuid)
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
        or public._user_has_role(auth.uid(), 'SALES')
        or promotion.creator_id = auth.uid()
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
      and promotion.status not in ('CANCELLED', 'INVOICED', 'COMPLETED')
      and (
        public._user_has_role(auth.uid(), 'ADMINISTRATOR')
        or public._user_has_role(auth.uid(), 'SALES')
        or promotion.creator_id = auth.uid()
      )
  );
$$;

create or replace function public.get_promotion_allowed_actions(promotion_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  actions text[] := array[]::text[];
  promotion public.promotions%rowtype;
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

  can_manage := public.current_user_can_manage_promotion(promotion.id);
  can_work := public.current_user_can_publish_promotion(promotion.id);

  if (can_manage or can_work) and promotion.status not in ('CANCELLED', 'INVOICED', 'COMPLETED') then
    actions := array_append(actions, 'UPDATE_PROMOTION');
    actions := array_append(actions, 'CANCEL_PROMOTION');
  end if;

  if can_manage and promotion.status not in ('CANCELLED', 'INVOICED', 'COMPLETED') then
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
      select 1
      from public.promotion_resource_links resource
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

    if public.current_user_can_approve_promotion(promotion.id)
      and latest_submission.id is not null
      and not exists (
        select 1
        from public.approval_decisions decision
        where decision.approval_submission_id = latest_submission.id
      )
    then
      actions := array_append(actions, 'DECIDE_APPROVAL');
    end if;
  end if;

  if can_work and promotion.status = 'APPROVED' then
    actions := array_append(actions, 'START_PUBLISHING');
  end if;

  if can_work and promotion.status = 'PUBLISHING_IN_PROGRESS' then
    actions := array_append(actions, 'RECORD_PUBLICATION');
  end if;

  if public.current_user_can_invoice_promotion(promotion.id)
    and promotion.status = 'READY_FOR_INVOICING'
  then
    actions := array_append(actions, 'CREATE_INVOICE');
  end if;

  if public.current_user_can_invoice_promotion(promotion.id)
    and promotion.status = 'INVOICED'
    and exists (
      select 1
      from public.invoices invoice
      where invoice.promotion_id = promotion.id
        and invoice.status = 'PAID'
    )
  then
    actions := array_append(actions, 'MARK_COMPLETED');
  end if;

  return actions;
end;
$$;

create or replace function public.assign_promotion_role(
  promotion_id uuid,
  role_type public.assignment_role,
  user_id uuid,
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
  assignee public.profiles%rowtype;
  event_name text;
begin
  select item.* into promotion
  from public.promotions item
  where item.id = assign_promotion_role.promotion_id
  for update;
  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_manage_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'Only Sales owners or Administrators can assign promotion owners and creators.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> assign_promotion_role.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if role_type not in ('SALES_OWNER', 'CREATOR') then
    perform public._domain_error('ASSIGNMENT_ROLE_REMOVED', 'Only promotion owner and creator assignments are supported.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status in ('CANCELLED', 'INVOICED', 'COMPLETED') then
    perform public._domain_error('PROMOTION_LOCKED', 'This promotion can no longer be reassigned.', '{}'::jsonb, correlation_id);
  end if;

  select item.* into assignee
  from public.profiles item
  where item.id = assign_promotion_role.user_id
    and item.status = 'ACTIVE';
  if assignee.id is null then
    perform public._domain_error('INVALID_ASSIGNEE', 'Choose an active team member.', '{}'::jsonb, correlation_id);
  end if;
  if role_type = 'SALES_OWNER' and not (
    public._user_has_role(assign_promotion_role.user_id, 'SALES')
    or public._user_has_role(assign_promotion_role.user_id, 'ADMINISTRATOR')
  ) then
    perform public._domain_error('INVALID_ASSIGNEE_ROLE', 'Promotion owner must be Sales or Administrator.', '{}'::jsonb, correlation_id);
  end if;
  if role_type = 'CREATOR' and not public._user_has_any_role(assign_promotion_role.user_id) then
    perform public._domain_error('INVALID_ASSIGNEE_ROLE', 'Creator can be any active user with a CRM role.', '{}'::jsonb, correlation_id);
  end if;

  update public.promotions item
  set
    sales_owner_id = case when role_type = 'SALES_OWNER' then assign_promotion_role.user_id else item.sales_owner_id end,
    creator_id = case when role_type = 'CREATOR' then assign_promotion_role.user_id else item.creator_id end,
    status = case
      when role_type = 'CREATOR' and item.status = 'DRAFT' then 'CREATOR_ASSIGNED'::public.promotion_status
      else item.status
    end,
    version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;

  event_name := case role_type
    when 'SALES_OWNER' then 'SalesOwnerAssigned'
    when 'CREATOR' then 'CreatorAssigned'
  end;
  perform public._emit_event(
    'Promotion', promotion.id, event_name, actor_id, promotion.version, correlation_id,
    jsonb_build_object('userId', assignee.id, 'displayName', assignee.display_name)
  );
  return public._promotion_dto(promotion);
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
  if not public.current_user_can_publish_promotion(promotion.id) then
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
  set status = 'CREATIVE_IN_PROGRESS', version = item.version + 1
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
  if not public.current_user_can_publish_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Creator, Sales owner, or Administrator can mark work ready for approval.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> submit_for_approval.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status <> 'CREATIVE_IN_PROGRESS' then
    perform public._domain_error('PROMOTION_INVALID_TRANSITION', 'Creative work can only be submitted while in progress.', jsonb_build_object('from', promotion.status, 'to', 'SUBMITTED_FOR_APPROVAL'), correlation_id);
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
  set status = 'SUBMITTED_FOR_APPROVAL', version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, 'ApprovalSubmitted', actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'submissionId', submission.id,
      'submissionNumber', submission.submission_number,
      'resourceId', resource.id
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
    perform public._domain_error('FORBIDDEN', 'Any active CRM user can approve submitted creative.', '{}'::jsonb, correlation_id);
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
    select 1
    from public.approval_decisions item
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
  if promotion.status <> 'APPROVED' then
    perform public._domain_error('PROMOTION_INVALID_TRANSITION', 'Publishing cannot start from the current state.', jsonb_build_object('from', promotion.status, 'to', 'PUBLISHING_IN_PROGRESS'), correlation_id);
  end if;

  update public.promotions item
  set status = 'PUBLISHING_IN_PROGRESS', version = item.version + 1
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
  selected_account_id uuid := public.safe_uuid(input ->> 'publishing_account_id');
  selected_account_ids uuid[] := array[]::uuid[];
  account public.publishing_accounts%rowtype;
  provider_value text;
  destination_value text;
  all_accounts_complete boolean := false;
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
    perform public._domain_error('PROMOTION_INVALID_TRANSITION', 'Publication cannot be recorded from the current state.', jsonb_build_object('from', promotion.status, 'to', 'READY_FOR_INVOICING'), correlation_id);
  end if;
  if coalesce(input ->> 'publication_url', '') !~* '^https://[^[:space:]]+$' then
    perform public._domain_error('PUBLICATION_URL_INVALID', 'Publication URL must be valid HTTPS.', '{}'::jsonb, correlation_id);
  end if;
  if artifact_id is null or not exists (
    select 1
    from public.approval_submissions submission
    join public.approval_decisions approval_decision on approval_decision.approval_submission_id = submission.id
    where submission.promotion_id = promotion.id
      and submission.resource_link_id = artifact_id
      and approval_decision.decision = 'APPROVED'
  ) then
    perform public._domain_error('APPROVED_ARTIFACT_REQUIRED', 'Publication must reference an approved creative resource.', '{}'::jsonb, correlation_id);
  end if;

  select coalesce(metadata.publishing_account_ids, array[]::uuid[]) into selected_account_ids
  from public.campaign_metadata metadata
  where metadata.promotion_id = promotion.id;
  selected_account_ids := coalesce(selected_account_ids, array[]::uuid[]);

  if array_length(selected_account_ids, 1) is not null then
    if selected_account_id is null then
      perform public._domain_error('PUBLISHING_ACCOUNT_REQUIRED', 'Choose the account where this promo was posted.', '{}'::jsonb, correlation_id);
    end if;
    if not selected_account_id = any(selected_account_ids) then
      perform public._domain_error('PUBLISHING_ACCOUNT_NOT_SELECTED', 'This publishing account is not part of the promotion checklist.', '{}'::jsonb, correlation_id);
    end if;
    select item.* into account
    from public.publishing_accounts item
    where item.id = selected_account_id
      and item.active = true;
    if account.id is null then
      perform public._domain_error('PUBLISHING_ACCOUNT_INVALID', 'Choose an active publishing account.', '{}'::jsonb, correlation_id);
    end if;
    if exists (
      select 1
      from public.publications existing
      where existing.promotion_id = promotion.id
        and existing.publishing_account_id = selected_account_id
        and existing.event_type = 'PUBLISHED'
        and existing.supersedes_publication_id is null
    ) then
      perform public._domain_error('PUBLICATION_ALREADY_RECORDED', 'This account already has a recorded publication.', '{}'::jsonb, correlation_id);
    end if;
    provider_value := account.platform;
    destination_value := account.handle;
  else
    provider_value := btrim(coalesce(input ->> 'provider', ''));
    destination_value := btrim(coalesce(input ->> 'destination', ''));
    if length(provider_value) = 0 or length(destination_value) = 0 then
      perform public._domain_error('PUBLICATION_FIELDS_REQUIRED', 'Provider and destination are required.', '{}'::jsonb, correlation_id);
    end if;
  end if;

  insert into public.publications (
    promotion_id,
    publishing_account_id,
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
    selected_account_id,
    provider_value,
    destination_value,
    nullif(btrim(input ->> 'external_publication_id'), ''),
    btrim(input ->> 'publication_url'),
    artifact_id,
    actor_id,
    coalesce(nullif(input ->> 'published_at', '')::timestamptz, now()),
    'PUBLISHED'
  ) returning * into publication;

  if array_length(selected_account_ids, 1) is null then
    all_accounts_complete := true;
  else
    select not exists (
      select 1
      from unnest(selected_account_ids) selected(id)
      where not exists (
        select 1
        from public.publications existing
        where existing.promotion_id = promotion.id
          and existing.publishing_account_id = selected.id
          and existing.event_type = 'PUBLISHED'
          and existing.supersedes_publication_id is null
      )
    ) into all_accounts_complete;
  end if;

  update public.promotions item
  set
    status = case
      when all_accounts_complete then 'READY_FOR_INVOICING'::public.promotion_status
      else 'PUBLISHING_IN_PROGRESS'::public.promotion_status
    end,
    version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;

  perform public._emit_event(
    'Promotion', promotion.id, 'PublicationRecorded', actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'publicationId', publication.id,
      'publishingAccountId', publication.publishing_account_id,
      'provider', publication.provider,
      'destination', publication.destination,
      'publicationUrl', publication.publication_url
    )
  );
  if all_accounts_complete then
    perform public._emit_event(
      'Promotion', promotion.id, 'PromotionReadyForInvoicing', actor_id, promotion.version, correlation_id,
      '{}'::jsonb
    );
  end if;
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'publication', to_jsonb(publication));
end;
$$;

create or replace function public._promotion_dto(promotion public.promotions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb($1)
    || jsonb_build_object(
      'allowed_actions', public.get_promotion_allowed_actions(($1).id)
    );
$$;

drop index if exists public.promotions_approver_id_idx;
drop index if exists public.promotions_publisher_id_idx;
alter table public.promotions
  drop column if exists approver_id,
  drop column if exists publisher_id;
