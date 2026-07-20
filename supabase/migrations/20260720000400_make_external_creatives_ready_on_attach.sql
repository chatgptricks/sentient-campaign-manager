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

  initial_status := case
    when provider = 'SUPABASE_STORAGE' then 'PENDING'::public.resource_validation_status
    else 'VALID'::public.resource_validation_status
  end;
  initial_message := case
    when provider = 'SUPABASE_STORAGE' then null
    else 'External HTTPS creative link is ready for workflow submission.'
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
