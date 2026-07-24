alter table public.promotion_channel_sheet_items
  add column if not exists display_name text,
  add column if not exists headers jsonb not null default '[]'::jsonb check (jsonb_typeof(headers) = 'array'),
  add column if not exists row_values jsonb not null default '[]'::jsonb check (jsonb_typeof(row_values) = 'array');

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
    where con.conrelid = 'public.promotion_channel_sheet_items'::regclass
      and con.contype = 'c'
      and att.attname in ('platform', 'account_name', 'handle', 'account_url')
  loop
    execute format('alter table public.promotion_channel_sheet_items drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.promotion_channel_sheet_items
  alter column platform drop not null,
  alter column account_name drop not null,
  alter column handle drop not null,
  alter column account_url drop not null;

alter table public.promotion_channel_sheet_items
  add constraint promotion_channel_sheet_items_platform_optional
    check (platform is null or platform in ('INSTAGRAM', 'X', 'LINKEDIN')),
  add constraint promotion_channel_sheet_items_account_url_optional
    check (account_url is null or account_url ~* '^https?://[^[:space:]]+$');

update public.promotion_channel_sheet_items
set
  display_name = coalesce(nullif(display_name, ''), nullif(account_name, ''), nullif(handle, ''), 'Row ' || row_number),
  headers = case
    when headers = '[]'::jsonb then jsonb_build_array(
      'crm_item_id',
      'platform',
      'account_name',
      'handle',
      'account_url',
      'ownership_type',
      'partner_name',
      'active',
      'notes'
    )
    else headers
  end,
  row_values = case
    when row_values = '[]'::jsonb then jsonb_build_array(
      crm_item_id,
      coalesce(platform, ''),
      coalesce(account_name, ''),
      coalesce(handle, ''),
      coalesce(account_url, ''),
      coalesce(ownership_type, ''),
      coalesce(partner_name, ''),
      case when active then 'TRUE' else 'FALSE' end,
      coalesce(notes, '')
    )
    else row_values
  end;

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
  selected_sheet_item_id uuid := public.safe_uuid(input ->> 'promotion_channel_sheet_item_id');
  selected_account_ids uuid[] := array[]::uuid[];
  account public.publishing_accounts%rowtype;
  sheet public.promotion_channel_sheets%rowtype;
  sheet_item public.promotion_channel_sheet_items%rowtype;
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

  select item.* into sheet
  from public.promotion_channel_sheets item
  where item.promotion_id = promotion.id;

  if sheet.id is not null then
    if selected_sheet_item_id is null then
      perform public._domain_error('SHEET_CHANNEL_ITEM_REQUIRED', 'Choose the Sheet row where this promo was posted.', '{}'::jsonb, correlation_id);
    end if;
    select item.* into sheet_item
    from public.promotion_channel_sheet_items item
    where item.id = selected_sheet_item_id
      and item.sheet_id = sheet.id
      and item.active = true;
    if sheet_item.id is null then
      perform public._domain_error('SHEET_CHANNEL_ITEM_INVALID', 'Choose an active channel row from the connected Sheet.', '{}'::jsonb, correlation_id);
    end if;
    if exists (
      select 1
      from public.publications existing
      where existing.promotion_id = promotion.id
        and existing.promotion_channel_sheet_item_id = selected_sheet_item_id
        and existing.event_type = 'PUBLISHED'
        and existing.supersedes_publication_id is null
    ) then
      perform public._domain_error('PUBLICATION_ALREADY_RECORDED', 'This Sheet row already has a recorded publication.', '{}'::jsonb, correlation_id);
    end if;
    provider_value := coalesce(nullif(sheet_item.platform, ''), 'SHEET');
    destination_value := coalesce(nullif(sheet_item.handle, ''), nullif(sheet_item.display_name, ''), 'Row ' || sheet_item.row_number);
    selected_account_id := null;
  else
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
  end if;

  insert into public.publications (
    promotion_id,
    publishing_account_id,
    promotion_channel_sheet_item_id,
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
    selected_sheet_item_id,
    provider_value,
    destination_value,
    nullif(btrim(input ->> 'external_publication_id'), ''),
    btrim(input ->> 'publication_url'),
    artifact_id,
    actor_id,
    coalesce(nullif(input ->> 'published_at', '')::timestamptz, now()),
    'PUBLISHED'
  ) returning * into publication;

  if sheet.id is not null then
    select not exists (
      select 1
      from public.promotion_channel_sheet_items selected
      where selected.sheet_id = sheet.id
        and selected.active = true
        and not exists (
          select 1
          from public.publications existing
          where existing.promotion_id = promotion.id
            and existing.promotion_channel_sheet_item_id = selected.id
            and existing.event_type = 'PUBLISHED'
            and existing.supersedes_publication_id is null
        )
    ) into all_accounts_complete;
  elsif array_length(selected_account_ids, 1) is null then
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
      'promotionChannelSheetItemId', publication.promotion_channel_sheet_item_id,
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
