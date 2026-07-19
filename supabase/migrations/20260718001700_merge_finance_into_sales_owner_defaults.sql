do $$
declare
  finance_role_id uuid;
  sales_role_id uuid;
begin
  select id into finance_role_id from public.roles where code = 'FINANCE';
  select id into sales_role_id from public.roles where code = 'SALES';

  if finance_role_id is not null and sales_role_id is not null then
    insert into public.user_roles (user_id, role_id)
    select user_id, sales_role_id
    from public.user_roles
    where role_id = finance_role_id
    on conflict do nothing;

    delete from public.user_roles where role_id = finance_role_id;
  end if;
end $$;

create or replace function public.create_promotion(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  selected_client_id uuid := public.safe_uuid(input ->> 'client_id');
  promotion public.promotions%rowtype;
begin
  if not (
    public._user_has_role(actor_id, 'SALES')
    or public._user_has_role(actor_id, 'ADMINISTRATOR')
  ) then
    perform public._domain_error('FORBIDDEN', 'Sales or Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  if selected_client_id is null or not exists (
    select 1 from public.clients client
    where client.id = selected_client_id and client.archived_at is null
  ) then
    perform public._domain_error('CLIENT_NOT_AVAILABLE', 'An active client is required.', '{}'::jsonb, correlation_id);
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
    actor_id,
    case when nullif(input ->> 'due_date', '') is null then null else (input ->> 'due_date')::date end,
    actor_id
  ) returning * into promotion;

  insert into public.promotion_assignments (
    promotion_id, role_type, event_type, assigned_user_id, performed_by
  ) values (
    promotion.id, 'SALES_OWNER', 'ASSIGNED', actor_id, actor_id
  );

  perform public._emit_event(
    'Promotion', promotion.id, 'PromotionCreated', actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'clientId', promotion.client_id,
      'title', promotion.title,
      'ownerId', promotion.sales_owner_id
    )
  );
  return public._promotion_dto(promotion);
end;
$$;
