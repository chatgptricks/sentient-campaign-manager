create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- The job is safe before production secrets exist: the WHERE clause suppresses
-- the network request until both named Vault values have been provisioned.
select cron.schedule(
  'sentient-process-outbox',
  '* * * * *',
  $cron$
    select net.http_post(
      url := secrets.project_url || '/functions/v1/process-outbox',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', secrets.processor_secret
      ),
      body := jsonb_build_object('batchSize', 25),
      timeout_milliseconds := 10000
    ) as request_id
    from (
      select
        max(decrypted_secret) filter (where name = 'sentient_project_url') as project_url,
        max(decrypted_secret) filter (where name = 'sentient_outbox_processor_secret') as processor_secret
      from vault.decrypted_secrets
    ) secrets
    where secrets.project_url is not null
      and secrets.processor_secret is not null;
  $cron$
);

create function public.get_outbox_scheduler_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with configured_job as (
    select job.jobid, job.active
    from cron.job job
    where job.jobname = 'sentient-process-outbox'
    order by job.jobid desc
    limit 1
  ), latest_run as (
    select detail.status, detail.start_time, detail.end_time, detail.return_message
    from cron.job_run_details detail
    join configured_job job on job.jobid = detail.jobid
    order by detail.start_time desc
    limit 1
  )
  select jsonb_build_object(
    'scheduled', exists (select 1 from configured_job),
    'active', coalesce((select active from configured_job), false),
    'projectUrlConfigured', exists (
      select 1 from vault.decrypted_secrets
      where name = 'sentient_project_url' and length(decrypted_secret) > 0
    ),
    'processorSecretConfigured', exists (
      select 1 from vault.decrypted_secrets
      where name = 'sentient_outbox_processor_secret' and length(decrypted_secret) > 0
    ),
    'lastRunStatus', (select status from latest_run),
    'lastRunStartedAt', (select start_time from latest_run),
    'lastRunStartedEpoch', (select extract(epoch from start_time)::bigint from latest_run),
    'lastRunFinishedAt', (select end_time from latest_run),
    'lastRunMessage', (select left(coalesce(return_message, ''), 200) from latest_run)
  );
$$;

revoke all on function public.get_outbox_scheduler_health() from public, anon, authenticated;
grant execute on function public.get_outbox_scheduler_health() to service_role;
