create function public.bootstrap_first_administrator(target_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_profile public.profiles%rowtype;
  administrator_role public.roles%rowtype;
  correlation_id uuid := extensions.gen_random_uuid();
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sentient-active-administrator-invariant', 0)
  );
  if exists (
    select 1
    from public.user_roles user_role
    join public.roles role on role.id = user_role.role_id
    join public.profiles profile on profile.id = user_role.user_id
    where role.code = 'ADMINISTRATOR'
      and profile.status = 'ACTIVE'
  ) then
    perform public._domain_error(
      'ADMINISTRATOR_ALREADY_BOOTSTRAPPED',
      'An active Administrator already exists; use the audited Admin workflow instead.',
      '{}'::jsonb,
      correlation_id
    );
  end if;

  select profile.* into target_profile
  from public.profiles profile
  where lower(profile.email) = lower(btrim(bootstrap_first_administrator.target_email))
    and profile.status = 'ACTIVE'
  limit 1;
  if target_profile.id is null then
    perform public._domain_error(
      'BOOTSTRAP_PROFILE_NOT_FOUND',
      'Create and confirm the first Auth user before bootstrapping Administrator access.',
      '{}'::jsonb,
      correlation_id
    );
  end if;

  select role.* into administrator_role
  from public.roles role
  where role.code = 'ADMINISTRATOR';
  if administrator_role.id is null then
    perform public._domain_error(
      'ADMINISTRATOR_ROLE_NOT_FOUND',
      'The Administrator role has not been migrated.',
      '{}'::jsonb,
      correlation_id
    );
  end if;

  insert into public.user_roles (user_id, role_id, granted_by)
  values (target_profile.id, administrator_role.id, target_profile.id)
  on conflict (user_id, role_id) do nothing;

  insert into public.audit_log (
    aggregate_type,
    aggregate_id,
    event_type,
    actor_id,
    correlation_id,
    metadata_json
  ) values (
    'Profile',
    target_profile.id,
    'FirstAdministratorBootstrapped',
    target_profile.id,
    correlation_id,
    jsonb_build_object('email', target_profile.email, 'oneTimeBootstrap', true)
  );

  return jsonb_build_object(
    'id', target_profile.id,
    'email', target_profile.email,
    'displayName', target_profile.display_name,
    'role', administrator_role.code,
    'correlationId', correlation_id
  );
end;
$$;

revoke all on function public.bootstrap_first_administrator(text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_administrator(text) to service_role;
