-- Accept any http or https link in every link field, with no provider or domain check.
-- This drops the HTTPS-only enforcement from the table constraints and the write-path
-- RPCs. Links are still required to parse and use the http/https scheme (the application
-- and edge layers reject javascript:/data: and other unsafe schemes before this point).

-- 1. Relax the HTTPS-only CHECK constraints. The constraints on publications,
-- publishing_accounts, and campaign_metadata were declared inline and carry
-- auto-generated names, so drop them by definition rather than by a hard-coded name.
do $$
declare
  con record;
begin
  for con in
    select c.conname, t.relname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and c.contype = 'c'
      and t.relname in (
        'promotion_resource_links', 'publications', 'publishing_accounts', 'campaign_metadata'
      )
      and pg_get_constraintdef(c.oid) ilike '%https://%'
  loop
    execute format('alter table public.%I drop constraint %I', con.relname, con.conname);
  end loop;
end $$;

alter table public.promotion_resource_links
  add constraint promotion_resource_links_external_link check (
    provider = 'SUPABASE_STORAGE' or url ~* '^https?://[^[:space:]]+$'
  );

alter table public.publications
  add constraint publications_publication_url_link check (
    publication_url ~* '^https?://[^[:space:]]+$'
  );

alter table public.publishing_accounts
  add constraint publishing_accounts_account_url_link check (
    account_url ~* '^https?://[^[:space:]]+$'
  );

alter table public.campaign_metadata
  add constraint campaign_metadata_brief_url_link check (
    brief_url is null or brief_url ~* '^https?://[^[:space:]]+$'
  );

-- 2. Relax the same rule inside the write-path RPCs.
create or replace function public.attach_resource_link(promotion_id uuid, input jsonb)
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
  initial_status public.resource_validation_status;
  initial_message text;
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
  if provider <> 'SUPABASE_STORAGE' and (input ->> 'url') !~* '^https?://[^[:space:]]+$' then
    perform public._domain_error('RESOURCE_URL_INVALID', 'External resource URL must be a valid http or https link.', '{}'::jsonb, correlation_id);
  end if;
  if provider = 'SUPABASE_STORAGE'
    and (input ->> 'url') not like promotion.id::text || '/' || resource_id::text || '/%'
  then
    perform public._domain_error(
      'STORAGE_PATH_INVALID', 'Storage resource path must use promotion/resource UUID prefixes.',
      jsonb_build_object('requiredPrefix', promotion.id::text || '/' || resource_id::text || '/'), correlation_id
    );
  end if;

  initial_status := case
    when provider = 'SUPABASE_STORAGE' then 'PENDING'::public.resource_validation_status
    else 'VALID'::public.resource_validation_status
  end;
  initial_message := case
    when provider = 'SUPABASE_STORAGE' then null
    else 'External creative link is ready for workflow submission.'
  end;

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
    validation_message,
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
    initial_status,
    initial_message,
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

create or replace function public.upsert_campaign_metadata(promotion_id uuid, input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  metadata public.campaign_metadata;
begin
  if not public.current_user_can_manage_promotion(upsert_campaign_metadata.promotion_id) then
    perform public._domain_error('FORBIDDEN', 'The user cannot manage this promotion metadata.', '{}'::jsonb, extensions.gen_random_uuid());
  end if;
  if input ? 'brief_url' and nullif(input ->> 'brief_url', '') is not null
    and (input ->> 'brief_url') !~* '^https?://[^[:space:]]+$' then
    perform public._domain_error('INVALID_BRIEF_URL', 'Brief links must be a valid http or https link.', '{}'::jsonb, extensions.gen_random_uuid());
  end if;

  insert into public.campaign_metadata (
    promotion_id,
    campaign_type,
    scheduled_date,
    priority,
    brief_url,
    client_material_links,
    external_resource_links,
    platforms,
    publishing_account_ids,
    external_partner_account_ids,
    internal_notes
  ) values (
    upsert_campaign_metadata.promotion_id,
    coalesce(nullif(btrim(input ->> 'campaign_type'), ''), 'Social promotion'),
    case when nullif(input ->> 'scheduled_date', '') is null then null else (input ->> 'scheduled_date')::date end,
    coalesce(nullif(input ->> 'priority', ''), 'NORMAL'),
    nullif(btrim(input ->> 'brief_url'), ''),
    case when jsonb_typeof(input -> 'client_material_links') = 'array' then input -> 'client_material_links' else '[]'::jsonb end,
    case when jsonb_typeof(input -> 'external_resource_links') = 'array' then input -> 'external_resource_links' else '[]'::jsonb end,
    coalesce(array(select jsonb_array_elements_text(input -> 'platforms')), '{}'::text[]),
    coalesce(array(select (jsonb_array_elements_text(input -> 'publishing_account_ids'))::uuid), '{}'::uuid[]),
    coalesce(array(select (jsonb_array_elements_text(input -> 'external_partner_account_ids'))::uuid), '{}'::uuid[]),
    nullif(btrim(input ->> 'internal_notes'), '')
  )
  on conflict on constraint campaign_metadata_pkey do update set
    campaign_type = excluded.campaign_type,
    scheduled_date = excluded.scheduled_date,
    priority = excluded.priority,
    brief_url = excluded.brief_url,
    client_material_links = excluded.client_material_links,
    external_resource_links = excluded.external_resource_links,
    platforms = excluded.platforms,
    publishing_account_ids = excluded.publishing_account_ids,
    external_partner_account_ids = excluded.external_partner_account_ids,
    internal_notes = excluded.internal_notes
  returning * into metadata;

  perform public._emit_event(
    'Promotion', metadata.promotion_id, 'PromotionMetadataUpdated', actor_id, null,
    extensions.gen_random_uuid(), jsonb_build_object('promotionType', metadata.campaign_type, 'priority', metadata.priority)
  );
  return to_jsonb(metadata);
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
  if coalesce(input ->> 'publication_url', '') !~* '^https?://[^[:space:]]+$' then
    perform public._domain_error('PUBLICATION_URL_INVALID', 'Publication URL must be a valid http or https link.', '{}'::jsonb, correlation_id);
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
