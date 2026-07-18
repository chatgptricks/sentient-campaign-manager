create table public.edge_rate_limits (
  scope text not null check (
    length(scope) between 3 and 80
    and scope ~ '^[a-z0-9:_-]+$'
  ),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count between 1 and 100001),
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

alter table public.edge_rate_limits enable row level security;
alter table public.edge_rate_limits force row level security;

create index edge_rate_limits_updated_at_idx
on public.edge_rate_limits (updated_at);

create function public.consume_edge_rate_limit(
  rate_scope text,
  rate_key_hash text,
  request_limit integer,
  window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  consumed public.edge_rate_limits%rowtype;
  request_time timestamptz := clock_timestamp();
  retry_after_seconds integer;
begin
  if length(coalesce(consume_edge_rate_limit.rate_scope, '')) not between 3 and 80
    or consume_edge_rate_limit.rate_scope !~ '^[a-z0-9:_-]+$'
    or coalesce(consume_edge_rate_limit.rate_key_hash, '') !~ '^[0-9a-f]{64}$'
    or consume_edge_rate_limit.request_limit is null
    or consume_edge_rate_limit.request_limit not between 1 and 100000
    or consume_edge_rate_limit.window_seconds is null
    or consume_edge_rate_limit.window_seconds not between 1 and 86400
  then
    perform public._domain_error(
      'EDGE_RATE_LIMIT_INPUT_INVALID',
      'Edge rate-limit input is invalid.'
    );
  end if;

  insert into public.edge_rate_limits as current_bucket (
    scope,
    key_hash,
    window_started_at,
    request_count,
    updated_at
  ) values (
    consume_edge_rate_limit.rate_scope,
    consume_edge_rate_limit.rate_key_hash,
    request_time,
    1,
    request_time
  )
  on conflict (scope, key_hash) do update
  set
    window_started_at = case
      when current_bucket.window_started_at
        <= request_time - make_interval(secs => consume_edge_rate_limit.window_seconds)
        then request_time
      else current_bucket.window_started_at
    end,
    request_count = case
      when current_bucket.window_started_at
        <= request_time - make_interval(secs => consume_edge_rate_limit.window_seconds)
        then 1
      else least(
        current_bucket.request_count + 1,
        consume_edge_rate_limit.request_limit + 1
      )
    end,
    updated_at = request_time
  returning * into consumed;

  retry_after_seconds := greatest(
    1,
    ceil(
      extract(
        epoch from (
          consumed.window_started_at
          + make_interval(secs => consume_edge_rate_limit.window_seconds)
          - request_time
        )
      )
    )::integer
  );

  return jsonb_build_object(
    'allowed', consumed.request_count <= consume_edge_rate_limit.request_limit,
    'limit', consume_edge_rate_limit.request_limit,
    'remaining', greatest(consume_edge_rate_limit.request_limit - consumed.request_count, 0),
    'requestCount', consumed.request_count,
    'resetAt', consumed.window_started_at
      + make_interval(secs => consume_edge_rate_limit.window_seconds),
    'retryAfterSeconds', retry_after_seconds
  );
end;
$$;

revoke all on table public.edge_rate_limits from public, anon, authenticated;
grant all on table public.edge_rate_limits to service_role;
revoke all on function public.consume_edge_rate_limit(text, text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit(text, text, integer, integer)
to service_role;

select cron.unschedule(job.jobid)
from cron.job job
where job.jobname = 'sentient-prune-edge-rate-limits';

select cron.schedule(
  'sentient-prune-edge-rate-limits',
  '17 * * * *',
  $cleanup$
    delete from public.edge_rate_limits
    where updated_at < now() - interval '2 days';
  $cleanup$
);
