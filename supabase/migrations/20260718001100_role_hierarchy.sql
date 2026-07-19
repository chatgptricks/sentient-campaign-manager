create or replace function public._role_rank(role_code text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case upper($1)
    when 'ADMINISTRATOR' then 60
    when 'FINANCE' then 50
    when 'SALES' then 40
    when 'APPROVER' then 30
    when 'CREATOR' then 20
    when 'PUBLISHER' then 10
    else null
  end;
$$;

create or replace function public._user_has_role(user_id uuid, role_code text)
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
      and public._role_rank(role.code) >= public._role_rank($2)
  );
$$;

comment on function public._role_rank(text) is
  'Role hierarchy from highest to lowest: Administrator, Finance, Sales, Approver, Creator, Publisher.';
