begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select has_table('public', 'edge_rate_limits', 'edge rate-limit buckets exist');
select ok(
  has_function_privilege(
    'service_role',
    'public.consume_edge_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  )
    and not has_function_privilege(
      'authenticated',
      'public.consume_edge_rate_limit(text,text,integer,integer)',
      'EXECUTE'
    )
    and not has_function_privilege(
      'anon',
      'public.consume_edge_rate_limit(text,text,integer,integer)',
      'EXECUTE'
    ),
  'only the service role can consume a rate-limit bucket'
);
select ok(
  not has_table_privilege('authenticated', 'public.edge_rate_limits', 'SELECT')
    and not has_table_privilege('anon', 'public.edge_rate_limits', 'SELECT'),
  'rate-limit bucket hashes are not exposed to application users'
);
select ok(
  exists (
    select 1
    from cron.job
    where jobname = 'sentient-prune-edge-rate-limits'
      and active = true
  ),
  'expired rate-limit buckets are pruned by a scheduled job'
);

set local role service_role;

select is(
  (
    public.consume_edge_rate_limit(
      'provider-webhook', repeat('a', 64), 1, 60
    ) ->> 'allowed'
  )::boolean,
  true,
  'the first request in a bucket is allowed'
);
select is(
  (
    public.consume_edge_rate_limit(
      'provider-webhook', repeat('a', 64), 1, 60
    ) ->> 'allowed'
  )::boolean,
  false,
  'a request beyond the limit is rejected atomically'
);
select is(
  (
    public.consume_edge_rate_limit(
      'provider-webhook', repeat('b', 64), 1, 60
    ) ->> 'allowed'
  )::boolean,
  true,
  'different hashed clients use independent buckets'
);

select public.consume_edge_rate_limit(
  'process-outbox', repeat('c', 64), 1, 60
);
update public.edge_rate_limits
set window_started_at = now() - interval '61 seconds'
where scope = 'process-outbox' and key_hash = repeat('c', 64);
select is(
  (
    public.consume_edge_rate_limit(
      'process-outbox', repeat('c', 64), 1, 60
    ) ->> 'requestCount'
  )::integer,
  1,
  'an expired bucket resets to the first request'
);

select * from finish();
rollback;
