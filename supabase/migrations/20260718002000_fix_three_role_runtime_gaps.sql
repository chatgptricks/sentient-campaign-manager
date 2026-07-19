create or replace function public._record_publication_verification(
  publication_id uuid,
  input jsonb,
  expected_version integer,
  actor_id uuid,
  caller_is_service boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  correlation_id uuid := extensions.gen_random_uuid();
  promotion public.promotions%rowtype;
  publication public.publications%rowtype;
  verification public.publication_verifications%rowtype;
  result_status public.verification_status;
  method text;
  can_verify boolean;
  event_name text;
begin
  select item.* into publication
  from public.publications item
  where item.id = _record_publication_verification.publication_id;
  if publication.id is null then
    perform public._domain_error('PUBLICATION_NOT_FOUND', 'Publication was not found.', '{}'::jsonb, correlation_id);
  end if;
  select item.* into promotion
  from public.promotions item
  where item.id = publication.promotion_id
  for update;

  can_verify := caller_is_service or public.current_user_can_publish_promotion(promotion.id);
  if not can_verify then
    perform public._domain_error('FORBIDDEN', 'Only the assigned Creator, Sales owner, or Administrator can verify publication.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> _record_publication_verification.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status <> 'VERIFICATION_PENDING' then
    perform public._domain_error('PROMOTION_INVALID_TRANSITION', 'Publication verification is not pending.', '{}'::jsonb, correlation_id);
  end if;

  if nullif(input ->> 'status', '') is null then
    perform public._domain_error('VERIFICATION_STATUS_INVALID', 'Verification status is required.', '{}'::jsonb, correlation_id);
  end if;
  begin
    result_status := (input ->> 'status')::public.verification_status;
  exception when invalid_text_representation then
    perform public._domain_error('VERIFICATION_STATUS_INVALID', 'Verification status is invalid.', '{}'::jsonb, correlation_id);
  end;

  method := coalesce(
    nullif(btrim(input ->> 'verification_method'), ''),
    case when caller_is_service then 'AUTOMATED_CHECK' else 'MANUAL' end
  );
  if method not in ('MANUAL', 'PROVIDER_API', 'AUTOMATED_CHECK') then
    perform public._domain_error('VERIFICATION_METHOD_INVALID', 'Verification method is invalid.', '{}'::jsonb, correlation_id);
  end if;

  insert into public.publication_verifications (
    publication_id,
    promotion_id,
    status,
    details_json,
    verified_by,
    verification_method
  ) values (
    publication.id,
    promotion.id,
    result_status,
    coalesce(input -> 'details_json', input -> 'details', '{}'::jsonb),
    actor_id,
    method
  ) returning * into verification;

  event_name := case result_status
    when 'VERIFIED' then 'PublicationVerified'
    when 'FAILED' then 'PublicationVerificationFailed'
    when 'UNAVAILABLE' then 'PublicationVerificationUnavailable'
  end;

  update public.promotions item
  set
    status = case when result_status = 'VERIFIED' then 'VERIFIED'::public.promotion_status else item.status end,
    version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, event_name, actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'publicationId', publication.id,
      'verificationId', verification.id,
      'status', verification.status
    )
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'verification', to_jsonb(verification));
end;
$$;

create or replace function public.create_invoice(
  promotion_id uuid,
  input jsonb,
  expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  promotion public.promotions%rowtype;
  invoice public.invoices%rowtype;
  initial_status public.invoice_status;
  amount numeric(12, 2);
  currency_input text;
  currency char(3);
begin
  select item.* into promotion
  from public.promotions item
  where item.id = create_invoice.promotion_id
  for update;
  if promotion.id is null then
    perform public._domain_error('PROMOTION_NOT_FOUND', 'Promotion was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_invoice_promotion(promotion.id) then
    perform public._domain_error('FORBIDDEN', 'Sales or Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.version <> create_invoice.expected_version then
    perform public._domain_error('PROMOTION_VERSION_CONFLICT', 'The promotion was changed by another user.', '{}'::jsonb, correlation_id);
  end if;
  if promotion.status <> 'READY_FOR_INVOICING' then
    perform public._domain_error(
      'PROMOTION_INVALID_TRANSITION', 'The promotion is not ready for invoicing.',
      jsonb_build_object('from', promotion.status, 'to', 'INVOICED'), correlation_id
    );
  end if;

  begin
    amount := (input ->> 'amount')::numeric(12, 2);
  exception when invalid_text_representation or numeric_value_out_of_range then
    perform public._domain_error('INVOICE_AMOUNT_INVALID', 'Invoice amount must be a valid positive number.', '{}'::jsonb, correlation_id);
  end;
  currency_input := upper(btrim(coalesce(input ->> 'currency', '')));
  if amount is null or amount <= 0 then
    perform public._domain_error('INVOICE_AMOUNT_INVALID', 'Invoice amount must be positive.', '{}'::jsonb, correlation_id);
  end if;
  if currency_input !~ '^[A-Z]{3}$' then
    perform public._domain_error('INVOICE_CURRENCY_INVALID', 'Currency must be a three-letter ISO code.', '{}'::jsonb, correlation_id);
  end if;
  currency := currency_input::char(3);
  begin
    initial_status := coalesce(nullif(input ->> 'status', '')::public.invoice_status, 'ISSUED'::public.invoice_status);
  exception when invalid_text_representation then
    perform public._domain_error('INVOICE_STATUS_INVALID', 'Invoice status is invalid.', '{}'::jsonb, correlation_id);
  end;
  if initial_status not in ('DRAFT', 'ISSUED', 'PAID') then
    perform public._domain_error('INVOICE_STATUS_INVALID', 'A new invoice must be Draft, Issued, or Paid.', '{}'::jsonb, correlation_id);
  end if;
  if initial_status in ('ISSUED', 'PAID') and length(btrim(coalesce(input ->> 'invoice_number', ''))) = 0 then
    perform public._domain_error('INVOICE_NUMBER_REQUIRED', 'Issued invoices require an invoice number.', '{}'::jsonb, correlation_id);
  end if;

  insert into public.invoices (
    promotion_id,
    client_id,
    invoice_number,
    external_invoice_id,
    amount,
    currency,
    status,
    issued_at,
    paid_at,
    created_by
  ) values (
    promotion.id,
    promotion.client_id,
    nullif(btrim(input ->> 'invoice_number'), ''),
    nullif(btrim(input ->> 'external_invoice_id'), ''),
    amount,
    currency,
    initial_status,
    case when initial_status in ('ISSUED', 'PAID') then coalesce(nullif(input ->> 'issued_at', '')::timestamptz, now()) end,
    case when initial_status = 'PAID' then coalesce(nullif(input ->> 'paid_at', '')::timestamptz, now()) end,
    actor_id
  ) returning * into invoice;

  update public.promotions item
  set status = 'INVOICED', version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  perform public._emit_event(
    'Promotion', promotion.id, 'InvoiceCreated', actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'invoiceId', invoice.id,
      'invoiceNumber', invoice.invoice_number,
      'amount', invoice.amount,
      'currency', btrim(invoice.currency::text),
      'status', invoice.status
    )
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'invoice', to_jsonb(invoice));
end;
$$;

create or replace function public.set_invoice_status(
  invoice_id uuid,
  status public.invoice_status,
  invoice_number text default null,
  expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  promotion public.promotions%rowtype;
  invoice public.invoices%rowtype;
  event_name text;
  resolved_invoice_number text;
begin
  select item.* into invoice
  from public.invoices item
  where item.id = set_invoice_status.invoice_id
  for update;
  if invoice.id is null then
    perform public._domain_error('INVOICE_NOT_FOUND', 'Invoice was not found.', '{}'::jsonb, correlation_id);
  end if;
  if not public.current_user_can_invoice_promotion(invoice.promotion_id) then
    perform public._domain_error('FORBIDDEN', 'Sales or Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  if invoice.status = set_invoice_status.status then
    perform public._domain_error('INVOICE_STATUS_UNCHANGED', 'Invoice already has the requested status.', '{}'::jsonb, correlation_id);
  end if;
  if not (
    (invoice.status = 'DRAFT' and set_invoice_status.status in ('ISSUED', 'VOID', 'FAILED'))
    or (invoice.status = 'ISSUED' and set_invoice_status.status in ('PAID', 'VOID', 'FAILED'))
    or (invoice.status = 'FAILED' and set_invoice_status.status in ('DRAFT', 'VOID'))
  ) then
    perform public._domain_error(
      'INVOICE_INVALID_TRANSITION', 'Invoice status transition is not allowed.',
      jsonb_build_object('from', invoice.status, 'to', set_invoice_status.status), correlation_id
    );
  end if;
  resolved_invoice_number := coalesce(
    nullif(btrim(set_invoice_status.invoice_number), ''),
    invoice.invoice_number
  );
  if set_invoice_status.status = 'ISSUED'
    and length(btrim(coalesce(resolved_invoice_number, ''))) = 0
  then
    perform public._domain_error('INVOICE_NUMBER_REQUIRED', 'Issued invoices require an invoice number.', '{}'::jsonb, correlation_id);
  end if;

  select item.* into promotion
  from public.promotions item
  where item.id = invoice.promotion_id
  for update;
  if set_invoice_status.expected_version is not null
    and promotion.version <> set_invoice_status.expected_version
  then
    perform public._domain_error(
      'PROMOTION_VERSION_CONFLICT',
      'The promotion was changed by another user.',
      '{}'::jsonb,
      correlation_id
    );
  end if;

  update public.invoices item
  set
    status = set_invoice_status.status,
    invoice_number = case
      when set_invoice_status.status = 'ISSUED' then resolved_invoice_number
      else item.invoice_number
    end,
    issued_at = case when set_invoice_status.status = 'ISSUED' then coalesce(item.issued_at, now()) else item.issued_at end,
    paid_at = case when set_invoice_status.status = 'PAID' then coalesce(item.paid_at, now()) else item.paid_at end
  where item.id = invoice.id
  returning * into invoice;

  update public.promotions item
  set
    status = case
      when invoice.status in ('VOID', 'FAILED')
        then 'READY_FOR_INVOICING'::public.promotion_status
      else 'INVOICED'::public.promotion_status
    end,
    version = item.version + 1
  where item.id = promotion.id
  returning * into promotion;
  event_name := case invoice.status
    when 'ISSUED' then 'InvoiceIssued'
    when 'PAID' then 'InvoicePaid'
    when 'VOID' then 'InvoiceVoided'
    when 'FAILED' then 'InvoiceFailed'
    when 'DRAFT' then 'InvoiceReturnedToDraft'
  end;
  perform public._emit_event(
    'Promotion', promotion.id, event_name, actor_id, promotion.version, correlation_id,
    jsonb_build_object(
      'invoiceId', invoice.id,
      'invoiceNumber', invoice.invoice_number,
      'status', invoice.status
    )
  );
  return jsonb_build_object('promotion', public._promotion_dto(promotion), 'invoice', to_jsonb(invoice));
end;
$$;

create or replace function public.grant_user_role(user_id uuid, role_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := public._require_actor();
  correlation_id uuid := extensions.gen_random_uuid();
  role public.roles%rowtype;
begin
  if not public._user_has_role(actor_id, 'ADMINISTRATOR') then
    perform public._domain_error('FORBIDDEN', 'Administrator role is required.', '{}'::jsonb, correlation_id);
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sentient-active-administrator-invariant', 0)
  );
  if not exists (select 1 from public.profiles profile where profile.id = grant_user_role.user_id) then
    perform public._domain_error('PROFILE_NOT_FOUND', 'Profile was not found.', '{}'::jsonb, correlation_id);
  end if;
  select item.* into role from public.roles item where item.code = upper(grant_user_role.role_code);
  if role.id is null then
    perform public._domain_error('ROLE_NOT_FOUND', 'Role was not found.', '{}'::jsonb, correlation_id);
  end if;
  if grant_user_role.user_id = actor_id and role.code <> 'ADMINISTRATOR' then
    perform public._domain_error('CANNOT_REMOVE_OWN_ADMIN_ROLE', 'Administrators cannot remove their own Administrator role.', '{}'::jsonb, correlation_id);
  end if;
  if role.code <> 'ADMINISTRATOR'
    and exists (
      select 1
      from public.user_roles user_role
      join public.roles existing_role on existing_role.id = user_role.role_id and existing_role.code = 'ADMINISTRATOR'
      join public.profiles profile on profile.id = user_role.user_id and profile.status = 'ACTIVE'
      where user_role.user_id = grant_user_role.user_id
    )
    and (
      select count(*)
      from public.user_roles user_role
      join public.roles administrator_role
        on administrator_role.id = user_role.role_id
       and administrator_role.code = 'ADMINISTRATOR'
      join public.profiles administrator on administrator.id = user_role.user_id
      where administrator.status = 'ACTIVE'
    ) <= 1
  then
    perform public._domain_error('LAST_ADMINISTRATOR_REQUIRED', 'At least one active Administrator is required.', '{}'::jsonb, correlation_id);
  end if;

  delete from public.user_roles item
  where item.user_id = grant_user_role.user_id;

  insert into public.user_roles (user_id, role_id, granted_by)
  values (grant_user_role.user_id, role.id, actor_id);

  perform public._emit_event(
    'Profile', grant_user_role.user_id, 'UserRoleGranted', actor_id, null, correlation_id,
    jsonb_build_object('role', role.code)
  );
  return jsonb_build_object('user_id', grant_user_role.user_id, 'role', role.code);
end;
$$;
