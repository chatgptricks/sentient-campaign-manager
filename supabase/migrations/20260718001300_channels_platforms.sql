update public.publishing_accounts
set
  platform = 'X',
  account_url = replace(replace(account_url, 'https://www.tiktok.com/@', 'https://x.com/'), 'https://www.facebook.com/', 'https://x.com/'),
  account_name = case
    when platform = 'TIKTOK' then replace(account_name, 'social', 'X')
    when platform = 'FACEBOOK' then replace(account_name, 'page', 'account')
    else account_name
  end
where platform in ('FACEBOOK', 'TIKTOK');

alter table public.publishing_accounts
drop constraint if exists publishing_accounts_platform_check;

alter table public.publishing_accounts
add constraint publishing_accounts_platform_check
check (platform in ('INSTAGRAM', 'X', 'LINKEDIN'));

update public.campaign_metadata
set platforms = coalesce(
  (
    select array_agg(distinct case
      when platform in ('FACEBOOK', 'TIKTOK') then 'X'
      when platform in ('INSTAGRAM', 'X', 'LINKEDIN') then platform
      else null
    end)
    from unnest(platforms) as platform
    where platform in ('INSTAGRAM', 'X', 'LINKEDIN', 'FACEBOOK', 'TIKTOK')
  ),
  '{}'::text[]
);

alter table public.campaign_metadata
drop constraint if exists campaign_metadata_platforms_check;

alter table public.campaign_metadata
add constraint campaign_metadata_platforms_check
check (platforms <@ array['INSTAGRAM', 'X', 'LINKEDIN']::text[]);
