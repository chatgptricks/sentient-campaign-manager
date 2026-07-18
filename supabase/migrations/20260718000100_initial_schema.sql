create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.profile_status as enum ('ACTIVE', 'INVITED', 'SUSPENDED');
create type public.promotion_status as enum (
  'DRAFT',
  'CREATOR_ASSIGNED',
  'CREATIVE_IN_PROGRESS',
  'SUBMITTED_FOR_APPROVAL',
  'REVISION_REQUESTED',
  'APPROVED',
  'PUBLISHER_ASSIGNED',
  'PUBLISHING_IN_PROGRESS',
  'PUBLISHED',
  'VERIFICATION_PENDING',
  'VERIFIED',
  'READY_FOR_INVOICING',
  'INVOICED',
  'CANCELLED'
);
create type public.resource_provider as enum (
  'CANVA', 'GOOGLE_DRIVE', 'DROPBOX', 'SUPABASE_STORAGE', 'OTHER'
);
create type public.resource_validation_status as enum (
  'PENDING', 'VALID', 'INVALID', 'UNAVAILABLE'
);
create type public.assignment_role as enum (
  'SALES_OWNER', 'CREATOR', 'APPROVER', 'PUBLISHER'
);
create type public.assignment_event as enum ('ASSIGNED', 'UNASSIGNED');
create type public.approval_decision as enum ('APPROVED', 'REVISION_REQUESTED');
create type public.publication_event as enum ('PUBLISHED', 'REMOVED', 'FAILED');
create type public.verification_status as enum ('VERIFIED', 'FAILED', 'UNAVAILABLE');
create type public.invoice_status as enum ('DRAFT', 'ISSUED', 'PAID', 'VOID', 'FAILED');
create type public.outbox_status as enum (
  'PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER'
);
create type public.inbox_status as enum (
  'RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED'
);
create type public.notification_channel as enum ('IN_APP', 'EMAIL', 'SLACK');
create type public.notification_status as enum ('PENDING', 'SENT', 'FAILED');
create type public.integration_connection_status as enum (
  'NOT_CONFIGURED', 'CONFIGURED', 'HEALTHY', 'DEGRADED', 'DISABLED'
);
create type public.integration_attempt_status as enum (
  'PENDING', 'SUCCEEDED', 'FAILED', 'RETRYING'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null check (length(btrim(email)) > 3),
  display_name text not null check (length(btrim(display_name)) > 0),
  status public.profile_status not null default 'INVITED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default extensions.gen_random_uuid(),
  code text unique not null check (
    code in ('SALES', 'CREATOR', 'APPROVER', 'PUBLISHER', 'FINANCE', 'ADMINISTRATOR')
  ),
  name text not null check (length(btrim(name)) > 0)
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete restrict,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.clients (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  billing_email text,
  billing_address text,
  external_accounting_id text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint clients_billing_email_format check (
    billing_email is null or billing_email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  )
);

create table public.promotions (
  id uuid primary key default extensions.gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  description text,
  status public.promotion_status not null default 'DRAFT',
  sales_owner_id uuid not null references public.profiles (id) on delete restrict,
  creator_id uuid references public.profiles (id) on delete restrict,
  approver_id uuid references public.profiles (id) on delete restrict,
  publisher_id uuid references public.profiles (id) on delete restrict,
  due_date date,
  version integer not null default 1 check (version >= 1),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancellation_reason text,
  constraint promotions_cancellation_consistency check (
    (
      status = 'CANCELLED'
      and cancelled_at is not null
      and cancellation_reason is not null
      and length(btrim(cancellation_reason)) > 0
    )
    or
    (status <> 'CANCELLED' and cancelled_at is null and cancellation_reason is null)
  )
);

create table public.promotion_resource_links (
  id uuid primary key default extensions.gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete restrict,
  provider public.resource_provider not null,
  resource_type text not null check (length(btrim(resource_type)) > 0),
  external_id text,
  url text not null check (length(btrim(url)) > 0),
  display_name text not null check (length(btrim(display_name)) > 0),
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  validation_status public.resource_validation_status not null default 'PENDING',
  validation_message text,
  attached_by uuid not null references public.profiles (id) on delete restrict,
  attached_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint promotion_resource_links_external_https check (
    provider = 'SUPABASE_STORAGE' or url ~* '^https://[^[:space:]]+$'
  )
);

create table public.promotion_assignments (
  id uuid primary key default extensions.gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete restrict,
  role_type public.assignment_role not null,
  event_type public.assignment_event not null,
  assigned_user_id uuid references public.profiles (id) on delete restrict,
  performed_by uuid not null references public.profiles (id) on delete restrict,
  replaces_assignment_id uuid references public.promotion_assignments (id) on delete restrict,
  occurred_at timestamptz not null default now(),
  constraint promotion_assignments_user_required check (
    event_type = 'UNASSIGNED' or assigned_user_id is not null
  )
);

create table public.approval_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete restrict,
  submission_number integer not null check (submission_number >= 1),
  resource_link_id uuid not null references public.promotion_resource_links (id) on delete restrict,
  submitted_by uuid not null references public.profiles (id) on delete restrict,
  submitted_at timestamptz not null default now(),
  unique (promotion_id, submission_number)
);

create table public.approval_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  approval_submission_id uuid not null unique references public.approval_submissions (id) on delete restrict,
  promotion_id uuid not null references public.promotions (id) on delete restrict,
  decision public.approval_decision not null,
  comments text,
  decided_by uuid not null references public.profiles (id) on delete restrict,
  decided_at timestamptz not null default now(),
  constraint approval_decisions_revision_comment check (
    decision <> 'REVISION_REQUESTED'
    or (comments is not null and length(btrim(comments)) > 0)
  )
);

create table public.publications (
  id uuid primary key default extensions.gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete restrict,
  provider text not null check (length(btrim(provider)) > 0),
  destination text not null check (length(btrim(destination)) > 0),
  external_publication_id text,
  publication_url text not null check (publication_url ~* '^https://[^[:space:]]+$'),
  artifact_resource_link_id uuid not null references public.promotion_resource_links (id) on delete restrict,
  published_by uuid not null references public.profiles (id) on delete restrict,
  published_at timestamptz not null,
  event_type public.publication_event not null default 'PUBLISHED',
  supersedes_publication_id uuid references public.publications (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint publications_no_self_supersede check (supersedes_publication_id is null or supersedes_publication_id <> id)
);

create table public.publication_verifications (
  id uuid primary key default extensions.gen_random_uuid(),
  publication_id uuid not null references public.publications (id) on delete restrict,
  promotion_id uuid not null references public.promotions (id) on delete restrict,
  status public.verification_status not null,
  details_json jsonb not null default '{}'::jsonb check (jsonb_typeof(details_json) = 'object'),
  verified_by uuid references public.profiles (id) on delete restrict,
  verification_method text not null check (
    verification_method in ('MANUAL', 'PROVIDER_API', 'AUTOMATED_CHECK')
  ),
  verified_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default extensions.gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete restrict,
  client_id uuid not null references public.clients (id) on delete restrict,
  invoice_number text,
  external_invoice_id text,
  amount numeric(12, 2) not null check (amount > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status public.invoice_status not null default 'DRAFT',
  issued_at timestamptz,
  paid_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_issued_consistency check (
    status not in ('ISSUED', 'PAID') or issued_at is not null
  ),
  constraint invoices_paid_consistency check (
    status <> 'PAID' or paid_at is not null
  )
);

create table public.comments (
  id uuid primary key default extensions.gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete restrict,
  author_id uuid not null references public.profiles (id) on delete restrict,
  body text not null check (length(btrim(body)) > 0),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

create table public.audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  aggregate_type text not null check (length(btrim(aggregate_type)) > 0),
  aggregate_id uuid not null,
  event_type text not null check (length(btrim(event_type)) > 0),
  actor_id uuid references public.profiles (id) on delete restrict,
  correlation_id uuid not null,
  aggregate_version integer check (aggregate_version is null or aggregate_version >= 1),
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now()
);

create table public.outbox_events (
  id uuid primary key default extensions.gen_random_uuid(),
  aggregate_type text not null check (length(btrim(aggregate_type)) > 0),
  aggregate_id uuid not null,
  event_type text not null check (length(btrim(event_type)) > 0),
  payload_json jsonb not null check (jsonb_typeof(payload_json) = 'object'),
  status public.outbox_status not null default 'PENDING',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.inbox_events (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null check (length(btrim(provider)) > 0),
  external_event_id text not null check (length(btrim(external_event_id)) > 0),
  payload_checksum text not null check (length(btrim(payload_checksum)) > 0),
  payload_json jsonb not null check (jsonb_typeof(payload_json) in ('object', 'array')),
  status public.inbox_status not null default 'RECEIVED',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, external_event_id)
);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  promotion_id uuid references public.promotions (id) on delete restrict,
  type text not null check (length(btrim(type)) > 0),
  channel public.notification_channel not null default 'IN_APP',
  subject text not null check (length(btrim(subject)) > 0),
  body text not null check (length(btrim(body)) > 0),
  status public.notification_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz
);

create table public.integration_connections (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text unique not null check (length(btrim(provider)) > 0),
  status public.integration_connection_status not null default 'NOT_CONFIGURED',
  secret_reference text,
  configuration_json jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration_json) = 'object'),
  last_tested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_connections_secret_not_literal check (
    secret_reference is null
    or secret_reference ~ '^(vault|secret)://[A-Za-z0-9._/-]+$'
  )
);

create table public.integration_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null check (length(btrim(provider)) > 0),
  operation text not null check (length(btrim(operation)) > 0),
  aggregate_id uuid,
  idempotency_key text not null unique check (length(btrim(idempotency_key)) > 0),
  status public.integration_attempt_status not null,
  request_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(request_metadata) = 'object'),
  response_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(response_metadata) = 'object'),
  error_code text,
  created_at timestamptz not null default now()
);

create index profiles_email_lower_idx on public.profiles (lower(email));
create index profiles_status_idx on public.profiles (status);
create index user_roles_role_id_idx on public.user_roles (role_id, user_id);
create index clients_name_lower_idx on public.clients (lower(name));
create index clients_name_search_idx on public.clients using gin (name extensions.gin_trgm_ops);
create index clients_billing_email_idx on public.clients (lower(billing_email)) where billing_email is not null;
create index clients_archived_at_idx on public.clients (archived_at);
create index promotions_client_id_idx on public.promotions (client_id);
create index promotions_status_idx on public.promotions (status);
create index promotions_sales_owner_id_idx on public.promotions (sales_owner_id);
create index promotions_creator_id_idx on public.promotions (creator_id) where creator_id is not null;
create index promotions_approver_id_idx on public.promotions (approver_id) where approver_id is not null;
create index promotions_publisher_id_idx on public.promotions (publisher_id) where publisher_id is not null;
create index promotions_due_date_idx on public.promotions (due_date) where due_date is not null;
create index promotions_created_at_idx on public.promotions (created_at desc);
create index promotions_title_search_idx on public.promotions using gin (title extensions.gin_trgm_ops);
create index promotion_resource_links_promotion_idx on public.promotion_resource_links (promotion_id, attached_at desc);
create index promotion_resource_links_validation_idx on public.promotion_resource_links (validation_status);
create index promotion_assignments_promotion_idx on public.promotion_assignments (promotion_id, role_type, occurred_at desc);
create index promotion_assignments_user_idx on public.promotion_assignments (assigned_user_id) where assigned_user_id is not null;
create index approval_submissions_promotion_idx on public.approval_submissions (promotion_id, submission_number desc);
create index approval_submissions_resource_idx on public.approval_submissions (resource_link_id);
create index approval_decisions_promotion_idx on public.approval_decisions (promotion_id, decided_at desc);
create index publications_promotion_idx on public.publications (promotion_id, published_at desc);
create index publications_supersedes_idx on public.publications (supersedes_publication_id) where supersedes_publication_id is not null;
create index publication_verifications_publication_idx on public.publication_verifications (publication_id, verified_at desc);
create index publication_verifications_promotion_idx on public.publication_verifications (promotion_id, verified_at desc);
create index invoices_promotion_idx on public.invoices (promotion_id);
create index invoices_client_idx on public.invoices (client_id, created_at desc);
create unique index invoices_one_active_per_promotion_idx
  on public.invoices (promotion_id)
  where status not in ('VOID', 'FAILED');
create index comments_promotion_idx on public.comments (promotion_id, created_at);
create index audit_log_aggregate_idx on public.audit_log (aggregate_type, aggregate_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc) where actor_id is not null;
create index audit_log_correlation_idx on public.audit_log (correlation_id);
create index outbox_events_claim_idx on public.outbox_events (status, available_at, created_at)
  where status in ('PENDING', 'FAILED');
create index outbox_events_aggregate_idx on public.outbox_events (aggregate_type, aggregate_id, created_at desc);
create index inbox_events_status_idx on public.inbox_events (status, received_at);
create index notifications_user_idx on public.notifications (user_id, status, created_at desc);
create index notifications_promotion_idx on public.notifications (promotion_id, created_at desc) where promotion_id is not null;
create index integration_attempts_provider_idx on public.integration_attempts (provider, created_at desc);
create index integration_attempts_aggregate_idx on public.integration_attempts (aggregate_id, created_at desc) where aggregate_id is not null;

create view public.approval_submission_state
with (security_invoker = true)
as
select
  submission.id,
  submission.promotion_id,
  submission.submission_number,
  submission.resource_link_id,
  submission.submitted_by,
  submission.submitted_at,
  case
    when exists (
      select 1
      from public.approval_submissions newer
      where newer.promotion_id = submission.promotion_id
        and newer.submission_number > submission.submission_number
    ) then 'SUPERSEDED'
    when decision.decision = 'APPROVED' then 'APPROVED'
    when decision.decision = 'REVISION_REQUESTED' then 'REVISION_REQUESTED'
    else 'PENDING'
  end as state,
  decision.id as decision_id,
  decision.comments,
  decision.decided_by,
  decision.decided_at
from public.approval_submissions submission
left join public.approval_decisions decision
  on decision.approval_submission_id = submission.id;

create view public.current_publications
with (security_invoker = true)
as
with recursive lineage as (
  select publication.id as row_id, publication.id as root_publication_id
  from public.publications publication
  where publication.supersedes_publication_id is null
  union all
  select child.id, lineage.root_publication_id
  from public.publications child
  join lineage on child.supersedes_publication_id = lineage.row_id
), ranked as (
  select
    publication.*,
    lineage.root_publication_id,
    row_number() over (
      partition by lineage.root_publication_id
      order by publication.published_at desc, publication.created_at desc, publication.id desc
    ) as sequence_rank
  from lineage
  join public.publications publication on publication.id = lineage.row_id
)
select
  id,
  root_publication_id,
  promotion_id,
  provider,
  destination,
  external_publication_id,
  publication_url,
  artifact_resource_link_id,
  published_by,
  published_at,
  event_type,
  supersedes_publication_id,
  created_at
from ranked
where sequence_rank = 1;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
for each row execute function public.set_updated_at();
create trigger promotions_set_updated_at before update on public.promotions
for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices
for each row execute function public.set_updated_at();
create trigger integration_connections_set_updated_at before update on public.integration_connections
for each row execute function public.set_updated_at();

create function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  insert into public.profiles (id, email, display_name, status)
  values (
    new.id,
    coalesce(new.email, new.id::text || '@invalid.local'),
    profile_name,
    case when new.email_confirmed_at is null then 'INVITED'::public.profile_status else 'ACTIVE'::public.profile_status end
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = case
      when public.profiles.display_name = '' then excluded.display_name
      else public.profiles.display_name
    end,
    status = case
      when public.profiles.status = 'SUSPENDED' then public.profiles.status
      when new.email_confirmed_at is not null then 'ACTIVE'::public.profile_status
      else public.profiles.status
    end;

  return new;
end;
$$;

create trigger on_auth_user_profile_change
after insert or update of email, email_confirmed_at, raw_user_meta_data on auth.users
for each row execute function public.handle_auth_user_profile();

create function public.reject_immutable_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'IMMUTABLE_HISTORY',
    detail = format('%I is append-only', tg_table_name);
end;
$$;

create trigger promotion_assignments_immutable before update or delete on public.promotion_assignments
for each row execute function public.reject_immutable_change();
create trigger approval_submissions_immutable before update or delete on public.approval_submissions
for each row execute function public.reject_immutable_change();
create trigger approval_decisions_immutable before update or delete on public.approval_decisions
for each row execute function public.reject_immutable_change();
create trigger publications_immutable before update or delete on public.publications
for each row execute function public.reject_immutable_change();
create trigger publication_verifications_immutable before update or delete on public.publication_verifications
for each row execute function public.reject_immutable_change();
create trigger audit_log_immutable before update or delete on public.audit_log
for each row execute function public.reject_immutable_change();
create trigger integration_attempts_immutable before update or delete on public.integration_attempts
for each row execute function public.reject_immutable_change();

comment on table public.promotion_assignments is 'Append-only assignment history. Current assignees are projected on promotions.';
comment on table public.approval_submissions is 'Append-only numbered creative submissions.';
comment on table public.approval_decisions is 'Append-only final decision per creative submission.';
comment on table public.publications is 'Append-only publication evidence and superseding lifecycle events.';
comment on table public.publication_verifications is 'Append-only publication verification attempts.';
comment on table public.audit_log is 'Immutable business audit log written transactionally by commands.';
comment on table public.outbox_events is 'Transactional outbox consumed by server-side workers.';
comment on column public.integration_connections.secret_reference is 'Reference to Vault or an Edge Function secret; never a credential value.';
