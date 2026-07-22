-- Optional Approver assignment. A promotion can (but need not) name a specific reviewer.
-- The approver must be an existing role-holder. Assigning does not remove approval rights
-- from anyone who has them today; it grants the approver those rights and notifies them.

alter table public.promotions
  add column if not exists approver_id uuid references public.profiles (id) on delete restrict;

create index if not exists promotions_approver_id_idx
  on public.promotions (approver_id)
  where approver_id is not null;

-- The assigned approver can see the promotion they are asked to review.
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
        or promotion.approver_id = auth.uid()
        or promotion.status = 'SUBMITTED_FOR_APPROVAL'
      )
  );
$$;

-- Approval stays open to current approvers (any role-holder while awaiting approval) and
-- additionally to the assigned approver.
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
      and (
        public._user_has_any_role(auth.uid())
        or promotion.approver_id = auth.uid()
      )
  );
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
    perform public._domain_error('FORBIDDEN', 'Only Sales owners or Administrators can assign promotion roles.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> assign_promotion_role.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if role_type not in ('SALES_OWNER', 'CREATOR', 'APPROVER') then
    perform public._domain_error('ASSIGNMENT_ROLE_REMOVED', 'Only promotion owner, creator, and approver assignments are supported.', '{}'::jsonb, correlation_id);
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
  if role_type = 'APPROVER' and not public._user_has_any_role(assign_promotion_role.user_id) then
    perform public._domain_error('INVALID_ASSIGNEE_ROLE', 'Approver can be any active user with a CRM role.', '{}'::jsonb, correlation_id);
  end if;

  update public.promotions item
  set
    sales_owner_id = case when role_type = 'SALES_OWNER' then assign_promotion_role.user_id else item.sales_owner_id end,
    creator_id = case when role_type = 'CREATOR' then assign_promotion_role.user_id else item.creator_id end,
    approver_id = case when role_type = 'APPROVER' then assign_promotion_role.user_id else item.approver_id end,
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
    when 'APPROVER' then 'ApproverAssigned'
  end;
  perform public._emit_event(
    'Promotion', promotion.id, event_name, actor_id, promotion.version, correlation_id,
    jsonb_build_object('userId', assignee.id, 'displayName', assignee.display_name)
  );
  return public._promotion_dto(promotion);
end;
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
    actions := array_append(actions, 'ASSIGN_APPROVER');
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
