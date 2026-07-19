with ranked_user_roles as (
  select
    user_role.user_id,
    user_role.role_id,
    row_number() over (
      partition by user_role.user_id
      order by public._role_rank(role.code) desc, user_role.granted_at asc
    ) as role_position
  from public.user_roles user_role
  join public.roles role on role.id = user_role.role_id
)
delete from public.user_roles user_role
using ranked_user_roles ranked
where user_role.user_id = ranked.user_id
  and user_role.role_id = ranked.role_id
  and ranked.role_position > 1;

create unique index user_roles_one_hierarchical_role_per_user_idx
  on public.user_roles (user_id);

create or replace function public.grant_user_role(user_id uuid, role_code text)
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
  if not exists (select 1 from public.profiles profile where profile.id = grant_user_role.user_id) then
    perform public._domain_error('PROFILE_NOT_FOUND', 'Profile was not found.', '{}'::jsonb, correlation_id);
  end if;
  select item.* into role from public.roles item where item.code = upper(grant_user_role.role_code);
  if role.id is null then
    perform public._domain_error('ROLE_NOT_FOUND', 'Role was not found.', '{}'::jsonb, correlation_id);
  end if;
  if grant_user_role.user_id = actor_id and role.code <> 'ADMINISTRATOR' then
    perform public._domain_error('CANNOT_REMOVE_OWN_ADMIN_ROLE', 'Administrators cannot remove their own Administrator role.', '{}'::jsonb, correlation_id);
  end if;
  if role.code <> 'ADMINISTRATOR'
    and exists (
      select 1
      from public.user_roles user_role
      join public.roles existing_role on existing_role.id = user_role.role_id and existing_role.code = 'ADMINISTRATOR'
      join public.profiles profile on profile.id = user_role.user_id and profile.status = 'ACTIVE'
      where user_role.user_id = grant_user_role.user_id
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
  where item.user_id = grant_user_role.user_id
    and item.role_id <> role.id;

  insert into public.user_roles (user_id, role_id, granted_by)
  values (grant_user_role.user_id, role.id, actor_id)
  on conflict (user_id) do update set
    role_id = excluded.role_id,
    granted_by = excluded.granted_by,
    granted_at = now();

  perform public._emit_event(
    'Profile', grant_user_role.user_id, 'UserRoleGranted', actor_id, null, correlation_id,
    jsonb_build_object('role', role.code)
  );
  return jsonb_build_object('user_id', grant_user_role.user_id, 'role', role.code);
end;
$$;

create or replace function public.replace_user_roles(profile_id uuid, role_codes text[])
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
  if cardinality(normalized_codes) <> 1 then
    perform public._domain_error('ROLES_INVALID', 'Exactly one hierarchical role is required.', '{}'::jsonb, correlation_id);
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
  on conflict (user_id) do update set
    role_id = excluded.role_id,
    granted_by = excluded.granted_by,
    granted_at = now();

  perform public._emit_event(
    'Profile', replace_user_roles.profile_id, 'UserRolesReplaced', actor_id, null, correlation_id,
    jsonb_build_object('roles', to_jsonb(normalized_codes))
  );
  return jsonb_build_object('user_id', replace_user_roles.profile_id, 'roles', to_jsonb(normalized_codes));
end;
$$;
