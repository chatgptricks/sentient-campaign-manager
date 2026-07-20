-- Production cleanup requested on 2026-07-20.
-- Keep users, roles, channels, publishing accounts, and integration configuration.
-- Remove all existing client/promotion workflow data.
truncate table
  public.publication_verifications,
  public.publications,
  public.approval_decisions,
  public.approval_submissions,
  public.promotion_resource_links,
  public.promotion_assignments,
  public.campaign_metadata,
  public.invoices,
  public.comments,
  public.notifications,
  public.audit_log,
  public.outbox_events,
  public.inbox_events,
  public.idempotency_ledger,
  public.clients,
  public.promotions
restart identity cascade;
