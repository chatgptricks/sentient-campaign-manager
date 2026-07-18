create function public._domain_error(
  error_code text,
  error_message text,
  error_details jsonb default '{}'::jsonb,
  correlation_id uuid default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = error_code,
    detail = jsonb_build_object(
      'message', error_message,
      'details', coalesce(error_details, '{}'::jsonb),
      'correlationId', correlation_id
    )::text;
end;
$$;

create function public._user_has_role(user_id uuid, role_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.user_roles user_role on user_role.user_id = profile.id
    join public.roles role on role.id = user_role.role_id
    where profile.id = $1
      and profile.status = 'ACTIVE'
      and role.code = upper($2)
  );
$$;

create function public._user_has_any_role(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.user_roles user_role on user_role.user_id = profile.id
    where profile.id = $1
      and profile.status = 'ACTIVE'
  );
$$;

create function public._require_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_status public.profile_status;
begin
  if actor_id is null then
    perform public._domain_error('AUTH_REQUIRED', 'An authenticated user is required.');
  end if;

  select profile.status into actor_status
  from public.profiles profile
  where profile.id = actor_id;

  if actor_status is null then
    perform public._domain_error('PROFILE_NOT_FOUND', 'The authenticated user has no profile.');
  elsif actor_status <> 'ACTIVE' then
    perform public._domain_error('USER_INACTIVE', 'The authenticated user is not active.');
  end if;

  return actor_id;
end;
$$;

create function public.current_user_has_role(role_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._user_has_role(auth.uid(), $1);
$$;

create function public.current_user_has_any_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._user_has_any_role(auth.uid());
$$;

create function public.current_user_can_view_promotion(promotion_id uuid)
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
        or promotion.approver_id = auth.uid()
        or promotion.publisher_id = auth.uid()
        or (
          public._user_has_role(auth.uid(), 'FINANCE')
          and promotion.status in ('READY_FOR_INVOICING', 'INVOICED')
        )
      )
  );
$$;

create function public.current_user_can_manage_promotion(promotion_id uuid)
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

create function public.current_user_can_approve_promotion(promotion_id uuid)
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
          promotion.approver_id = auth.uid()
          and public._user_has_role(auth.uid(), 'APPROVER')
        )
      )
  );
$$;

create function public.current_user_can_publish_promotion(promotion_id uuid)
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
          promotion.publisher_id = auth.uid()
          and public._user_has_role(auth.uid(), 'PUBLISHER')
        )
      )
  );
$$;

create function public.current_user_can_invoice_promotion(promotion_id uuid)
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
        or public._user_has_role(auth.uid(), 'FINANCE')
      )
  );
$$;

create function public.current_user_can_upload_promotion_asset(promotion_id uuid)
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
          and promotion.status in (
            'CREATOR_ASSIGNED', 'CREATIVE_IN_PROGRESS', 'REVISION_REQUESTED'
          )
        )
      )
  );
$$;

create function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create function public._emit_event(
  aggregate_type text,
  aggregate_id uuid,
  event_type text,
  actor_id uuid,
  aggregate_version integer,
  correlation_id uuid,
  payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid := extensions.gen_random_uuid();
  occurred_at timestamptz := clock_timestamp();
  safe_payload jsonb := coalesce(payload, '{}'::jsonb);
begin
  insert into public.audit_log (
    aggregate_type,
    aggregate_id,
    event_type,
    actor_id,
    correlation_id,
    aggregate_version,
    metadata_json,
    created_at
  ) values (
    _emit_event.aggregate_type,
    _emit_event.aggregate_id,
    _emit_event.event_type,
    _emit_event.actor_id,
    _emit_event.correlation_id,
    _emit_event.aggregate_version,
    safe_payload,
    occurred_at
  );

  insert into public.outbox_events (
    id,
    aggregate_type,
    aggregate_id,
    event_type,
    payload_json,
    available_at,
    created_at
  ) values (
    event_id,
    _emit_event.aggregate_type,
    _emit_event.aggregate_id,
    _emit_event.event_type,
    safe_payload || jsonb_build_object(
      'eventId', event_id,
      'eventType', _emit_event.event_type,
      'aggregateId', _emit_event.aggregate_id,
      'aggregateVersion', _emit_event.aggregate_version,
      'occurredAt', occurred_at,
      'actorId', _emit_event.actor_id,
      'correlationId', _emit_event.correlation_id,
      'payload', safe_payload
    ),
    occurred_at,
    occurred_at
  );

  return event_id;
end;
$$;

create function public.get_promotion_allowed_actions(promotion_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  promotion public.promotions%rowtype;
  actions text[] := array[]::text[];
  actor_is_admin boolean;
  can_manage boolean;
  can_create boolean;
  can_approve boolean;
  can_publish boolean;
  can_verify boolean;
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
  can_create := actor_is_admin or (
    promotion.creator_id = actor_id and public._user_has_role(actor_id, 'CREATOR')
  );
  can_approve := public.current_user_can_approve_promotion(promotion.id);
  can_publish := public.current_user_can_publish_promotion(promotion.id);
  can_verify := actor_is_admin
    or can_publish
    or (
      promotion.sales_owner_id = actor_id
      and public._user_has_role(actor_id, 'SALES')
    );

  if can_manage and promotion.status in ('DRAFT', 'CREATOR_ASSIGNED') then
    actions := array_append(actions, 'UPDATE_PROMOTION');
  end if;
  if can_manage and promotion.status not in ('CANCELLED', 'INVOICED') then
    actions := array_append(actions, 'CANCEL_PROMOTION');
  end if;
  if can_manage and promotion.status in (
    'DRAFT', 'CREATOR_ASSIGNED', 'CREATIVE_IN_PROGRESS', 'REVISION_REQUESTED'
  ) then
    actions := array_append(actions, 'ASSIGN_CREATOR');
  end if;
  if can_manage and promotion.status in (
    'DRAFT', 'CREATOR_ASSIGNED', 'CREATIVE_IN_PROGRESS', 'REVISION_REQUESTED'
  ) then
    actions := array_append(actions, 'ASSIGN_APPROVER');
  end if;
  if can_manage and promotion.status in ('APPROVED', 'PUBLISHER_ASSIGNED') then
    actions := array_append(actions, 'ASSIGN_PUBLISHER');
  end if;
  if can_manage and promotion.status not in ('CANCELLED', 'INVOICED') then
    actions := array_append(actions, 'ASSIGN_SALES_OWNER');
  end if;
  if public.current_user_can_upload_promotion_asset(promotion.id) then
    actions := array_append(actions, 'ATTACH_RESOURCE');
  end if;
  if (actor_is_admin or can_create) and promotion.status in ('CREATOR_ASSIGNED', 'REVISION_REQUESTED') then
    actions := array_append(actions, 'START_CREATIVE_WORK');
  end if;
  if (actor_is_admin or can_create)
    and promotion.status = 'CREATIVE_IN_PROGRESS'
    and promotion.approver_id is not null
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

    if can_approve
      and latest_submission.id is not null
      and latest_submission.submitted_by <> actor_id
      and not exists (
        select 1 from public.approval_decisions decision
        where decision.approval_submission_id = latest_submission.id
      )
    then
      actions := array_append(actions, 'DECIDE_APPROVAL');
    end if;
  end if;

  if can_publish and promotion.status = 'PUBLISHER_ASSIGNED' then
    actions := array_append(actions, 'START_PUBLISHING');
  end if;
  if can_publish and promotion.status = 'PUBLISHING_IN_PROGRESS' then
    actions := array_append(actions, 'RECORD_PUBLICATION');
  end if;
  if can_verify and promotion.status = 'PUBLISHED' then
    actions := array_append(actions, 'REQUEST_PUBLICATION_VERIFICATION');
  end if;
  if can_verify and promotion.status = 'VERIFICATION_PENDING' then
    actions := array_append(actions, 'RECORD_PUBLICATION_VERIFICATION');
  end if;
  if can_verify and promotion.status = 'VERIFIED' then
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

create function public._promotion_dto(promotion public.promotions)
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

create function public.get_operations_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
begin
  if not public._user_has_role(actor_id, 'ADMINISTRATOR') then
    perform public._domain_error('FORBIDDEN', 'Administrator role is required.');
  end if;

  return jsonb_build_object(
    'outbox', (
      select jsonb_build_object(
        'pending', count(*) filter (where event.status = 'PENDING'),
        'processing', count(*) filter (where event.status = 'PROCESSING'),
        'failed', count(*) filter (where event.status = 'FAILED'),
        'deadLetter', count(*) filter (where event.status = 'DEAD_LETTER'),
        'stuckProcessing', count(*) filter (
          where event.status = 'PROCESSING'
            and event.locked_at < now() - interval '15 minutes'
        ),
        'oldestPendingAt', min(event.created_at) filter (
          where event.status in ('PENDING', 'FAILED')
        )
      )
      from public.outbox_events event
    ),
    'inbox', (
      select jsonb_build_object(
        'received', count(*) filter (where event.status = 'RECEIVED'),
        'processing', count(*) filter (where event.status = 'PROCESSING'),
        'failed', count(*) filter (where event.status = 'FAILED')
      )
      from public.inbox_events event
    ),
    'connections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', connection.id,
          'provider', connection.provider,
          'status', connection.status,
          'configured', connection.secret_reference is not null
            or connection.status <> 'NOT_CONFIGURED',
          'mode', coalesce(connection.configuration_json ->> 'mode', 'AUTOMATED'),
          'lastTestedAt', connection.last_tested_at,
          'updatedAt', connection.updated_at
        ) order by connection.provider
      )
      from public.integration_connections connection
    ), '[]'::jsonb),
    'failedJobs', coalesce((
      select jsonb_agg(to_jsonb(failed_job) order by failed_job.created_at desc)
      from (
        select
          event.id,
          event.aggregate_type as "aggregateType",
          event.aggregate_id as "aggregateId",
          event.event_type as "eventType",
          event.status,
          event.attempt_count as "attemptCount",
          left(event.last_error, 120) as "errorCode",
          event.available_at as "availableAt",
          event.created_at
        from public.outbox_events event
        where event.status in ('FAILED', 'DEAD_LETTER')
        order by event.created_at desc
        limit 25
      ) failed_job
    ), '[]'::jsonb),
    'recentIntegrationFailures', coalesce((
      select jsonb_agg(to_jsonb(failed_attempt) order by failed_attempt.created_at desc)
      from (
        select
          attempt.id,
          attempt.provider,
          attempt.operation,
          attempt.aggregate_id as "aggregateId",
          attempt.status,
          attempt.error_code as "errorCode",
          attempt.created_at
        from public.integration_attempts attempt
        where attempt.status = 'FAILED'
        order by attempt.created_at desc
        limit 25
      ) failed_attempt
    ), '[]'::jsonb),
    'generatedAt', now()
  );
end;
$$;

create function public.create_client(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  client public.clients%rowtype;
begin
  if not (
    public._user_has_role(actor_id, 'SALES')
    or public._user_has_role(actor_id, 'ADMINISTRATOR')
  ) then
    perform public._domain_error('FORBIDDEN', 'Sales or Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  if length(btrim(coalesce(input ->> 'name', ''))) = 0 then
    perform public._domain_error('CLIENT_NAME_REQUIRED', 'Client name is required.', '{}'::jsonb, correlation_id);
  end if;

  insert into public.clients (name, billing_email, billing_address, external_accounting_id, created_by)
  values (
    btrim(input ->> 'name'),
    nullif(btrim(input ->> 'billing_email'), ''),
    nullif(btrim(input ->> 'billing_address'), ''),
    nullif(btrim(input ->> 'external_accounting_id'), ''),
    actor_id
  ) returning * into client;

  perform public._emit_event(
    'Client', client.id, 'ClientCreated', actor_id, null, correlation_id,
    jsonb_build_object('name', client.name)
  );
  return to_jsonb(client);
end;
$$;

create function public.update_client(client_id uuid, input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  client public.clients%rowtype;
begin
  if not (
    public._user_has_role(actor_id, 'SALES')
    or public._user_has_role(actor_id, 'ADMINISTRATOR')
  ) then
    perform public._domain_error('FORBIDDEN', 'Sales or Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;

  select item.* into client
  from public.clients item
  where item.id = update_client.client_id
  for update;
  if client.id is null then
    perform public._domain_error('CLIENT_NOT_FOUND', 'Client was not found.', '{}'::jsonb, correlation_id);
  end if;
  if client.archived_at is not null then
    perform public._domain_error('CLIENT_ARCHIVED', 'Archived clients cannot be edited.', '{}'::jsonb, correlation_id);
  end if;

  update public.clients item
  set
    name = case when input ? 'name' then btrim(input ->> 'name') else item.name end,
    billing_email = case when input ? 'billing_email' then nullif(btrim(input ->> 'billing_email'), '') else item.billing_email end,
    billing_address = case when input ? 'billing_address' then nullif(btrim(input ->> 'billing_address'), '') else item.billing_address end,
    external_accounting_id = case when input ? 'external_accounting_id' then nullif(btrim(input ->> 'external_accounting_id'), '') else item.external_accounting_id end
  where item.id = update_client.client_id
  returning * into client;

  if length(btrim(client.name)) = 0 then
    perform public._domain_error('CLIENT_NAME_REQUIRED', 'Client name is required.', '{}'::jsonb, correlation_id);
  end if;

  perform public._emit_event('Client', client.id, 'ClientUpdated', actor_id, null, correlation_id, '{}'::jsonb);
  return to_jsonb(client);
end;
$$;

create function public.archive_client(client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  client public.clients%rowtype;
begin
  if not (
    public._user_has_role(actor_id, 'SALES')
    or public._user_has_role(actor_id, 'ADMINISTRATOR')
  ) then
    perform public._domain_error('FORBIDDEN', 'Sales or Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;

  update public.clients item
  set archived_at = coalesce(item.archived_at, now())
  where item.id = archive_client.client_id
  returning * into client;
  if client.id is null then
    perform public._domain_error('CLIENT_NOT_FOUND', 'Client was not found.', '{}'::jsonb, correlation_id);
  end if;

  perform public._emit_event('Client', client.id, 'ClientArchived', actor_id, null, correlation_id, '{}'::jsonb);
  return to_jsonb(client);
end;
$$;

create function public.set_profile_status(profile_id uuid, status public.profile_status)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  profile public.profiles%rowtype;
begin
  if not public._user_has_role(actor_id, 'ADMINISTRATOR') then
    perform public._domain_error('FORBIDDEN', 'Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sentient-active-administrator-invariant', 0)
  );
  select item.* into profile
  from public.profiles item
  where item.id = set_profile_status.profile_id
  for update;
  if profile.id is null then
    perform public._domain_error('PROFILE_NOT_FOUND', 'Profile was not found.', '{}'::jsonb, correlation_id);
  end if;
  if profile_id = actor_id and status <> 'ACTIVE' then
    perform public._domain_error('CANNOT_DEACTIVATE_SELF', 'Administrators cannot deactivate their own account.', '{}'::jsonb, correlation_id);
  end if;
  if profile.status = 'ACTIVE'
    and status <> 'ACTIVE'
    and public._user_has_role(profile.id, 'ADMINISTRATOR')
    and (
      select count(*)
      from public.user_roles user_role
      join public.roles role on role.id = user_role.role_id and role.code = 'ADMINISTRATOR'
      join public.profiles administrator on administrator.id = user_role.user_id
      where administrator.status = 'ACTIVE'
    ) <= 1
  then
    perform public._domain_error('LAST_ADMINISTRATOR_REQUIRED', 'At least one active Administrator is required.', '{}'::jsonb, correlation_id);
  end if;

  update public.profiles item
  set status = set_profile_status.status
  where item.id = set_profile_status.profile_id
  returning * into profile;

  perform public._emit_event(
    'Profile', profile.id, 'ProfileStatusChanged', actor_id, null, correlation_id,
    jsonb_build_object('status', profile.status)
  );
  return to_jsonb(profile);
end;
$$;

create function public.grant_user_role(user_id uuid, role_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  role public.roles%rowtype;
begin
  if not public._user_has_role(actor_id, 'ADMINISTRATOR') then
    perform public._domain_error('FORBIDDEN', 'Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = grant_user_role.user_id) then
    perform public._domain_error('PROFILE_NOT_FOUND', 'Profile was not found.', '{}'::jsonb, correlation_id);
  end if;
  select item.* into role from public.roles item where item.code = upper(grant_user_role.role_code);
  if role.id is null then
    perform public._domain_error('ROLE_NOT_FOUND', 'Role was not found.', '{}'::jsonb, correlation_id);
  end if;

  insert into public.user_roles (user_id, role_id, granted_by)
  values (grant_user_role.user_id, role.id, actor_id)
  on conflict (user_id, role_id) do nothing;

  perform public._emit_event(
    'Profile', grant_user_role.user_id, 'UserRoleGranted', actor_id, null, correlation_id,
    jsonb_build_object('role', role.code)
  );
  return jsonb_build_object('user_id', grant_user_role.user_id, 'role', role.code);
end;
$$;

create function public.revoke_user_role(user_id uuid, role_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  role public.roles%rowtype;
begin
  if not public._user_has_role(actor_id, 'ADMINISTRATOR') then
    perform public._domain_error('FORBIDDEN', 'Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sentient-active-administrator-invariant', 0)
  );
  select item.* into role from public.roles item where item.code = upper(revoke_user_role.role_code);
  if role.id is null then
    perform public._domain_error('ROLE_NOT_FOUND', 'Role was not found.', '{}'::jsonb, correlation_id);
  end if;
  if revoke_user_role.user_id = actor_id and role.code = 'ADMINISTRATOR' then
    perform public._domain_error('CANNOT_REMOVE_OWN_ADMIN_ROLE', 'Administrators cannot remove their own Administrator role.', '{}'::jsonb, correlation_id);
  end if;
  if role.code = 'ADMINISTRATOR'
    and exists (
      select 1 from public.profiles profile
      where profile.id = revoke_user_role.user_id and profile.status = 'ACTIVE'
    )
    and (
      select count(*)
      from public.user_roles user_role
      join public.roles administrator_role
        on administrator_role.id = user_role.role_id
       and administrator_role.code = 'ADMINISTRATOR'
      join public.profiles administrator on administrator.id = user_role.user_id
      where administrator.status = 'ACTIVE'
    ) <= 1
  then
    perform public._domain_error('LAST_ADMINISTRATOR_REQUIRED', 'At least one active Administrator is required.', '{}'::jsonb, correlation_id);
  end if;

  delete from public.user_roles item
  where item.user_id = revoke_user_role.user_id and item.role_id = role.id;
  if not found then
    perform public._domain_error('USER_ROLE_NOT_FOUND', 'The user does not have that role.', '{}'::jsonb, correlation_id);
  end if;

  perform public._emit_event(
    'Profile', revoke_user_role.user_id, 'UserRoleRevoked', actor_id, null, correlation_id,
    jsonb_build_object('role', role.code)
  );
  return jsonb_build_object('user_id', revoke_user_role.user_id, 'role', role.code);
end;
$$;

create function public.replace_user_roles(profile_id uuid, role_codes text[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  normalized_codes text[];
  unknown_codes text[];
begin
  if not public._user_has_role(actor_id, 'ADMINISTRATOR') then
    perform public._domain_error('FORBIDDEN', 'Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sentient-active-administrator-invariant', 0)
  );
  if not exists (select 1 from public.profiles profile where profile.id = replace_user_roles.profile_id) then
    perform public._domain_error('PROFILE_NOT_FOUND', 'Profile was not found.', '{}'::jsonb, correlation_id);
  end if;

  select coalesce(array_agg(distinct upper(btrim(code)) order by upper(btrim(code))), array[]::text[])
  into normalized_codes
  from unnest(coalesce(replace_user_roles.role_codes, array[]::text[])) as code
  where length(btrim(code)) > 0;

  select coalesce(array_agg(code order by code), array[]::text[])
  into unknown_codes
  from unnest(normalized_codes) as code
  where not exists (select 1 from public.roles role where role.code = code);
  if cardinality(unknown_codes) > 0 then
    perform public._domain_error(
      'ROLE_NOT_FOUND', 'One or more role codes are invalid.',
      jsonb_build_object('unknownRoles', unknown_codes), correlation_id
    );
  end if;
  if replace_user_roles.profile_id = actor_id and not ('ADMINISTRATOR' = any(normalized_codes)) then
    perform public._domain_error('CANNOT_REMOVE_OWN_ADMIN_ROLE', 'Administrators cannot remove their own Administrator role.', '{}'::jsonb, correlation_id);
  end if;
  if not ('ADMINISTRATOR' = any(normalized_codes))
    and exists (
      select 1
      from public.user_roles user_role
      join public.roles role on role.id = user_role.role_id and role.code = 'ADMINISTRATOR'
      join public.profiles profile on profile.id = user_role.user_id and profile.status = 'ACTIVE'
      where user_role.user_id = replace_user_roles.profile_id
    )
    and (
      select count(*)
      from public.user_roles user_role
      join public.roles role on role.id = user_role.role_id and role.code = 'ADMINISTRATOR'
      join public.profiles administrator on administrator.id = user_role.user_id
      where administrator.status = 'ACTIVE'
    ) <= 1
  then
    perform public._domain_error('LAST_ADMINISTRATOR_REQUIRED', 'At least one active Administrator is required.', '{}'::jsonb, correlation_id);
  end if;

  delete from public.user_roles user_role
  using public.roles role
  where user_role.user_id = replace_user_roles.profile_id
    and role.id = user_role.role_id
    and not (role.code = any(normalized_codes));

  insert into public.user_roles (user_id, role_id, granted_by)
  select replace_user_roles.profile_id, role.id, actor_id
  from public.roles role
  where role.code = any(normalized_codes)
  on conflict (user_id, role_id) do nothing;

  perform public._emit_event(
    'Profile', replace_user_roles.profile_id, 'UserRolesReplaced', actor_id, null, correlation_id,
    jsonb_build_object('roles', to_jsonb(normalized_codes))
  );
  return jsonb_build_object('user_id', replace_user_roles.profile_id, 'roles', to_jsonb(normalized_codes));
end;
$$;
