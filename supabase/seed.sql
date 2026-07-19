-- Deterministic local-only accounts. Never apply this file to production.
-- Password for every local account: SentientLocal!2026
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'admin@sentient.local',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Ada Administrator"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'sales@sentient.local',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Sam Sales"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'creator@sentient.local',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Casey Creator"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'approver@sentient.local',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Avery Approver"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '55555555-5555-4555-8555-555555555555',
    'authenticated',
    'authenticated',
    'publisher@sentient.local',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Parker Publisher"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '66666666-6666-4666-8666-666666666666',
    'authenticated',
    'authenticated',
    'finance@sentient.local',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Frankie Finance"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '77777777-7777-4777-8777-777777777777',
    'authenticated',
    'authenticated',
    'norole@sentient.local',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"No Role"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '88888888-8888-4888-8888-888888888888',
    'authenticated',
    'authenticated',
    'suspended@sentient.local',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Suspended User"}'::jsonb,
    now(), now(), '', '', '', ''
  )
on conflict (id) do nothing;

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  extensions.gen_random_uuid(),
  seeded_user.id::text,
  seeded_user.id,
  jsonb_build_object(
    'sub', seeded_user.id::text,
    'email', seeded_user.email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
from auth.users seeded_user
where seeded_user.id in (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777',
  '88888888-8888-4888-8888-888888888888'
)
on conflict (provider, provider_id) do nothing;

insert into public.roles (code, name)
values
  ('ADMINISTRATOR', 'Administrator'),
  ('FINANCE', 'Finance'),
  ('SALES', 'Sales'),
  ('APPROVER', 'Approver'),
  ('CREATOR', 'Creator'),
  ('PUBLISHER', 'Publisher')
on conflict (code) do update set name = excluded.name;

insert into public.user_roles (user_id, role_id, granted_by)
select assignment.user_id, role.id, '11111111-1111-4111-8111-111111111111'::uuid
from (
  values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'ADMINISTRATOR'::text),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'SALES'::text),
    ('33333333-3333-4333-8333-333333333333'::uuid, 'CREATOR'::text),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'APPROVER'::text),
    ('55555555-5555-4555-8555-555555555555'::uuid, 'PUBLISHER'::text),
    ('66666666-6666-4666-8666-666666666666'::uuid, 'FINANCE'::text),
    ('88888888-8888-4888-8888-888888888888'::uuid, 'SALES'::text)
) as assignment(user_id, role_code)
join public.roles role on role.code = assignment.role_code
on conflict (user_id, role_id) do nothing;

update public.profiles
set status = 'SUSPENDED'
where id = '88888888-8888-4888-8888-888888888888';

insert into public.publishing_accounts (
  platform,
  account_name,
  handle,
  account_url,
  ownership_type,
  default_publisher_id,
  notes
)
values
  (
    'INSTAGRAM',
    'Sentient official',
    '@sentient.agency',
    'https://www.instagram.com/sentient.agency',
    'SENTIENT_OWNED',
    '55555555-5555-4555-8555-555555555555'::uuid,
    'Primary internal account.'
  ),
  (
    'LINKEDIN',
    'Sentient company page',
    'sentient-agency',
    'https://www.linkedin.com/company/sentient-agency',
    'SENTIENT_OWNED',
    '55555555-5555-4555-8555-555555555555'::uuid,
    null
  ),
  (
    'X',
    'Arcadia Hotels X',
    '@arcadiahotels',
    'https://x.com/arcadiahotels',
    'CLIENT_OWNED',
    '55555555-5555-4555-8555-555555555555'::uuid,
    'Client approval required before publishing.'
  ),
  (
    'X',
    'Travel Network partner account',
    'travel-network',
    'https://x.com/travel-network',
    'EXTERNAL_PARTNER',
    null,
    'Retained for historical campaign records.'
  )
on conflict (account_url) do nothing;
