-- Split from 20260719000200 to allow enum value to be committed first
-- before any function body references it (PostgreSQL SQLSTATE 55P04 requirement).

-- Function to complete a promotion (after invoice is paid)
create or replace function public.complete_promotion(
  promotion_id uuid,
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
begin
  select item.* into promotion
  from public.promotions item
  where item.id = complete_promotion.promotion_id
  for update;

  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;

  if not (
    public._user_has_role(actor_id, 'ADMINISTRATOR')
    or public._user_has_role(actor_id, 'SALES')
    or public._user_has_role(actor_id, 'FINANCE')
  ) then
    perform public._domain_error('FORBIDDEN', 'Sales or Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;

  if promotion.version <> complete_promotion.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;

  if promotion.status <> 'INVOICED' then
    perform public._domain_error(
      'PROMOTION_INVALID_STATUS',
      'Only invoiced promotions can be marked as completed.',
      jsonb_build_object('status', promotion.status),
      correlation_id
    );
  end if;

  -- Require at least one paid invoice
  if not exists (
    select 1 from public.invoices invoice
    where invoice.promotion_id = complete_promotion.promotion_id
      and invoice.status = 'PAID'
  ) then
    perform public._domain_error(
      'INVOICE_NOT_PAID',
      'At least one paid invoice is required to complete a promotion.',
      '{}'::jsonb,
      correlation_id
    );
  end if;

  update public.promotions item
  set
    status = 'COMPLETED',
    version = item.version + 1
  where item.id = complete_promotion.promotion_id
  returning * into promotion;

  perform public._emit_event(
    'Promotion', promotion.id, 'PromotionCompleted', actor_id, promotion.version, correlation_id,
    '{}'::jsonb
  );

  return public._promotion_dto(promotion);
end;
$$;

-- Patch get_promotion_allowed_actions to expose MARK_COMPLETED
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
  actor_is_admin boolean;
  can_manage boolean;
  can_work boolean;
  latest_submission public.approval_submissions%rowtype;
begin
  if not public.current_user_can_view_promotion(get_promotion_allowed_actions.promotion_id) then
    return array[]::text[];
  end if;

  select item.* into promotion
  from public.promotions item
  where item.id = get_promotion_allowed_actions.promotion_id;

  actor_is_admin := public._user_has_role(actor_id, 'ADMINISTRATOR');
  can_manage := public.current_user_can_manage_promotion(promotion.id);
  can_work   := public.current_user_can_approve_promotion(promotion.id)
             or public.current_user_can_publish_promotion(promotion.id)
             or can_manage;

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

  -- MARK_COMPLETED: when INVOICED and at least one PAID invoice exists
  if (can_manage or public.current_user_can_invoice_promotion(promotion.id))
    and promotion.status = 'INVOICED'
    and exists (
      select 1 from public.invoices invoice
      where invoice.promotion_id = promotion.id
        and invoice.status = 'PAID'
    )
  then
    actions := array_append(actions, 'MARK_COMPLETED');
  end if;

  return actions;
end;
$$;

-- Update current_user_can_invoice_promotion to include COMPLETED
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
      and promotion.status in ('READY_FOR_INVOICING', 'INVOICED', 'COMPLETED')
      and (
        public._user_has_role(auth.uid(), 'ADMINISTRATOR')
        or public._user_has_role(auth.uid(), 'SALES')
        or public._user_has_role(auth.uid(), 'FINANCE')
      )
  );
$$;
