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
  ('SALES', 'Sales'),
  ('CREATOR', 'Creator')
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
  ),
  (
    'INSTAGRAM',
    'ai.excel',
    '@ai.excel',
    'https://www.instagram.com/ai.excel/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'ai.tech.moments',
    '@ai.tech.moments',
    'https://www.instagram.com/ai.tech.moments/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'aigleeson',
    '@aigleeson',
    'https://www.instagram.com/aigleeson/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'ainterestingaf',
    '@ainterestingaf',
    'https://www.instagram.com/ainterestingaf/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'ainterestingupdate',
    '@ainterestingupdate',
    'https://www.instagram.com/ainterestingupdate/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'artificialmente.ia',
    '@artificialmente.ia',
    'https://www.instagram.com/artificialmente.ia/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'artificialntellligence',
    '@artificialntellligence',
    'https://www.instagram.com/artificialntellligence/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'bballclan',
    '@bballclan',
    'https://www.instagram.com/bballclan/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'beatprocrastinationnow',
    '@beatprocrastinationnow',
    'https://www.instagram.com/beatprocrastinationnow/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'chatgptips',
    '@chatgptips',
    'https://www.instagram.com/chatgptips/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'chatgptricks',
    '@chatgptricks',
    'https://www.instagram.com/chatgptricks/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'chatgptruco',
    '@chatgptruco',
    'https://www.instagram.com/chatgptruco/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'costarica',
    '@costarica',
    'https://www.instagram.com/costarica/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'em3rging',
    '@em3rging',
    'https://www.instagram.com/em3rging/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'estoicomorir',
    '@estoicomorir',
    'https://www.instagram.com/estoicomorir/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'estoicovivir',
    '@estoicovivir',
    'https://www.instagram.com/estoicovivir/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'ivanelgrande',
    '@ivanelgrande',
    'https://www.instagram.com/ivanelgrande/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'louisgson',
    '@louisgson',
    'https://www.instagram.com/louisgson/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'planet.ai_',
    '@planet.ai_',
    'https://www.instagram.com/planet.ai_/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'programming__india',
    '@programming__india',
    'https://www.instagram.com/programming__india/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'sentientagency',
    '@sentientagency',
    'https://www.instagram.com/sentientagency/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'sergioprompts',
    '@sergioprompts',
    'https://www.instagram.com/sergioprompts/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'stoicreflections',
    '@stoicreflections',
    'https://www.instagram.com/stoicreflections/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'tecnologia',
    '@tecnologia',
    'https://www.instagram.com/tecnologia/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'traselveloreal',
    '@traselveloreal',
    'https://www.instagram.com/traselveloreal/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'trends',
    '@trends',
    'https://www.instagram.com/trends/',
    'SENTIENT_OWNED',
    null,
    'Sentient Network internal Instagram account.'
  ),
  (
    'INSTAGRAM',
    'aitrendz.xyz',
    '@aitrendz.xyz',
    'https://www.instagram.com/aitrendz.xyz/',
    'EXTERNAL_PARTNER',
    null,
    'Sentient Network partner Instagram account.'
  ),
  (
    'INSTAGRAM',
    'blueviper.ai',
    '@blueviper.ai',
    'https://www.instagram.com/blueviper.ai/',
    'EXTERNAL_PARTNER',
    null,
    'Sentient Network partner Instagram account.'
  ),
  (
    'INSTAGRAM',
    'mindset.therapy',
    '@mindset.therapy',
    'https://www.instagram.com/mindset.therapy/',
    'EXTERNAL_PARTNER',
    null,
    'Sentient Network partner Instagram account.'
  ),
  (
    'INSTAGRAM',
    'theaipage',
    '@theaipage',
    'https://www.instagram.com/theaipage/',
    'EXTERNAL_PARTNER',
    null,
    'Sentient Network partner Instagram account.'
  ),
  (
    'INSTAGRAM',
    'theartificialintelligence',
    '@theartificialintelligence',
    'https://www.instagram.com/theartificialintelligence/',
    'EXTERNAL_PARTNER',
    null,
    'Sentient Network partner Instagram account.'
  )
on conflict do nothing;

