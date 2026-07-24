create table public.promotion_channel_sheets (
  id uuid primary key default extensions.gen_random_uuid(),
  promotion_id uuid not null unique references public.promotions (id) on delete restrict,
  sheet_url text not null check (sheet_url ~* '^https?://[^[:space:]]+$'),
  spreadsheet_id text not null check (length(btrim(spreadsheet_id)) > 0),
  sheet_gid text,
  sheet_name text,
  header_row integer not null default 1 check (header_row > 0),
  last_synced_at timestamptz,
  last_synced_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.promotion_channel_sheet_items (
  id uuid primary key default extensions.gen_random_uuid(),
  sheet_id uuid not null references public.promotion_channel_sheets (id) on delete cascade,
  row_number integer not null check (row_number > 1),
  crm_item_id text not null check (length(btrim(crm_item_id)) > 0),
  platform text not null check (platform in ('INSTAGRAM', 'X', 'LINKEDIN')),
  account_name text not null check (length(btrim(account_name)) > 0),
  handle text not null check (length(btrim(handle)) > 0),
  account_url text not null check (account_url ~* '^https?://[^[:space:]]+$'),
  ownership_type text not null default 'SENTIENT_OWNED' check (ownership_type in ('SENTIENT_OWNED', 'CLIENT_OWNED', 'EXTERNAL_PARTNER')),
  partner_name text,
  active boolean not null default true,
  notes text,
  raw_json jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sheet_id, crm_item_id)
);

alter table public.publications
  add column if not exists promotion_channel_sheet_item_id uuid
    references public.promotion_channel_sheet_items (id) on delete restrict;

create unique index publications_current_sheet_item_idx
on public.publications (promotion_id, promotion_channel_sheet_item_id)
where promotion_channel_sheet_item_id is not null
  and event_type = 'PUBLISHED'
  and supersedes_publication_id is null;

create index promotion_channel_sheets_promotion_idx
on public.promotion_channel_sheets (promotion_id);

create index promotion_channel_sheet_items_sheet_active_idx
on public.promotion_channel_sheet_items (sheet_id, active, row_number);

alter table public.promotion_channel_sheets enable row level security;
alter table public.promotion_channel_sheets force row level security;
alter table public.promotion_channel_sheet_items enable row level security;
alter table public.promotion_channel_sheet_items force row level security;

create policy promotion_channel_sheets_select on public.promotion_channel_sheets
for select to authenticated
using (public.current_user_can_view_promotion(promotion_id));

create policy promotion_channel_sheet_items_select on public.promotion_channel_sheet_items
for select to authenticated
using (
  exists (
    select 1
    from public.promotion_channel_sheets sheet
    where sheet.id = promotion_channel_sheet_items.sheet_id
      and public.current_user_can_view_promotion(sheet.promotion_id)
  )
);

grant select on public.promotion_channel_sheets to authenticated;
grant select on public.promotion_channel_sheet_items to authenticated;
grant all privileges on public.promotion_channel_sheets to service_role;
grant all privileges on public.promotion_channel_sheet_items to service_role;

create trigger promotion_channel_sheets_set_updated_at
before update on public.promotion_channel_sheets
for each row execute function public.set_updated_at();

create trigger promotion_channel_sheet_items_set_updated_at
before update on public.promotion_channel_sheet_items
for each row execute function public.set_updated_at();

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
    provider_value := sheet_item.platform;
    destination_value := sheet_item.handle;
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
