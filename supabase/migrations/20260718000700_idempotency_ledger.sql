create table public.idempotency_ledger (
  idempotency_key text primary key check (length(btrim(idempotency_key)) between 8 and 200),
  provider text not null check (length(btrim(provider)) > 0),
  operation text not null check (length(btrim(operation)) > 0),
  state text not null check (state in ('PROCESSING', 'SUCCEEDED')),
  lock_token uuid,
  locked_at timestamptz,
  response_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(response_metadata) = 'object'),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint idempotency_processing_lock check (
    (state = 'PROCESSING' and lock_token is not null and locked_at is not null)
    or (state = 'SUCCEEDED' and lock_token is null and locked_at is null)
  )
);

alter table public.idempotency_ledger enable row level security;
alter table public.idempotency_ledger force row level security;

create function public.claim_integration_operation(
  provider text,
  operation text,
  idempotency_key text,
  lock_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  ledger public.idempotency_ledger%rowtype;
begin
  if length(btrim(coalesce(claim_integration_operation.provider, ''))) = 0
    or length(btrim(coalesce(claim_integration_operation.operation, ''))) = 0
    or length(btrim(coalesce(claim_integration_operation.idempotency_key, ''))) not between 8 and 200
    or claim_integration_operation.lock_token is null
  then
    perform public._domain_error('IDEMPOTENCY_INPUT_INVALID', 'Idempotency claim input is invalid.');
  end if;

  insert into public.idempotency_ledger (
    idempotency_key, provider, operation, state, lock_token, locked_at
  ) values (
    claim_integration_operation.idempotency_key,
    claim_integration_operation.provider,
    claim_integration_operation.operation,
    'PROCESSING',
    claim_integration_operation.lock_token,
    now()
  )
  on conflict (idempotency_key) do nothing
  returning * into ledger;
  if ledger.idempotency_key is not null then
    return jsonb_build_object('state', 'CLAIMED');
  end if;

  select item.* into ledger
  from public.idempotency_ledger item
  where item.idempotency_key = claim_integration_operation.idempotency_key
  for update;
  if ledger.provider <> claim_integration_operation.provider
    or ledger.operation <> claim_integration_operation.operation
  then
    perform public._domain_error('IDEMPOTENCY_SCOPE_MISMATCH', 'Idempotency key was already used for a different operation.');
  end if;
  if ledger.state = 'SUCCEEDED' then
    return jsonb_build_object('state', 'SUCCEEDED', 'response', ledger.response_metadata);
  end if;
  if ledger.lock_token is null or ledger.locked_at < now() - interval '5 minutes' then
    update public.idempotency_ledger item
    set
      lock_token = claim_integration_operation.lock_token,
      locked_at = now(),
      last_error = null,
      updated_at = now()
    where item.idempotency_key = ledger.idempotency_key;
    return jsonb_build_object('state', 'CLAIMED', 'recovered', true);
  end if;
  return jsonb_build_object('state', 'IN_PROGRESS');
end;
$$;

create function public.complete_integration_operation(
  idempotency_key text,
  lock_token uuid,
  response_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.idempotency_ledger item
  set
    state = 'SUCCEEDED',
    lock_token = null,
    locked_at = null,
    response_metadata = coalesce(complete_integration_operation.response_metadata, '{}'::jsonb),
    last_error = null,
    updated_at = now()
  where item.idempotency_key = complete_integration_operation.idempotency_key
    and item.state = 'PROCESSING'
    and item.lock_token = complete_integration_operation.lock_token;
  if not found then
    perform public._domain_error('IDEMPOTENCY_LOCK_MISMATCH', 'Idempotency operation is not owned by this worker.');
  end if;
end;
$$;

create function public.release_integration_operation(
  idempotency_key text,
  lock_token uuid,
  error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.idempotency_ledger item
  set
    lock_token = extensions.gen_random_uuid(),
    locked_at = '1970-01-01 00:00:00+00'::timestamptz,
    last_error = left(coalesce(release_integration_operation.error_code, 'OPERATION_FAILED'), 500),
    updated_at = now()
  where item.idempotency_key = release_integration_operation.idempotency_key
    and item.state = 'PROCESSING'
    and item.lock_token = release_integration_operation.lock_token;
end;
$$;

revoke all on table public.idempotency_ledger from public, anon, authenticated;
grant all on table public.idempotency_ledger to service_role;
revoke all on function public.claim_integration_operation(text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_integration_operation(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.release_integration_operation(text, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_integration_operation(text, text, text, uuid) to service_role;
grant execute on function public.complete_integration_operation(text, uuid, jsonb) to service_role;
grant execute on function public.release_integration_operation(text, uuid, text) to service_role;
