create table public.publishing_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  platform text not null check (platform in ('INSTAGRAM', 'X', 'LINKEDIN')),
  account_name text not null check (length(btrim(account_name)) > 0),
  handle text not null check (length(btrim(handle)) > 0),
  account_url text not null unique check (account_url ~* '^https://[^[:space:]]+$'),
  ownership_type text not null check (ownership_type in ('SENTIENT_OWNED', 'CLIENT_OWNED', 'EXTERNAL_PARTNER')),
  partner_name text,
  active boolean not null default true,
  default_publisher_id uuid references public.profiles (id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index publishing_accounts_platform_idx on public.publishing_accounts (platform, active);
create index publishing_accounts_default_publisher_idx on public.publishing_accounts (default_publisher_id)
  where default_publisher_id is not null;

alter table public.publishing_accounts enable row level security;
alter table public.publishing_accounts force row level security;

create policy publishing_accounts_select on public.publishing_accounts
for select to authenticated
using (public.current_user_has_any_role());

create policy publishing_accounts_admin_insert on public.publishing_accounts
for insert to authenticated
with check (public.current_user_has_role('ADMINISTRATOR'));

create policy publishing_accounts_admin_update on public.publishing_accounts
for update to authenticated
using (public.current_user_has_role('ADMINISTRATOR'))
with check (public.current_user_has_role('ADMINISTRATOR'));

grant select on public.publishing_accounts to authenticated;
grant insert, update on public.publishing_accounts to authenticated;
grant all privileges on public.publishing_accounts to service_role;

create trigger publishing_accounts_set_updated_at
before update on public.publishing_accounts
for each row execute function public.set_updated_at();
