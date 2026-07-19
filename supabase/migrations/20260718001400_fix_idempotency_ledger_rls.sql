-- The idempotency ledger is an internal service table accessed through
-- SECURITY DEFINER RPCs and Edge Functions using the service role.
--
-- FORCE RLS makes the table owner subject to RLS as well. Because this table
-- intentionally has no public policies, the SECURITY DEFINER claim function can
-- be blocked before it can atomically claim an operation.
alter table public.idempotency_ledger no force row level security;

drop policy if exists idempotency_ledger_service_all on public.idempotency_ledger;
create policy idempotency_ledger_service_all on public.idempotency_ledger
  for all to service_role
  using (true)
  with check (true);
