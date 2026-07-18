create function public.create_promotion(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  selected_client_id uuid := public.safe_uuid(input ->> 'client_id');
  selected_sales_owner_id uuid := coalesce(public.safe_uuid(input ->> 'sales_owner_id'), actor_id);
  promotion public.promotions%rowtype;
begin
  if not (
    public._user_has_role(actor_id, 'SALES')
    or public._user_has_role(actor_id, 'ADMINISTRATOR')
  ) then
    perform public._domain_error('FORBIDDEN', 'Sales or Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  if input ? 'sales_owner_id' and public.safe_uuid(input ->> 'sales_owner_id') is null then
    perform public._domain_error('INVALID_SALES_OWNER', 'Sales owner ID must be a UUID.', '{}'::jsonb, correlation_id);
  end if;
  if selected_client_id is null or not exists (
    select 1 from public.clients client
    where client.id = selected_client_id and client.archived_at is null
  ) then
    perform public._domain_error('CLIENT_NOT_AVAILABLE', 'An active client is required.', '{}'::jsonb, correlation_id);
  end if;
  if not (
    public._user_has_role(selected_sales_owner_id, 'SALES')
    or public._user_has_role(selected_sales_owner_id, 'ADMINISTRATOR')
  ) then
    perform public._domain_error('INVALID_SALES_OWNER', 'Sales owner must be an active Sales or Administrator user.', '{}'::jsonb, correlation_id);
  end if;
  if length(btrim(coalesce(input ->> 'title', ''))) = 0 then
    perform public._domain_error('PROMOTION_TITLE_REQUIRED', 'Promotion title is required.', '{}'::jsonb, correlation_id);
  end if;

  insert into public.promotions (
    client_id,
    title,
    description,
    sales_owner_id,
    due_date,
    created_by
  ) values (
    selected_client_id,
    btrim(input ->> 'title'),
    nullif(btrim(input ->> 'description'), ''),
    selected_sales_owner_id,
    case when nullif(input ->> 'due_date', '') is null then null else (input ->> 'due_date')::date end,
    actor_id
  ) returning * into promotion;

  insert into public.promotion_assignments (
    promotion_id, role_type, event_type, assigned_user_id, performed_by
  ) values (
    promotion.id, 'SALES_OWNER', 'ASSIGNED', selected_sales_owner_id, actor_id
  );

  perform public._emit_event(
    'Promotion', promotion.id, 'PromotionCreated', actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'clientId', promotion.client_id,
      'title', promotion.title,
      'salesOwnerId', promotion.sales_owner_id
    )
  );
  return public._promotion_dto(promotion);
end;
$$;

create function public.update_promotion(
  promotion_id uuid,
  expected_version integer,
  input jsonb
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
  selected_client_id uuid;
begin
  select item.* into promotion
  from public.promotions item
  where item.id = update_promotion.promotion_id
  for update;
  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_manage_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'The user cannot manage this promotion.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> update_promotion.expected_version then
    perform public._domain_error(
      'PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.',
      jsonb_build_object('expectedVersion', update_promotion.expected_version, 'actualVersion', promotion.version),
      correlation_id
    );
  end if;
  if promotion.status not in ('DRAFT', 'CREATOR_ASSIGNED') then
    perform public._domain_error(
      'PROMOTION_NOT_EDITABLE', 'Promotion details can only be edited in an initial stage.',
      jsonb_build_object('status', promotion.status), correlation_id
    );
  end if;

  selected_client_id := case
    when input ? 'client_id' then public.safe_uuid(input ->> 'client_id')
    else promotion.client_id
  end;
  if selected_client_id is null or not exists (
    select 1 from public.clients client
    where client.id = selected_client_id and client.archived_at is null
  ) then
    perform public._domain_error('CLIENT_NOT_AVAILABLE', 'An active client is required.', '{}'::jsonb, correlation_id);
  end if;
  if input ? 'title' and length(btrim(coalesce(input ->> 'title', ''))) = 0 then
    perform public._domain_error('PROMOTION_TITLE_REQUIRED', 'Promotion title is required.', '{}'::jsonb, correlation_id);
  end if;

  update public.promotions item
  set
    client_id = selected_client_id,
    title = case when input ? 'title' then btrim(input ->> 'title') else item.title end,
    description = case when input ? 'description' then nullif(btrim(input ->> 'description'), '') else item.description end,
    due_date = case
      when input ? 'due_date' and nullif(input ->> 'due_date', '') is null then null
      when input ? 'due_date' then (input ->> 'due_date')::date
      else item.due_date
    end,
    version = item.version + 1
  where item.id = update_promotion.promotion_id
  returning * into promotion;

  perform public._emit_event(
    'Promotion', promotion.id, 'PromotionUpdated', actor_id, promotion.version, correlation_id,
    jsonb_build_object('changedFields', (select coalesce(jsonb_agg(key), '[]'::jsonb) from jsonb_object_keys(input) as key))
  );
  return public._promotion_dto(promotion);
end;
$$;

create function public.cancel_promotion(
  promotion_id uuid,
  expected_version integer,
  reason text
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
  where item.id = cancel_promotion.promotion_id
  for update;
  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_manage_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'The user cannot cancel this promotion.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> cancel_promotion.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status in ('CANCELLED', 'INVOICED') then
    perform public._domain_error(
      'PROMOTION_TERMINAL', 'A terminal promotion cannot be cancelled.',
      jsonb_build_object('status', promotion.status), correlation_id
    );
  end if;
  if length(btrim(coalesce(cancel_promotion.reason, ''))) = 0 then
    perform public._domain_error('CANCELLATION_REASON_REQUIRED', 'A cancellation reason is required.', '{}'::jsonb, correlation_id);
  end if;

  update public.promotions item
  set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancellation_reason = btrim(cancel_promotion.reason),
    version = item.version + 1
  where item.id = cancel_promotion.promotion_id
  returning * into promotion;

  perform public._emit_event(
    'Promotion', promotion.id, 'PromotionCancelled', actor_id, promotion.version, correlation_id,
    jsonb_build_object('reason', promotion.cancellation_reason)
  );
  return public._promotion_dto(promotion);
end;
$$;

create function public.assign_promotion_role(
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
  required_role text;
  current_user_id uuid;
  prior_assignment_id uuid;
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
    perform public._domain_error('FORBIDDEN', 'The user cannot assign this promotion.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> assign_promotion_role.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status in ('CANCELLED', 'INVOICED') then
    perform public._domain_error('PROMOTION_TERMINAL', 'A terminal promotion cannot be assigned.', '{}'::jsonb, correlation_id);
  end if;

  required_role := case assign_promotion_role.role_type
    when 'SALES_OWNER' then 'SALES'
    when 'CREATOR' then 'CREATOR'
    when 'APPROVER' then 'APPROVER'
    when 'PUBLISHER' then 'PUBLISHER'
  end;
  if not public._user_has_role(assign_promotion_role.user_id, required_role)
    and not (
      assign_promotion_role.role_type = 'SALES_OWNER'
      and public._user_has_role(assign_promotion_role.user_id, 'ADMINISTRATOR')
    )
  then
    perform public._domain_error(
      'ASSIGNEE_ROLE_REQUIRED', 'The assignee does not have the required active role.',
      jsonb_build_object('requiredRole', required_role), correlation_id
    );
  end if;

  case assign_promotion_role.role_type
    when 'SALES_OWNER' then
      current_user_id := promotion.sales_owner_id;
    when 'CREATOR' then
      current_user_id := promotion.creator_id;
      if promotion.status not in ('DRAFT', 'CREATOR_ASSIGNED', 'CREATIVE_IN_PROGRESS', 'REVISION_REQUESTED') then
        perform public._domain_error('ASSIGNMENT_NOT_ALLOWED', 'Creator cannot be assigned in the current state.', '{}'::jsonb, correlation_id);
      end if;
    when 'APPROVER' then
      current_user_id := promotion.approver_id;
      if promotion.status not in ('DRAFT', 'CREATOR_ASSIGNED', 'CREATIVE_IN_PROGRESS', 'REVISION_REQUESTED') then
        perform public._domain_error('ASSIGNMENT_NOT_ALLOWED', 'Approver cannot be assigned in the current state.', '{}'::jsonb, correlation_id);
      end if;
    when 'PUBLISHER' then
      current_user_id := promotion.publisher_id;
      if promotion.status not in ('APPROVED', 'PUBLISHER_ASSIGNED') then
        perform public._domain_error('ASSIGNMENT_NOT_ALLOWED', 'Publisher can only be assigned after approval.', '{}'::jsonb, correlation_id);
      end if;
  end case;

  if current_user_id = assign_promotion_role.user_id then
    perform public._domain_error('ASSIGNMENT_UNCHANGED', 'The requested user is already assigned.', '{}'::jsonb, correlation_id);
  end if;
  if assign_promotion_role.role_type = 'CREATOR'
    and promotion.approver_id = assign_promotion_role.user_id
  then
    perform public._domain_error('CREATOR_APPROVER_MUST_DIFFER', 'Creator and Approver must be different users.', '{}'::jsonb, correlation_id);
  end if;
  if assign_promotion_role.role_type = 'APPROVER'
    and promotion.creator_id = assign_promotion_role.user_id
  then
    perform public._domain_error('CREATOR_APPROVER_MUST_DIFFER', 'Creator and Approver must be different users.', '{}'::jsonb, correlation_id);
  end if;

  select assignment.id into prior_assignment_id
  from public.promotion_assignments assignment
  where assignment.promotion_id = promotion.id
    and assignment.role_type = assign_promotion_role.role_type
    and assignment.event_type = 'ASSIGNED'
  order by assignment.occurred_at desc, assignment.id desc
  limit 1;

  if current_user_id is not null then
    insert into public.promotion_assignments (
      promotion_id, role_type, event_type, assigned_user_id, performed_by, replaces_assignment_id
    ) values (
      promotion.id, assign_promotion_role.role_type, 'UNASSIGNED', current_user_id, actor_id, prior_assignment_id
    );
  end if;

  insert into public.promotion_assignments (
    promotion_id, role_type, event_type, assigned_user_id, performed_by, replaces_assignment_id
  ) values (
    promotion.id,
    assign_promotion_role.role_type,
    'ASSIGNED',
    assign_promotion_role.user_id,
    actor_id,
    prior_assignment_id
  );

  update public.promotions item
  set
    sales_owner_id = case when assign_promotion_role.role_type = 'SALES_OWNER' then assign_promotion_role.user_id else item.sales_owner_id end,
    creator_id = case when assign_promotion_role.role_type = 'CREATOR' then assign_promotion_role.user_id else item.creator_id end,
    approver_id = case when assign_promotion_role.role_type = 'APPROVER' then assign_promotion_role.user_id else item.approver_id end,
    publisher_id = case when assign_promotion_role.role_type = 'PUBLISHER' then assign_promotion_role.user_id else item.publisher_id end,
    status = case
      when assign_promotion_role.role_type = 'CREATOR' and item.status = 'DRAFT' then 'CREATOR_ASSIGNED'::public.promotion_status
      when assign_promotion_role.role_type = 'PUBLISHER' and item.status = 'APPROVED' then 'PUBLISHER_ASSIGNED'::public.promotion_status
      else item.status
    end,
    version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;

  event_name := case assign_promotion_role.role_type
    when 'SALES_OWNER' then 'SalesOwnerAssigned'
    when 'CREATOR' then 'CreatorAssigned'
    when 'APPROVER' then 'ApproverAssigned'
    when 'PUBLISHER' then 'PublisherAssigned'
  end;
  perform public._emit_event(
    'Promotion', promotion.id, event_name, actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'roleType', assign_promotion_role.role_type,
      'assignedUserId', assign_promotion_role.user_id,
      'replacedUserId', current_user_id
    )
  );
  return public._promotion_dto(promotion);
end;
$$;

create function public.start_creative_work(promotion_id uuid, expected_version integer)
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
  if not (
    public._user_has_role(actor_id, 'ADMINISTRATOR')
    or (
      promotion.creator_id = actor_id
      and public._user_has_role(actor_id, 'CREATOR')
    )
  ) then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Creator can start creative work.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> start_creative_work.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status not in ('CREATOR_ASSIGNED', 'REVISION_REQUESTED') then
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

create function public.attach_resource_link(promotion_id uuid, input jsonb)
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
  resource_id uuid := coalesce(public.safe_uuid(input ->> 'id'), extensions.gen_random_uuid());
  provider public.resource_provider;
begin
  select item.* into promotion
  from public.promotions item
  where item.id = attach_resource_link.promotion_id
  for update;
  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_upload_promotion_asset(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'The user cannot attach resources to this promotion.', '{}'::jsonb, correlation_id);
  end if;
  if input ? 'id' and public.safe_uuid(input ->> 'id') is null then
    perform public._domain_error('RESOURCE_ID_INVALID', 'Resource ID must be a UUID.', '{}'::jsonb, correlation_id);
  end if;
  if length(btrim(coalesce(input ->> 'provider', ''))) = 0 then
    perform public._domain_error('RESOURCE_PROVIDER_REQUIRED', 'Resource provider is required.', '{}'::jsonb, correlation_id);
  end if;
  begin
    provider := (input ->> 'provider')::public.resource_provider;
  exception when invalid_text_representation then
    perform public._domain_error('RESOURCE_PROVIDER_INVALID', 'Resource provider is invalid.', '{}'::jsonb, correlation_id);
  end;
  if length(btrim(coalesce(input ->> 'resource_type', ''))) = 0
    or length(btrim(coalesce(input ->> 'display_name', ''))) = 0
    or length(btrim(coalesce(input ->> 'url', ''))) = 0
  then
    perform public._domain_error('RESOURCE_FIELDS_REQUIRED', 'Resource type, display name, and URL are required.', '{}'::jsonb, correlation_id);
  end if;
  if provider <> 'SUPABASE_STORAGE' and (input ->> 'url') !~* '^https://[^[:space:]]+$' then
    perform public._domain_error('RESOURCE_URL_INVALID', 'External resource URL must be valid HTTPS.', '{}'::jsonb, correlation_id);
  end if;
  if provider = 'SUPABASE_STORAGE'
    and (input ->> 'url') not like promotion.id::text || '/' || resource_id::text || '/%'
  then
    perform public._domain_error(
      'STORAGE_PATH_INVALID', 'Storage resource path must use promotion/resource UUID prefixes.',
      jsonb_build_object('requiredPrefix', promotion.id::text || '/' || resource_id::text || '/'), correlation_id
    );
  end if;

  insert into public.promotion_resource_links (
    id,
    promotion_id,
    provider,
    resource_type,
    external_id,
    url,
    display_name,
    metadata_json,
    validation_status,
    attached_by
  ) values (
    resource_id,
    promotion.id,
    provider,
    btrim(input ->> 'resource_type'),
    nullif(btrim(input ->> 'external_id'), ''),
    btrim(input ->> 'url'),
    btrim(input ->> 'display_name'),
    coalesce(input -> 'metadata_json', '{}'::jsonb),
    'PENDING'::public.resource_validation_status,
    actor_id
  ) returning * into resource;

  update public.promotions item
  set version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, 'ResourceAttached', actor_id, promotion.version, correlation_id,
    jsonb_build_object('resourceId', resource.id, 'provider', resource.provider, 'resourceType', resource.resource_type)
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'resource', to_jsonb(resource));
end;
$$;

create function public.finalize_private_asset(resource_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  resource public.promotion_resource_links%rowtype;
begin
  select item.* into resource
  from public.promotion_resource_links item
  where item.id = finalize_private_asset.resource_id
  for update;
  if resource.id is null or resource.provider <> 'SUPABASE_STORAGE' then
    perform public._domain_error('PRIVATE_ASSET_NOT_FOUND', 'Private asset resource was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_upload_promotion_asset(resource.promotion_id) then
    perform public._domain_error('FORBIDDEN', 'The user cannot finalize this private asset.', '{}'::jsonb, correlation_id);
  end if;
  if resource.archived_at is not null then
    perform public._domain_error('RESOURCE_ARCHIVED', 'An archived resource cannot be finalized.', '{}'::jsonb, correlation_id);
  end if;
  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'promotion-assets'
      and object.name = resource.url
  ) then
    perform public._domain_error('ASSET_OBJECT_NOT_FOUND', 'The uploaded asset object was not found.', '{}'::jsonb, correlation_id);
  end if;

  update public.promotion_resource_links item
  set validation_status = 'VALID', validation_message = 'Private storage object confirmed.'
  where item.id = resource.id
  returning * into resource;

  perform public._emit_event(
    'Promotion', resource.promotion_id, 'PrivateAssetFinalized', actor_id, null, correlation_id,
    jsonb_build_object('resourceId', resource.id)
  );
  return to_jsonb(resource);
end;
$$;

create function public.archive_resource_link(resource_id uuid)
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
begin
  select item.* into resource
  from public.promotion_resource_links item
  where item.id = archive_resource_link.resource_id;
  if resource.id is null then
    perform public._domain_error('RESOURCE_NOT_FOUND', 'Resource was not found.', '{}'::jsonb, correlation_id);
  end if;

  select item.* into promotion
  from public.promotions item
  where item.id = resource.promotion_id
  for update;
  if not public.current_user_can_upload_promotion_asset(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'The user cannot archive this resource.', '{}'::jsonb, correlation_id);
  end if;
  if resource.archived_at is not null then
    perform public._domain_error('RESOURCE_ALREADY_ARCHIVED', 'Resource is already archived.', '{}'::jsonb, correlation_id);
  end if;
  if exists (
    select 1 from public.approval_submissions submission where submission.resource_link_id = resource.id
  ) or exists (
    select 1 from public.publications publication where publication.artifact_resource_link_id = resource.id
  ) then
    perform public._domain_error('RESOURCE_IS_EVIDENCE', 'Submitted or published evidence cannot be archived.', '{}'::jsonb, correlation_id);
  end if;

  update public.promotion_resource_links item
  set archived_at = now()
  where item.id = resource.id
  returning * into resource;
  update public.promotions item
  set version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, 'ResourceArchived', actor_id, promotion.version, correlation_id,
    jsonb_build_object('resourceId', resource.id)
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'resource', to_jsonb(resource));
end;
$$;

create function public.submit_for_approval(
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
  if not (
    public._user_has_role(actor_id, 'ADMINISTRATOR')
    or (
      promotion.creator_id = actor_id
      and public._user_has_role(actor_id, 'CREATOR')
    )
  ) then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Creator can submit creative work.', '{}'::jsonb, correlation_id);
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
  if promotion.approver_id is null then
    perform public._domain_error('APPROVER_REQUIRED', 'Assign an Approver before submission.', '{}'::jsonb, correlation_id);
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
      'resourceId', resource.id,
      'approverId', promotion.approver_id
    )
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'submission', to_jsonb(submission));
end;
$$;

create function public.decide_approval(
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
    perform public._domain_error('FORBIDDEN', 'Only the assigned Approver can decide this submission.', '{}'::jsonb, correlation_id);
  end if;
  if submission.submitted_by = actor_id then
    perform public._domain_error('SELF_APPROVAL_FORBIDDEN', 'A user cannot approve their own submission.', '{}'::jsonb, correlation_id);
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

create function public.start_publishing(promotion_id uuid, expected_version integer)
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
    perform public._domain_error('FORBIDDEN', 'Only the assigned Publisher can start publishing.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> start_publishing.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status <> 'PUBLISHER_ASSIGNED' then
    perform public._domain_error(
      'PROMOTION_INVALID_TRANSITION', 'Publishing cannot start from the current state.',
      jsonb_build_object('from', promotion.status, 'to', 'PUBLISHING_IN_PROGRESS'), correlation_id
    );
  end if;
  if not exists (
    select 1
    from public.approval_submissions submission
    join public.approval_decisions decision on decision.approval_submission_id = submission.id
    where submission.promotion_id = promotion.id and decision.decision = 'APPROVED'
  ) then
    perform public._domain_error('APPROVED_CREATIVE_REQUIRED', 'An approved creative submission is required.', '{}'::jsonb, correlation_id);
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

create function public.record_publication(
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
    perform public._domain_error('FORBIDDEN', 'Only the assigned Publisher can record publication.', '{}'::jsonb, correlation_id);
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

create function public.request_publication_verification(
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
  can_verify boolean;
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

  can_verify := public._user_has_role(actor_id, 'ADMINISTRATOR')
    or public.current_user_can_publish_promotion(promotion.id)
    or (
      promotion.sales_owner_id = actor_id
      and public._user_has_role(actor_id, 'SALES')
    );
  if not can_verify then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Publisher, Sales owner, or Administrator can request verification.', '{}'::jsonb, correlation_id);
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

create function public._record_publication_verification(
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

  can_verify := caller_is_service
    or public._user_has_role(actor_id, 'ADMINISTRATOR')
    or public.current_user_can_publish_promotion(promotion.id)
    or (
      promotion.sales_owner_id = actor_id
      and public._user_has_role(actor_id, 'SALES')
    );
  if not can_verify then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Publisher, Sales owner, or Administrator can verify publication.', '{}'::jsonb, correlation_id);
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
  method := upper(coalesce(nullif(input ->> 'verification_method', ''), 'MANUAL'));
  if method not in ('MANUAL', 'PROVIDER_API', 'AUTOMATED_CHECK') then
    perform public._domain_error('VERIFICATION_METHOD_INVALID', 'Verification method is invalid.', '{}'::jsonb, correlation_id);
  end if;
  if method <> 'MANUAL' and not caller_is_service then
    perform public._domain_error('AUTOMATED_VERIFICATION_SERVER_ONLY', 'Automated verification must be recorded server-side.', '{}'::jsonb, correlation_id);
  end if;

  insert into public.publication_verifications (
    publication_id,
    promotion_id,
    status,
    details_json,
    verified_by,
    verification_method
  ) values (
    publication.id,
    promotion.id,
    result_status,
    coalesce(input -> 'details_json', '{}'::jsonb),
    actor_id,
    method
  ) returning * into verification;

  update public.promotions item
  set
    status = case when result_status = 'VERIFIED' then 'VERIFIED'::public.promotion_status else item.status end,
    version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  event_name := case when result_status = 'VERIFIED' then 'PublicationVerified' else 'PublicationVerificationFailed' end;
  perform public._emit_event(
    'Promotion', promotion.id, event_name, actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'publicationId', publication.id,
      'verificationId', verification.id,
      'status', verification.status,
      'method', verification.verification_method
    )
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'verification', to_jsonb(verification));
end;
$$;

create function public.record_publication_verification(
  publication_id uuid,
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
begin
  return public._record_publication_verification(
    record_publication_verification.publication_id,
    record_publication_verification.input,
    record_publication_verification.expected_version,
    actor_id,
    false
  );
end;
$$;

create function public.record_automated_publication_verification(
  publication_id uuid,
  input jsonb,
  expected_version integer
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public._record_publication_verification($1, $2, $3, null, true);
$$;

create function public.complete_verified_workflow(promotion_id uuid, expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  promotion public.promotions%rowtype;
  can_complete boolean;
begin
  select item.* into promotion
  from public.promotions item
  where item.id = complete_verified_workflow.promotion_id
  for update;
  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;
  can_complete := public._user_has_role(actor_id, 'ADMINISTRATOR')
    or public.current_user_can_publish_promotion(promotion.id)
    or (
      promotion.sales_owner_id = actor_id
      and public._user_has_role(actor_id, 'SALES')
    );
  if not can_complete then
    perform public._domain_error('FORBIDDEN', 'The user cannot complete verification.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> complete_verified_workflow.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status <> 'VERIFIED' then
    perform public._domain_error(
      'PROMOTION_INVALID_TRANSITION', 'Only a verified promotion can become ready for invoicing.',
      jsonb_build_object('from', promotion.status, 'to', 'READY_FOR_INVOICING'), correlation_id
    );
  end if;
  if exists (
    select 1
    from public.current_publications current_publication
    where current_publication.promotion_id = promotion.id
      and current_publication.event_type = 'PUBLISHED'
      and not exists (
        select 1
        from public.publication_verifications verification
        where verification.publication_id = current_publication.id
          and verification.status = 'VERIFIED'
          and verification.verified_at = (
            select max(latest.verified_at)
            from public.publication_verifications latest
            where latest.publication_id = current_publication.id
          )
      )
  ) then
    perform public._domain_error('PUBLICATIONS_NOT_FULLY_VERIFIED', 'Every current publication must have a successful latest verification.', '{}'::jsonb, correlation_id);
  end if;

  update public.promotions item
  set status = 'READY_FOR_INVOICING', version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, 'PromotionReadyForInvoicing', actor_id, promotion.version, correlation_id,
    '{}'::jsonb
  );
  return public._promotion_dto(promotion);
end;
$$;

create function public.create_invoice(
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
  invoice public.invoices%rowtype;
  initial_status public.invoice_status;
  amount numeric(12, 2);
  currency_input text;
  currency char(3);
begin
  select item.* into promotion
  from public.promotions item
  where item.id = create_invoice.promotion_id
  for update;
  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_invoice_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'Finance or Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> create_invoice.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status <> 'READY_FOR_INVOICING' then
    perform public._domain_error(
      'PROMOTION_INVALID_TRANSITION', 'The promotion is not ready for invoicing.',
      jsonb_build_object('from', promotion.status, 'to', 'INVOICED'), correlation_id
    );
  end if;

  begin
    amount := (input ->> 'amount')::numeric(12, 2);
  exception when invalid_text_representation or numeric_value_out_of_range then
    perform public._domain_error('INVOICE_AMOUNT_INVALID', 'Invoice amount must be a valid positive number.', '{}'::jsonb, correlation_id);
  end;
  currency_input := upper(btrim(coalesce(input ->> 'currency', '')));
  if amount is null or amount <= 0 then
    perform public._domain_error('INVOICE_AMOUNT_INVALID', 'Invoice amount must be positive.', '{}'::jsonb, correlation_id);
  end if;
  if currency_input !~ '^[A-Z]{3}$' then
    perform public._domain_error('INVOICE_CURRENCY_INVALID', 'Currency must be a three-letter ISO code.', '{}'::jsonb, correlation_id);
  end if;
  currency := currency_input::char(3);
  begin
    initial_status := coalesce(nullif(input ->> 'status', '')::public.invoice_status, 'ISSUED'::public.invoice_status);
  exception when invalid_text_representation then
    perform public._domain_error('INVOICE_STATUS_INVALID', 'Invoice status is invalid.', '{}'::jsonb, correlation_id);
  end;
  if initial_status not in ('DRAFT', 'ISSUED', 'PAID') then
    perform public._domain_error('INVOICE_STATUS_INVALID', 'A new invoice must be Draft, Issued, or Paid.', '{}'::jsonb, correlation_id);
  end if;
  if initial_status in ('ISSUED', 'PAID') and length(btrim(coalesce(input ->> 'invoice_number', ''))) = 0 then
    perform public._domain_error('INVOICE_NUMBER_REQUIRED', 'Issued invoices require an invoice number.', '{}'::jsonb, correlation_id);
  end if;

  insert into public.invoices (
    promotion_id,
    client_id,
    invoice_number,
    external_invoice_id,
    amount,
    currency,
    status,
    issued_at,
    paid_at,
    created_by
  ) values (
    promotion.id,
    promotion.client_id,
    nullif(btrim(input ->> 'invoice_number'), ''),
    nullif(btrim(input ->> 'external_invoice_id'), ''),
    amount,
    currency,
    initial_status,
    case when initial_status in ('ISSUED', 'PAID') then coalesce(nullif(input ->> 'issued_at', '')::timestamptz, now()) end,
    case when initial_status = 'PAID' then coalesce(nullif(input ->> 'paid_at', '')::timestamptz, now()) end,
    actor_id
  ) returning * into invoice;

  update public.promotions item
  set status = 'INVOICED', version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, 'InvoiceCreated', actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'invoiceId', invoice.id,
      'invoiceNumber', invoice.invoice_number,
      'amount', invoice.amount,
      'currency', btrim(invoice.currency::text),
      'status', invoice.status
    )
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'invoice', to_jsonb(invoice));
end;
$$;

create function public.set_invoice_status(
  invoice_id uuid,
  status public.invoice_status,
  invoice_number text default null,
  expected_version integer default null
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
  invoice public.invoices%rowtype;
  event_name text;
  resolved_invoice_number text;
begin
  select item.* into invoice
  from public.invoices item
  where item.id = set_invoice_status.invoice_id
  for update;
  if invoice.id is null then
    perform public._domain_error('INVOICE_NOT_FOUND', 'Invoice was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not (
    public._user_has_role(actor_id, 'FINANCE')
    or public._user_has_role(actor_id, 'ADMINISTRATOR')
  ) then
    perform public._domain_error('FORBIDDEN', 'Finance or Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  if invoice.status = set_invoice_status.status then
    perform public._domain_error('INVOICE_STATUS_UNCHANGED', 'Invoice already has the requested status.', '{}'::jsonb, correlation_id);
  end if;
  if not (
    (invoice.status = 'DRAFT' and set_invoice_status.status in ('ISSUED', 'VOID', 'FAILED'))
    or (invoice.status = 'ISSUED' and set_invoice_status.status in ('PAID', 'VOID', 'FAILED'))
    or (invoice.status = 'FAILED' and set_invoice_status.status in ('DRAFT', 'VOID'))
  ) then
    perform public._domain_error(
      'INVOICE_INVALID_TRANSITION', 'Invoice status transition is not allowed.',
      jsonb_build_object('from', invoice.status, 'to', set_invoice_status.status), correlation_id
    );
  end if;
  resolved_invoice_number := coalesce(
    nullif(btrim(set_invoice_status.invoice_number), ''),
    invoice.invoice_number
  );
  if set_invoice_status.status = 'ISSUED'
    and length(btrim(coalesce(resolved_invoice_number, ''))) = 0
  then
    perform public._domain_error('INVOICE_NUMBER_REQUIRED', 'Issued invoices require an invoice number.', '{}'::jsonb, correlation_id);
  end if;

  select item.* into promotion
  from public.promotions item
  where item.id = invoice.promotion_id
  for update;
  if set_invoice_status.expected_version is not null
    and promotion.version <> set_invoice_status.expected_version
  then
    perform public._domain_error(
      'PROMOTION_VERSION_CONFLICT',
      'The promotion was changed by another user.',
      '{}'::jsonb,
      correlation_id
    );
  end if;

  update public.invoices item
  set
    status = set_invoice_status.status,
    invoice_number = case
      when set_invoice_status.status = 'ISSUED' then resolved_invoice_number
      else item.invoice_number
    end,
    issued_at = case when set_invoice_status.status = 'ISSUED' then coalesce(item.issued_at, now()) else item.issued_at end,
    paid_at = case when set_invoice_status.status = 'PAID' then coalesce(item.paid_at, now()) else item.paid_at end
  where item.id = invoice.id
  returning * into invoice;

  update public.promotions item
  set
    status = case
      when invoice.status in ('VOID', 'FAILED')
        then 'READY_FOR_INVOICING'::public.promotion_status
      else 'INVOICED'::public.promotion_status
    end,
    version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  event_name := case invoice.status
    when 'ISSUED' then 'InvoiceIssued'
    when 'PAID' then 'InvoicePaid'
    when 'VOID' then 'InvoiceVoided'
    when 'FAILED' then 'InvoiceFailed'
    when 'DRAFT' then 'InvoiceReturnedToDraft'
  end;
  perform public._emit_event(
    'Promotion', promotion.id, event_name, actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'invoiceId', invoice.id,
      'invoiceNumber', invoice.invoice_number,
      'status', invoice.status
    )
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'invoice', to_jsonb(invoice));
end;
$$;

create function public.mark_notification_read(notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  notification public.notifications%rowtype;
begin
  update public.notifications item
  set read_at = coalesce(item.read_at, now())
  where item.id = mark_notification_read.notification_id
    and item.user_id = actor_id
  returning * into notification;
  if notification.id is null then
    perform public._domain_error('NOTIFICATION_NOT_FOUND', 'Notification was not found.');
  end if;
  return to_jsonb(notification);
end;
$$;

create function public.claim_outbox_events(worker_id text, batch_size integer)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(btrim(coalesce(claim_outbox_events.worker_id, ''))) = 0 then
    perform public._domain_error('WORKER_ID_REQUIRED', 'Worker ID is required.');
  end if;
  if claim_outbox_events.batch_size < 1 or claim_outbox_events.batch_size > 100 then
    perform public._domain_error('BATCH_SIZE_INVALID', 'Batch size must be between 1 and 100.');
  end if;

  update public.outbox_events event
  set
    status = 'DEAD_LETTER',
    locked_at = null,
    locked_by = null,
    last_error = 'STALE_WORKER_EXHAUSTED'
  where event.status = 'PROCESSING'
    and event.attempt_count >= 5
    and event.locked_at < now() - interval '15 minutes';

  return query
  with candidates as (
    select event.id
    from public.outbox_events event
    where (
      event.status in ('PENDING', 'FAILED')
      or (event.status = 'PROCESSING' and event.locked_at < now() - interval '15 minutes')
    )
      and event.available_at <= now()
      and event.attempt_count < 5
    order by event.available_at, event.created_at
    for update skip locked
    limit claim_outbox_events.batch_size
  )
  update public.outbox_events event
  set
    status = 'PROCESSING',
    attempt_count = event.attempt_count + 1,
    locked_at = now(),
    locked_by = claim_outbox_events.worker_id,
    last_error = null
  from candidates
  where event.id = candidates.id
  returning event.*;
end;
$$;

create function public.complete_outbox_event(event_id uuid, worker_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.outbox_events event
  set
    status = 'PROCESSED',
    processed_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null
  where event.id = complete_outbox_event.event_id
    and event.status = 'PROCESSING'
    and event.locked_by = complete_outbox_event.worker_id;
  if not found then
    perform public._domain_error('OUTBOX_LOCK_MISMATCH', 'Outbox event is not locked by this worker.');
  end if;
end;
$$;

create function public.fail_outbox_event(event_id uuid, worker_id text, error_code text)
returns public.outbox_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  resulting_status public.outbox_status;
begin
  update public.outbox_events event
  set
    status = case when event.attempt_count >= 5 then 'DEAD_LETTER'::public.outbox_status else 'FAILED'::public.outbox_status end,
    available_at = case
      when event.attempt_count >= 5 then event.available_at
      else now() + make_interval(secs => least(900, power(2, event.attempt_count)::integer * 5))
    end,
    locked_at = null,
    locked_by = null,
    last_error = left(coalesce(fail_outbox_event.error_code, 'PROVIDER_ERROR'), 500)
  where event.id = fail_outbox_event.event_id
    and event.status = 'PROCESSING'
    and event.locked_by = fail_outbox_event.worker_id
  returning event.status into resulting_status;
  if resulting_status is null then
    perform public._domain_error('OUTBOX_LOCK_MISMATCH', 'Outbox event is not locked by this worker.');
  end if;
  return resulting_status;
end;
$$;

create function public.retry_outbox_event(event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  event public.outbox_events%rowtype;
begin
  if not public._user_has_role(actor_id, 'ADMINISTRATOR') then
    perform public._domain_error('FORBIDDEN', 'Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  update public.outbox_events item
  set
    status = 'PENDING',
    attempt_count = 0,
    available_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null,
    processed_at = null
  where item.id = retry_outbox_event.event_id
    and item.status in ('FAILED', 'DEAD_LETTER')
  returning * into event;
  if event.id is null then
    perform public._domain_error('OUTBOX_EVENT_NOT_RETRYABLE', 'Outbox event is not failed or dead-lettered.', '{}'::jsonb, correlation_id);
  end if;
  insert into public.audit_log (
    aggregate_type, aggregate_id, event_type, actor_id, correlation_id, metadata_json
  ) values (
    'OutboxEvent', event.id, 'OutboxEventRetried', actor_id, correlation_id,
    jsonb_build_object('eventType', event.event_type)
  );
  return to_jsonb(event);
end;
$$;
