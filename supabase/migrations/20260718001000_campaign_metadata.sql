create table public.campaign_metadata (
  promotion_id uuid primary key references public.promotions (id) on delete restrict,
  campaign_type text not null default 'Social campaign' check (length(btrim(campaign_type)) > 0),
  scheduled_date date,
  priority text not null default 'NORMAL' check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  brief_url text check (brief_url is null or brief_url ~* '^https://[^[:space:]]+$'),
  client_material_links jsonb not null default '[]'::jsonb check (jsonb_typeof(client_material_links) = 'array'),
  external_resource_links jsonb not null default '[]'::jsonb check (jsonb_typeof(external_resource_links) = 'array'),
  platforms text[] not null default '{}'::text[] check (platforms <@ array['INSTAGRAM', 'X', 'LINKEDIN']::text[]),
  publishing_account_ids uuid[] not null default '{}'::uuid[],
  external_partner_account_ids uuid[] not null default '{}'::uuid[],
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campaign_metadata enable row level security;
alter table public.campaign_metadata force row level security;

create policy campaign_metadata_select on public.campaign_metadata
for select to authenticated
using (public.current_user_can_view_promotion(promotion_id));

create policy campaign_metadata_insert on public.campaign_metadata
for insert to authenticated
with check (public.current_user_can_manage_promotion(promotion_id));

create policy campaign_metadata_update on public.campaign_metadata
for update to authenticated
using (public.current_user_can_manage_promotion(promotion_id))
with check (public.current_user_can_manage_promotion(promotion_id));

grant select on public.campaign_metadata to authenticated;
grant insert, update on public.campaign_metadata to authenticated;
grant all privileges on public.campaign_metadata to service_role;

create trigger campaign_metadata_set_updated_at
before update on public.campaign_metadata
for each row execute function public.set_updated_at();

create function public.upsert_campaign_metadata(promotion_id uuid, input jsonb)
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
    perform public._domain_error('FORBIDDEN', 'The user cannot manage this campaign metadata.', '{}'::jsonb, extensions.gen_random_uuid());
  end if;
  if input ? 'brief_url' and nullif(input ->> 'brief_url', '') is not null
    and (input ->> 'brief_url') !~* '^https://[^[:space:]]+$' then
    perform public._domain_error('INVALID_BRIEF_URL', 'Brief links must use HTTPS.', '{}'::jsonb, extensions.gen_random_uuid());
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
    coalesce(nullif(btrim(input ->> 'campaign_type'), ''), 'Social campaign'),
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
  on conflict (promotion_id) do update set
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
    'Promotion', metadata.promotion_id, 'CampaignMetadataUpdated', actor_id, null,
    extensions.gen_random_uuid(), jsonb_build_object('campaignType', metadata.campaign_type, 'priority', metadata.priority)
  );
  return to_jsonb(metadata);
end;
$$;

grant execute on function public.upsert_campaign_metadata(uuid, jsonb) to authenticated;
