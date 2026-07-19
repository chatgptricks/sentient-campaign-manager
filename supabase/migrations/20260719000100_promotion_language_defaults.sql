alter table public.campaign_metadata
  alter column campaign_type set default 'Social promotion';

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
