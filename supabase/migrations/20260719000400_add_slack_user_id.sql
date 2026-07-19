-- Add slack_user_id column to profiles
alter table public.profiles add column if not exists slack_user_id text;

-- Update trigger function to sync slack_user_id from user metadata
create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  slack_id text;
begin
  profile_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  slack_id := nullif(btrim(new.raw_user_meta_data ->> 'slack_user_id'), '');

  insert into public.profiles (id, email, display_name, status, slack_user_id)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@invalid.local'),
    profile_name,
    case when new.email_confirmed_at is null then 'INVITED'::public.profile_status else 'ACTIVE'::public.profile_status end,
    slack_id
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = case
      when public.profiles.display_name = '' then excluded.display_name
      else public.profiles.display_name
    end,
    status = case
      when public.profiles.status = 'SUSPENDED' then public.profiles.status
      when new.email_confirmed_at is not null then 'ACTIVE'::public.profile_status
      else public.profiles.status
    end,
    slack_user_id = coalesce(excluded.slack_user_id, public.profiles.slack_user_id);

  return new;
end;
$$;
