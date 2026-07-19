insert into public.roles (code, name)
values
  ('ADMINISTRATOR', 'Administrator'),
  ('FINANCE', 'Finance'),
  ('SALES', 'Sales'),
  ('APPROVER', 'Approver'),
  ('CREATOR', 'Creator'),
  ('PUBLISHER', 'Publisher')
on conflict (code) do update set name = excluded.name;

insert into public.integration_connections (provider, status, configuration_json)
values
  ('MANUAL_CREATIVE_RESOURCES', 'CONFIGURED', '{"mode":"MANUAL"}'::jsonb),
  ('PUBLISHING', 'CONFIGURED', '{"mode":"MANUAL"}'::jsonb),
  ('ACCOUNTING', 'CONFIGURED', '{"mode":"MANUAL"}'::jsonb),
  ('EMAIL', 'NOT_CONFIGURED', '{"mode":"OPTIONAL"}'::jsonb),
  ('SLACK', 'NOT_CONFIGURED', '{"mode":"OPTIONAL"}'::jsonb)
on conflict (provider) do nothing;

alter table public.promotions add constraint promotions_id_client_unique unique (id, client_id);
alter table public.promotion_resource_links add constraint resource_id_promotion_unique unique (id, promotion_id);
alter table public.approval_submissions add constraint submission_id_promotion_unique unique (id, promotion_id);
alter table public.publications add constraint publication_id_promotion_unique unique (id, promotion_id);

alter table public.approval_submissions
  add constraint approval_submission_resource_same_promotion_fk
  foreign key (resource_link_id, promotion_id)
  references public.promotion_resource_links (id, promotion_id)
  on delete restrict;
alter table public.approval_decisions
  add constraint approval_decision_submission_same_promotion_fk
  foreign key (approval_submission_id, promotion_id)
  references public.approval_submissions (id, promotion_id)
  on delete restrict;
alter table public.publications
  add constraint publication_artifact_same_promotion_fk
  foreign key (artifact_resource_link_id, promotion_id)
  references public.promotion_resource_links (id, promotion_id)
  on delete restrict;
alter table public.publications
  add constraint publication_supersedes_same_promotion_fk
  foreign key (supersedes_publication_id, promotion_id)
  references public.publications (id, promotion_id)
  on delete restrict;
alter table public.publication_verifications
  add constraint verification_publication_same_promotion_fk
  foreign key (publication_id, promotion_id)
  references public.publications (id, promotion_id)
  on delete restrict;
alter table public.invoices
  add constraint invoice_client_same_as_promotion_fk
  foreign key (promotion_id, client_id)
  references public.promotions (id, client_id)
  on delete restrict;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.clients enable row level security;
alter table public.promotions enable row level security;
alter table public.promotion_resource_links enable row level security;
alter table public.promotion_assignments enable row level security;
alter table public.approval_submissions enable row level security;
alter table public.approval_decisions enable row level security;
alter table public.publications enable row level security;
alter table public.publication_verifications enable row level security;
alter table public.invoices enable row level security;
alter table public.comments enable row level security;
alter table public.audit_log enable row level security;
alter table public.outbox_events enable row level security;
alter table public.inbox_events enable row level security;
alter table public.notifications enable row level security;
alter table public.integration_connections enable row level security;
alter table public.integration_attempts enable row level security;

alter table public.profiles force row level security;
alter table public.roles force row level security;
alter table public.user_roles force row level security;
alter table public.clients force row level security;
alter table public.promotions force row level security;
alter table public.promotion_resource_links force row level security;
alter table public.promotion_assignments force row level security;
alter table public.approval_submissions force row level security;
alter table public.approval_decisions force row level security;
alter table public.publications force row level security;
alter table public.publication_verifications force row level security;
alter table public.invoices force row level security;
alter table public.comments force row level security;
alter table public.audit_log force row level security;
alter table public.outbox_events force row level security;
alter table public.inbox_events force row level security;
alter table public.notifications force row level security;
alter table public.integration_connections force row level security;
alter table public.integration_attempts force row level security;

create policy profiles_select on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.current_user_has_role('ADMINISTRATOR')
  or (status = 'ACTIVE' and public.current_user_has_any_role())
);

create policy roles_select on public.roles
for select to authenticated
using (public.current_user_has_any_role());

create policy user_roles_select on public.user_roles
for select to authenticated
using (
  user_id = auth.uid()
  or public.current_user_has_role('ADMINISTRATOR')
  or public.current_user_has_any_role()
);

create policy clients_select on public.clients
for select to authenticated
using (public.current_user_has_any_role());

create policy promotions_select on public.promotions
for select to authenticated
using (public.current_user_can_view_promotion(id));

create policy promotion_resource_links_select on public.promotion_resource_links
for select to authenticated
using (public.current_user_can_view_promotion(promotion_id));

create policy promotion_assignments_select on public.promotion_assignments
for select to authenticated
using (public.current_user_can_view_promotion(promotion_id));

create policy approval_submissions_select on public.approval_submissions
for select to authenticated
using (public.current_user_can_view_promotion(promotion_id));

create policy approval_decisions_select on public.approval_decisions
for select to authenticated
using (public.current_user_can_view_promotion(promotion_id));

create policy publications_select on public.publications
for select to authenticated
using (public.current_user_can_view_promotion(promotion_id));

create policy publication_verifications_select on public.publication_verifications
for select to authenticated
using (public.current_user_can_view_promotion(promotion_id));

create policy invoices_select on public.invoices
for select to authenticated
using (
  public.current_user_can_view_promotion(promotion_id)
  or public.current_user_can_invoice_promotion(promotion_id)
);

create policy comments_select on public.comments
for select to authenticated
using (public.current_user_can_view_promotion(promotion_id));

create policy comments_insert on public.comments
for insert to authenticated
with check (
  author_id = auth.uid()
  and public.current_user_can_view_promotion(promotion_id)
);

create policy comments_update_own on public.comments
for update to authenticated
using (author_id = auth.uid() and public.current_user_can_view_promotion(promotion_id))
with check (author_id = auth.uid() and public.current_user_can_view_promotion(promotion_id));

create policy audit_log_select on public.audit_log
for select to authenticated
using (
  public.current_user_has_role('ADMINISTRATOR')
  or (
    aggregate_type = 'Promotion'
    and public.current_user_can_view_promotion(aggregate_id)
  )
  or (
    aggregate_type = 'Client'
    and (
      public.current_user_has_role('SALES')
      or public.current_user_has_role('FINANCE')
    )
  )
);

create policy outbox_events_admin_select on public.outbox_events
for select to authenticated
using (public.current_user_has_role('ADMINISTRATOR'));

create policy inbox_events_admin_select on public.inbox_events
for select to authenticated
using (public.current_user_has_role('ADMINISTRATOR'));

create policy notifications_select on public.notifications
for select to authenticated
using (
  public.current_user_has_any_role()
  and (
    user_id = auth.uid()
    or public.current_user_has_role('ADMINISTRATOR')
  )
);

create policy integration_connections_admin_select on public.integration_connections
for select to authenticated
using (public.current_user_has_role('ADMINISTRATOR'));

create policy integration_attempts_admin_select on public.integration_attempts
for select to authenticated
using (public.current_user_has_role('ADMINISTRATOR'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'promotion-assets',
  'promotion-assets',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy promotion_assets_select on storage.objects
for select to authenticated
using (
  bucket_id = 'promotion-assets'
  and public.safe_uuid((storage.foldername(name))[1]) is not null
  and public.current_user_can_view_promotion(
    public.safe_uuid((storage.foldername(name))[1])
  )
);

create policy promotion_assets_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'promotion-assets'
  and array_length(storage.foldername(name), 1) = 2
  and public.safe_uuid((storage.foldername(name))[1]) is not null
  and public.safe_uuid((storage.foldername(name))[2]) is not null
  and name !~ '(^|/)[.][.](/|$)'
  and name ~ '^[^/]+/[^/]+/[A-Za-z0-9][A-Za-z0-9._-]{0,179}$'
  and public.current_user_can_upload_promotion_asset(
    public.safe_uuid((storage.foldername(name))[1])
  )
  and exists (
    select 1
    from public.promotion_resource_links resource
    where resource.id = public.safe_uuid((storage.foldername(name))[2])
      and resource.promotion_id = public.safe_uuid((storage.foldername(name))[1])
      and resource.provider = 'SUPABASE_STORAGE'
      and resource.url = name
      and resource.archived_at is null
  )
);

revoke all on all tables in schema public from anon, authenticated;
grant select on table
  public.profiles,
  public.roles,
  public.user_roles,
  public.clients,
  public.promotions,
  public.promotion_resource_links,
  public.promotion_assignments,
  public.approval_submissions,
  public.approval_decisions,
  public.publications,
  public.publication_verifications,
  public.invoices,
  public.comments,
  public.audit_log,
  public.notifications,
  public.approval_submission_state,
  public.current_publications
to authenticated;
grant insert on public.comments to authenticated;
grant update (body, edited_at, deleted_at) on public.comments to authenticated;

grant all privileges on all tables in schema public to service_role;

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.current_user_has_role(text) to authenticated;
grant execute on function public.current_user_has_any_role() to authenticated;
grant execute on function public.current_user_can_view_promotion(uuid) to authenticated;
grant execute on function public.current_user_can_manage_promotion(uuid) to authenticated;
grant execute on function public.current_user_can_approve_promotion(uuid) to authenticated;
grant execute on function public.current_user_can_publish_promotion(uuid) to authenticated;
grant execute on function public.current_user_can_invoice_promotion(uuid) to authenticated;
grant execute on function public.current_user_can_upload_promotion_asset(uuid) to authenticated;
grant execute on function public.safe_uuid(text) to authenticated;
grant execute on function public.get_promotion_allowed_actions(uuid) to authenticated;
grant execute on function public.get_operations_health() to authenticated;

grant execute on function public.create_client(jsonb) to authenticated;
grant execute on function public.update_client(uuid, jsonb) to authenticated;
grant execute on function public.archive_client(uuid) to authenticated;
grant execute on function public.set_profile_status(uuid, public.profile_status) to authenticated;
grant execute on function public.grant_user_role(uuid, text) to authenticated;
grant execute on function public.revoke_user_role(uuid, text) to authenticated;
grant execute on function public.replace_user_roles(uuid, text[]) to authenticated;
grant execute on function public.create_promotion(jsonb) to authenticated;
grant execute on function public.update_promotion(uuid, integer, jsonb) to authenticated;
grant execute on function public.cancel_promotion(uuid, integer, text) to authenticated;
grant execute on function public.assign_promotion_role(uuid, public.assignment_role, uuid, integer) to authenticated;
grant execute on function public.start_creative_work(uuid, integer) to authenticated;
grant execute on function public.attach_resource_link(uuid, jsonb) to authenticated;
grant execute on function public.finalize_private_asset(uuid) to authenticated;
grant execute on function public.archive_resource_link(uuid) to authenticated;
grant execute on function public.submit_for_approval(uuid, uuid, integer) to authenticated;
grant execute on function public.decide_approval(uuid, public.approval_decision, text, integer) to authenticated;
grant execute on function public.start_publishing(uuid, integer) to authenticated;
grant execute on function public.record_publication(uuid, jsonb, integer) to authenticated;
grant execute on function public.request_publication_verification(uuid, integer) to authenticated;
grant execute on function public.record_publication_verification(uuid, jsonb, integer) to authenticated;
grant execute on function public.complete_verified_workflow(uuid, integer) to authenticated;
grant execute on function public.create_invoice(uuid, jsonb, integer) to authenticated;
grant execute on function public.set_invoice_status(
  uuid, public.invoice_status, text, integer
) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.retry_outbox_event(uuid) to authenticated;

grant execute on function public.claim_outbox_events(text, integer) to service_role;
grant execute on function public.complete_outbox_event(uuid, text) to service_role;
grant execute on function public.fail_outbox_event(uuid, text, text) to service_role;
grant execute on function public.record_automated_publication_verification(
  uuid, jsonb, integer
) to service_role;
