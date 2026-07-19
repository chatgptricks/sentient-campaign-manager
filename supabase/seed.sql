-- Clean seed accounts.
-- Password for all accounts: SentientLocal!2026

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
  -- Demo Account
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-000000000000',
    'authenticated',
    'authenticated',
    'demo@sentient.local',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Demo Account"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  -- Administrators
  (
    '00000000-0000-0000-0000-000000000000',
    'e1111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'esteban@sentientagency.io',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Esteban", "slack_user_id":"U08UYJMPJ76"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e2222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'louis@sentientagency.io',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Louis", "slack_user_id":"U06DZPVNTBR"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e3333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'ivan@sentientagency.io',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Ivan", "slack_user_id":"U0516SU09J9"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  -- Sales
  (
    '00000000-0000-0000-0000-000000000000',
    'e4444444-4444-4444-8444-444444444444',
    'authenticated',
    'authenticated',
    'sergio@sentientagency.io',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Sergio", "slack_user_id":"U087U6470M6"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e5555555-5555-4555-8555-555555555555',
    'authenticated',
    'authenticated',
    'victor@sentientagency.io',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Victor", "slack_user_id":"U0BAJA1AC6P"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e6666666-6666-4666-8666-666666666666',
    'authenticated',
    'authenticated',
    'egor@sentientagency.io',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Egor", "slack_user_id":"U081LU7PVK3"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  -- Creators
  (
    '00000000-0000-0000-0000-000000000000',
    'e7777777-7777-4777-8777-777777777777',
    'authenticated',
    'authenticated',
    'santiagoflhi@gmail.com',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Santiago", "slack_user_id":"U0AGH0MJ3EH"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e8888888-8888-4888-8888-888888888888',
    'authenticated',
    'authenticated',
    'dsflorezl@gmail.com',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Florez", "slack_user_id":"U0BH9R6EE4Q"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e9999999-9999-4999-8999-999999999999',
    'authenticated',
    'authenticated',
    'sara1107giraldo@gmail.com',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Sara", "slack_user_id":"U0BGHD1HD0R"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'ea111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'sebastianruizurquijo@gmail.com',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Sebastian", "slack_user_id":"U0BG04Q4Z8F"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'eb222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'tevi.mc12@gmail.com',
    extensions.crypt('SentientLocal!2026', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Tevi", "slack_user_id":"U05QU9WCR1N"}'::jsonb,
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
  '00000000-0000-4000-8000-000000000000',
  'e1111111-1111-4111-8111-111111111111',
  'e2222222-2222-4222-8222-222222222222',
  'e3333333-3333-4333-8333-333333333333',
  'e4444444-4444-4444-8444-444444444444',
  'e5555555-5555-4555-8555-555555555555',
  'e6666666-6666-4666-8666-666666666666',
  'e7777777-7777-4777-8777-777777777777',
  'e8888888-8888-4888-8888-888888888888',
  'e9999999-9999-4999-8999-999999999999',
  'ea111111-1111-4111-8111-111111111111',
  'eb222222-2222-4222-8222-222222222222'
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
select assignment.user_id, role.id, 'e1111111-1111-4111-8111-111111111111'::uuid
from (
  values
    ('00000000-0000-4000-8000-000000000000'::uuid, 'ADMINISTRATOR'::text),
    ('e1111111-1111-4111-8111-111111111111'::uuid, 'ADMINISTRATOR'::text),
    ('e2222222-2222-4222-8222-222222222222'::uuid, 'ADMINISTRATOR'::text),
    ('e3333333-3333-4333-8333-333333333333'::uuid, 'ADMINISTRATOR'::text),
    ('e4444444-4444-4444-8444-444444444444'::uuid, 'SALES'::text),
    ('e5555555-5555-4555-8555-555555555555'::uuid, 'SALES'::text),
    ('e6666666-6666-4666-8666-666666666666'::uuid, 'SALES'::text),
    ('e7777777-7777-4777-8777-777777777777'::uuid, 'CREATOR'::text),
    ('e8888888-8888-4888-8888-888888888888'::uuid, 'CREATOR'::text),
    ('e9999999-9999-4999-8999-999999999999'::uuid, 'CREATOR'::text),
    ('ea111111-1111-4111-8111-111111111111'::uuid, 'CREATOR'::text),
    ('eb222222-2222-4222-8222-222222222222'::uuid, 'CREATOR'::text)
) as assignment(user_id, role_code)
join public.roles role on role.code = assignment.role_code
on conflict (user_id, role_id) do nothing;

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
    'e7777777-7777-4777-8777-777777777777',
    'Primary Instagram account for published promotions.'
  ),
  (
    'X',
    'Sentient official X',
    '@sentient_agency',
    'https://x.com/sentient_agency',
    'SENTIENT_OWNED',
    'e7777777-7777-4777-8777-777777777777',
    'Primary X account for campaign announcements.'
  ),
  (
    'LINKEDIN',
    'Sentient Agency LinkedIn',
    'company/sentient-agency',
    'https://www.linkedin.com/company/sentient-agency',
    'SENTIENT_OWNED',
    'e7777777-7777-4777-8777-777777777777',
    'Official LinkedIn company page.'
  )
on conflict do nothing;

-- Synthetic Seed Promotions for initial demo / testing
do $$
declare
  admin_id uuid := 'e1111111-1111-4111-8111-111111111111'::uuid; -- Esteban
  sales_id uuid := 'e4444444-4444-4444-8444-444444444444'::uuid; -- Sergio
  creator_id uuid := 'e7777777-7777-4777-8777-777777777777'::uuid; -- Santiago
  client_1 jsonb;
  client_2 jsonb;
  promo_1 jsonb;
  promo_2 jsonb;
  ver int;
  res jsonb;
begin
  -- Set request context to simulate the Administrator user calling the APIs
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', admin_id), true);

  -- Create Clients
  client_1 := public.create_client('{"name": "Arcadia Hotels", "billingEmail": "billing@arcadia.example.com", "billingAddress": "123 Resort Way"}');
  client_2 := public.create_client('{"name": "Nimbus Tech", "billingEmail": "finance@nimbustech.example.com", "billingAddress": "456 Cloud Blvd"}');

  -- Create Promotion 1: Summer Getaway Campaign (Status: CREATIVE_IN_PROGRESS, Creator: Santiago)
  promo_1 := public.create_promotion(jsonb_build_object(
    'client_id', client_1->>'id',
    'title', 'Summer Getaway Campaign',
    'description', 'Promote summer discounts across luxury resort properties.',
    'sales_owner_id', sales_id,
    'due_date', (current_date + interval '14 days')::date::text
  ));
  ver := (promo_1->>'version')::int;
  perform public.assign_promotion_role((promo_1->>'id')::uuid, 'CREATOR', creator_id, ver); ver := ver + 1;
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', creator_id), true);
  perform public.start_creative_work((promo_1->>'id')::uuid, ver);
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', admin_id), true);

  -- Create Promotion 2: Cloud Migration Webinar (Status: SUBMITTED_FOR_APPROVAL, Creator: Esteban)
  promo_2 := public.create_promotion(jsonb_build_object(
    'client_id', client_2->>'id',
    'title', 'Cloud Migration Webinar',
    'description', 'B2B webinar promoting seamless cloud transitions.',
    'sales_owner_id', sales_id,
    'due_date', (current_date + interval '7 days')::date::text
  ));
  ver := (promo_2->>'version')::int;
  perform public.assign_promotion_role((promo_2->>'id')::uuid, 'CREATOR', admin_id, ver); ver := ver + 1;
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', admin_id), true);
  perform public.start_creative_work((promo_2->>'id')::uuid, ver); ver := ver + 1;
  res := public.attach_resource_link((promo_2->>'id')::uuid, '{"display_name": "Webinar Deck v1", "resource_type": "DOCUMENT", "provider": "GOOGLE_DRIVE", "url": "https://drive.google.com/test-deck"}'::jsonb); ver := ver + 1;
  update public.promotion_resource_links set validation_status = 'VALID' where id = (res->'resource'->>'id')::uuid;
  perform public.submit_for_approval((promo_2->>'id')::uuid, (res->'resource'->>'id')::uuid, ver);

end;
$$;
