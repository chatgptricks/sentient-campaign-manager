-- Backfill Slack user IDs for profiles that existed before the profile trigger synced this field.
update public.profiles profile
set slack_user_id = nullif(btrim(auth_user.raw_user_meta_data ->> 'slack_user_id'), '')
from auth.users auth_user
where profile.id = auth_user.id
  and profile.slack_user_id is null
  and nullif(btrim(auth_user.raw_user_meta_data ->> 'slack_user_id'), '') is not null;
