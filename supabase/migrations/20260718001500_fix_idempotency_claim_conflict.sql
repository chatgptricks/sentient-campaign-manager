create or replace function public.claim_integration_operation(
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
  on conflict on constraint idempotency_ledger_pkey do nothing
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
