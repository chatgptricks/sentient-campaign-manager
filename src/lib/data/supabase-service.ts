import type {
  ActivityEvent,
  ApprovalSubmission,
  CampaignMetadata,
  Client,
  DashboardData,
  IntegrationConnection,
  Invoice,
  Notification,
  Profile,
  Promotion,
  PromotionAction,
  PublishingAccount,
  Publication,
  PublicationVerification,
  ResourceLink,
} from '../../domain/models';
import { promotionStatuses, type PromotionStatus } from '../../domain/promotion-status';
import { hasRole, type RoleCode } from '../../domain/permissions';
import { DomainError } from '../../domain/errors';
import { supabase } from '../supabase/client';
import type {
  ApprovalDecisionInput,
  ClientInput,
  InvoiceInput,
  PromotionInput,
  PublicationInput,
  ResourceLinkInput,
  VerificationInput,
  CampaignMetadataInput,
} from '../validation/schemas';
import type { AssignmentRole, CampaignService, ListPromotionsInput } from './service';
import { createPrivateAssetDescriptor } from './private-assets';
import { assertFunctionSuccess } from './function-errors';

type Row = Record<string, unknown>;

function asRow(value: unknown): Row {
  return value && typeof value === 'object' ? (value as Row) : {};
}

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function nullableText(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function requestHeaders(scope: string) {
  return { 'idempotency-key': `${scope}:${crypto.randomUUID()}` };
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === 'number' ? value : fallback;
}

function relation(value: unknown) {
  if (Array.isArray(value)) return asRow(value[0]);
  return asRow(value);
}

function relationName(value: unknown) {
  return textValue(relation(value).display_name, 'Unassigned');
}

function isPromotionStatus(value: unknown): value is PromotionStatus {
  return typeof value === 'string' && promotionStatuses.includes(value as PromotionStatus);
}

function actionList(value: unknown): PromotionAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PromotionAction => typeof item === 'string');
}

function mapPromotion(raw: unknown): Promotion {
  const row = asRow(raw);
  const status = isPromotionStatus(row.status) ? row.status : 'DRAFT';
  return {
    id: textValue(row.id),
    clientId: textValue(row.client_id),
    clientName: textValue(relation(row.client).name, 'Unknown client'),
    title: textValue(row.title, 'Untitled promotion'),
    description: nullableText(row.description),
    status,
    salesOwnerId: textValue(row.sales_owner_id),
    salesOwnerName: relationName(row.sales_owner),
    creatorId: nullableText(row.creator_id),
    creatorName: row.creator_id ? relationName(row.creator) : null,
    approverId: nullableText(row.approver_id),
    approverName: row.approver_id ? relationName(row.approver) : null,
    publisherId: nullableText(row.publisher_id),
    publisherName: row.publisher_id ? relationName(row.publisher) : null,
    dueDate: nullableText(row.due_date),
    version: numberValue(row.version, 1),
    createdAt: textValue(row.created_at),
    updatedAt: textValue(row.updated_at),
    cancellationReason: nullableText(row.cancellation_reason),
    allowedActions: actionList(row.allowed_actions),
  };
}

function mapClient(raw: unknown): Client {
  const row = asRow(raw);
  return {
    id: textValue(row.id),
    name: textValue(row.name),
    billingEmail: nullableText(row.billing_email),
    billingAddress: nullableText(row.billing_address),
    externalAccountingId: nullableText(row.external_accounting_id),
    createdAt: textValue(row.created_at),
    updatedAt: textValue(row.updated_at),
    archivedAt: nullableText(row.archived_at),
  };
}

function mapCampaignMetadata(raw: unknown): CampaignMetadata {
  const row = asRow(raw);
  const stringArray = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  const jsonLinks = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  return {
    promotionId: textValue(row.promotion_id),
    campaignType: textValue(row.campaign_type, 'Social promotion'),
    scheduledDate: nullableText(row.scheduled_date),
    priority: textValue(row.priority, 'NORMAL') as CampaignMetadata['priority'],
    briefUrl: nullableText(row.brief_url),
    clientMaterialLinks: jsonLinks(row.client_material_links),
    externalResourceLinks: jsonLinks(row.external_resource_links),
    platforms: stringArray(row.platforms),
    publishingAccountIds: stringArray(row.publishing_account_ids),
    externalPartnerAccountIds: stringArray(row.external_partner_account_ids),
    internalNotes: nullableText(row.internal_notes),
  };
}

function mapPublishingAccount(raw: unknown): PublishingAccount {
  const row = asRow(raw);
  return {
    id: textValue(row.id),
    platform: textValue(row.platform, 'INSTAGRAM') as PublishingAccount['platform'],
    accountName: textValue(row.account_name),
    handle: textValue(row.handle),
    accountUrl: textValue(row.account_url),
    ownershipType: textValue(
      row.ownership_type,
      'SENTIENT_OWNED',
    ) as PublishingAccount['ownershipType'],
    partnerName: nullableText(row.partner_name),
    active: row.active !== false,
    defaultPublisherName: row.default_publisher ? relationName(row.default_publisher) : null,
    notes: nullableText(row.notes),
  };
}

function mapResource(raw: unknown): ResourceLink {
  const row = asRow(raw);
  const provider = textValue(row.provider, 'OTHER') as ResourceLink['provider'];
  const validationStatus = textValue(
    row.validation_status,
    'PENDING',
  ) as ResourceLink['validationStatus'];
  return {
    id: textValue(row.id),
    promotionId: textValue(row.promotion_id),
    provider,
    resourceType: textValue(row.resource_type),
    url: textValue(row.url),
    storagePath:
      provider === 'SUPABASE_STORAGE'
        ? textValue(row.external_id) || textValue(row.url) || null
        : null,
    displayName: textValue(row.display_name),
    validationStatus,
    validationMessage: nullableText(row.validation_message),
    attachedByName: relationName(row.attached_by_profile),
    attachedAt: textValue(row.attached_at),
    archivedAt: nullableText(row.archived_at),
  };
}

function mapSubmission(raw: unknown): ApprovalSubmission {
  const row = asRow(raw);
  const decisions = Array.isArray(row.decisions) ? row.decisions.map(asRow) : [];
  const decision = decisions[0];
  return {
    id: textValue(row.id),
    promotionId: textValue(row.promotion_id),
    submissionNumber: numberValue(row.submission_number),
    resourceLinkId: textValue(row.resource_link_id),
    resourceName: textValue(relation(row.resource).display_name, 'Creative resource'),
    submittedBy: textValue(row.submitted_by),
    submittedByName: relationName(row.submitter),
    submittedAt: textValue(row.submitted_at),
    state: textValue(
      row.derived_state ?? row.state,
      decision?.decision ? textValue(decision.decision) : 'PENDING',
    ) as ApprovalSubmission['state'],
    decisionComments: nullableText(decision?.comments),
    decidedByName: decision ? relationName(decision.decider) : null,
    decidedAt: nullableText(decision?.decided_at),
  };
}

function mapPublicationVerification(raw: unknown): PublicationVerification {
  const row = asRow(raw);
  return {
    id: textValue(row.id),
    publicationId: textValue(row.publication_id),
    promotionId: textValue(row.promotion_id),
    status: textValue(row.status) as PublicationVerification['status'],
    details: asRow(row.details_json),
    method: textValue(row.verification_method, 'MANUAL') as PublicationVerification['method'],
    verifiedAt: textValue(row.verified_at),
  };
}

function mapPublication(raw: unknown): Publication {
  const row = asRow(raw);
  const verifications = Array.isArray(row.verifications)
    ? row.verifications.map(mapPublicationVerification)
    : [];
  const verification = verifications[0];
  return {
    id: textValue(row.id),
    promotionId: textValue(row.promotion_id),
    provider: textValue(row.provider),
    destination: textValue(row.destination),
    publicationUrl: textValue(row.publication_url),
    externalPublicationId: nullableText(row.external_publication_id),
    artifactResourceLinkId: textValue(row.artifact_resource_link_id),
    artifactName: textValue(relation(row.artifact).display_name, 'Approved creative'),
    publishedByName: relationName(row.publisher),
    publishedAt: textValue(row.published_at),
    verificationStatus: verification?.status ?? null,
    verifiedAt: verification?.verifiedAt ?? null,
    verifications,
  };
}

function mapInvoice(raw: unknown): Invoice {
  const row = asRow(raw);
  return {
    id: textValue(row.id),
    promotionId: textValue(row.promotion_id),
    clientId: textValue(row.client_id),
    invoiceNumber: nullableText(row.invoice_number),
    amount: numberValue(row.amount),
    currency: textValue(row.currency, 'USD'),
    status: textValue(row.status, 'DRAFT') as Invoice['status'],
    issuedAt: nullableText(row.issued_at),
    paidAt: nullableText(row.paid_at),
    createdAt: textValue(row.created_at),
  };
}

function mapActivity(raw: unknown): ActivityEvent {
  const row = asRow(raw);
  return {
    id: textValue(row.id),
    eventType: textValue(row.event_type),
    actorName: row.actor_id ? relationName(row.actor) : null,
    createdAt: textValue(row.created_at),
    correlationId: textValue(row.correlation_id),
    metadata: asRow(row.metadata_json),
  };
}

function mapNotification(raw: unknown): Notification {
  const row = asRow(raw);
  return {
    id: textValue(row.id),
    promotionId: nullableText(row.promotion_id),
    type: textValue(row.type),
    channel: textValue(row.channel, 'IN_APP') as Notification['channel'],
    subject: textValue(row.subject),
    body: textValue(row.body),
    status: textValue(row.status, 'PENDING') as Notification['status'],
    createdAt: textValue(row.created_at),
    readAt: nullableText(row.read_at),
  };
}

function assertSuccess(error: { message: string; code?: string; details?: string } | null) {
  if (!error) return;
  const stableCode = /^[A-Z][A-Z0-9_]+$/.test(error.message)
    ? error.message
    : (error.code ?? 'DATA_ERROR');
  if (error.details?.includes('{')) {
    try {
      const payload = asRow(JSON.parse(error.details));
      throw new DomainError({
        code: stableCode,
        message: textValue(payload.message, error.message),
        details: asRow(payload.details),
        correlationId: nullableText(payload.correlationId) ?? undefined,
      });
    } catch (caught) {
      if (caught instanceof DomainError) throw caught;
    }
  }
  throw new DomainError({ code: stableCode, message: error.message });
}

async function callRpc(name: string, input: Row) {
  const { data, error } = await supabase.rpc(name, input);
  assertSuccess(error);
  return data;
}

async function persistCampaignMetadata(id: string, input: CampaignMetadataInput) {
  const data = await callRpc('upsert_campaign_metadata', {
    promotion_id: id,
    input: {
      campaign_type: input.campaignType,
      scheduled_date: input.scheduledDate || null,
      priority: input.priority,
      brief_url: input.briefUrl || null,
      client_material_links: input.clientMaterialLinks
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
      external_resource_links: input.externalResourceLinks
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
      platforms: input.platforms,
      publishing_account_ids: input.publishingAccountIds,
      external_partner_account_ids: input.externalPartnerAccountIds,
      internal_notes: input.internalNotes || null,
    },
  });
  return mapCampaignMetadata(data);
}

const promotionSelect = `
  *,
  client:clients!promotions_client_id_fkey(name),
  sales_owner:profiles!promotions_sales_owner_id_fkey(display_name),
  creator:profiles!promotions_creator_id_fkey(display_name),
  approver:profiles!promotions_approver_id_fkey(display_name),
  publisher:profiles!promotions_publisher_id_fkey(display_name)
`;

export const supabaseCampaignService: CampaignService = {
  async listPromotions(input: ListPromotionsInput = {}) {
    let query = supabase
      .from('promotions')
      .select(promotionSelect)
      .order('updated_at', { ascending: false });

    if (input.status) query = query.eq('status', input.status);
    else query = query.neq('status', 'CANCELLED');

    const { data, error } = await query;
    assertSuccess(error);
    const promotions = (data ?? []).map(mapPromotion);
    const search = input.search?.trim().toLocaleLowerCase();
    return search
      ? promotions.filter(
          (promotion) =>
            promotion.title.toLocaleLowerCase().includes(search) ||
            promotion.clientName.toLocaleLowerCase().includes(search),
        )
      : promotions;
  },

  async getDashboard(userId: string) {
    const [promotions, activity] = await Promise.all([
      this.listPromotions(),
      supabase
        .from('audit_log')
        .select('*, actor:profiles!audit_log_actor_id_fkey(display_name)')
        .order('created_at', { ascending: false })
        .limit(8),
    ]);
    assertSuccess(activity.error);

    const counts: DashboardData['counts'] = {};
    for (const promotion of promotions)
      counts[promotion.status] = (counts[promotion.status] ?? 0) + 1;
    const now = new Date();
    const attentionStates: PromotionStatus[] = [
      'SUBMITTED_FOR_APPROVAL',
      'REVISION_REQUESTED',
      'VERIFICATION_PENDING',
      'READY_FOR_INVOICING',
    ];
    return {
      promotions: promotions.map((item) => ({ ...item })),
      counts,
      attention: promotions.filter((item) => attentionStates.includes(item.status)).slice(0, 6),
      overdue: promotions
        .filter(
          (item) =>
            item.dueDate &&
            new Date(item.dueDate) < now &&
            !['INVOICED', 'CANCELLED'].includes(item.status),
        )
        .slice(0, 6),
      recentActivity: (activity.data ?? []).map(mapActivity),
      myAssignments: promotions
        .filter((item) =>
          [item.salesOwnerId, item.creatorId, item.approverId, item.publisherId].includes(userId),
        )
        .slice(0, 6),
    };
  },

  async listFinanceCalendarEvents() {
    const [promotions, invoices] = await Promise.all([
      this.listPromotions(),
      supabase
        .from('invoices')
        .select(
          'id, promotion_id, invoice_number, amount, currency, status, issued_at, paid_at, created_at',
        )
        .order('created_at', { ascending: false }),
    ]);
    assertSuccess(invoices.error);
    const promotionsById = new Map(promotions.map((promotion) => [promotion.id, promotion]));

    return (invoices.data ?? []).flatMap((invoice) => {
      const promotion = promotionsById.get(invoice.promotion_id);
      const date = invoice.paid_at ?? invoice.issued_at ?? invoice.created_at;
      if (!promotion || !date) return [];
      return [
        {
          id: invoice.id,
          promotionId: invoice.promotion_id,
          title: promotion.title,
          clientName: promotion.clientName,
          date: date.slice(0, 10),
          status: invoice.status,
          amount: Number(invoice.amount),
          currency: invoice.currency,
          invoiceNumber: invoice.invoice_number,
        },
      ];
    });
  },

  async getPromotion(id: string) {
    const [
      promotionResult,
      resources,
      submissions,
      submissionStates,
      publications,
      currentPublicationIds,
      verifications,
      invoices,
      metadata,
      activity,
      actions,
    ] = await Promise.all([
      supabase.from('promotions').select(promotionSelect).eq('id', id).single(),
      supabase
        .from('promotion_resource_links')
        .select(
          '*, attached_by_profile:profiles!promotion_resource_links_attached_by_fkey(display_name)',
        )
        .eq('promotion_id', id)
        .order('attached_at', { ascending: false }),
      supabase
        .from('approval_submissions')
        .select(
          '*, resource:promotion_resource_links!approval_submissions_resource_link_id_fkey(display_name), submitter:profiles!approval_submissions_submitted_by_fkey(display_name), decisions:approval_decisions!approval_decisions_approval_submission_id_fkey(*, decider:profiles!approval_decisions_decided_by_fkey(display_name))',
        )
        .eq('promotion_id', id)
        .order('submission_number', { ascending: false }),
      supabase.from('approval_submission_state').select('id,state').eq('promotion_id', id),
      supabase
        .from('publications')
        .select(
          '*, artifact:promotion_resource_links!publications_artifact_resource_link_id_fkey(display_name), publisher:profiles!publications_published_by_fkey(display_name)',
        )
        .eq('promotion_id', id)
        .eq('event_type', 'PUBLISHED')
        .order('published_at', { ascending: false }),
      supabase
        .from('current_publications')
        .select('id')
        .eq('promotion_id', id)
        .eq('event_type', 'PUBLISHED'),
      supabase
        .from('publication_verifications')
        .select('*')
        .eq('promotion_id', id)
        .order('verified_at', { ascending: false })
        .order('id', { ascending: false }),
      supabase
        .from('invoices')
        .select('*')
        .eq('promotion_id', id)
        .not('status', 'in', '(VOID,FAILED)')
        .order('created_at', { ascending: false })
        .limit(1),
      supabase.from('campaign_metadata').select('*').eq('promotion_id', id).maybeSingle(),
      supabase
        .from('audit_log')
        .select('*, actor:profiles!audit_log_actor_id_fkey(display_name)')
        .eq('aggregate_id', id)
        .order('created_at', { ascending: false }),
      supabase.rpc('get_promotion_allowed_actions', { promotion_id: id }),
    ]);

    [
      promotionResult,
      resources,
      submissions,
      submissionStates,
      publications,
      currentPublicationIds,
      verifications,
      invoices,
      metadata,
      activity,
    ].forEach((result) => assertSuccess(result.error));
    if (promotionResult.data === null) {
      throw new DomainError({ code: 'NOT_FOUND', message: 'Promotion not found.' });
    }

    const promotion = mapPromotion(promotionResult.data);
    if (!actions.error) promotion.allowedActions = actionList(actions.data);
    const stateBySubmission = new Map(
      (submissionStates.data ?? []).map((value) => {
        const row = asRow(value);
        return [textValue(row.id), textValue(row.state)] as const;
      }),
    );
    const currentPublicationIdSet = new Set(
      (currentPublicationIds.data ?? []).map((value) => textValue(asRow(value).id)),
    );
    const verificationsByPublication = new Map<string, Row[]>();
    for (const value of verifications.data ?? []) {
      const row = asRow(value);
      const publicationId = textValue(row.publication_id);
      if (!publicationId) continue;
      const attempts = verificationsByPublication.get(publicationId) ?? [];
      attempts.push(row);
      verificationsByPublication.set(publicationId, attempts);
    }

    return {
      promotion,
      metadata: metadata.data ? mapCampaignMetadata(metadata.data) : null,
      resources: (resources.data ?? []).map(mapResource),
      submissions: (submissions.data ?? []).map((value) => {
        const mapped = mapSubmission(value);
        const authoritativeState = stateBySubmission.get(mapped.id);
        return authoritativeState
          ? { ...mapped, state: authoritativeState as ApprovalSubmission['state'] }
          : mapped;
      }),
      publications: (publications.data ?? [])
        .filter((value) => currentPublicationIdSet.has(textValue(asRow(value).id)))
        .map((value) => {
          const row = asRow(value);
          return mapPublication({
            ...row,
            verifications: verificationsByPublication.get(textValue(row.id)) ?? [],
          });
        }),
      invoice: invoices.data?.[0] ? mapInvoice(invoices.data[0]) : null,
      activity: (activity.data ?? []).map(mapActivity),
    };
  },

  async listClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .is('archived_at', null)
      .order('name');
    assertSuccess(error);
    return (data ?? []).map(mapClient);
  },

  async saveCampaignMetadata(id: string, input: CampaignMetadataInput) {
    return persistCampaignMetadata(id, input);
  },

  async listPublishingAccounts() {
    const { data, error } = await supabase
      .from('publishing_accounts')
      .select(
        '*, default_publisher:profiles!publishing_accounts_default_publisher_id_fkey(display_name)',
      )
      .order('active', { ascending: false })
      .order('platform');
    if (error) throw error;
    return (data ?? []).map(mapPublishingAccount);
  },

  async listProfiles(role?: RoleCode) {
    const query = supabase
      .from('profiles')
      .select('*, user_roles!user_roles_user_id_fkey(role:roles(code))')
      .order('display_name');
    const { data, error } = await query;
    assertSuccess(error);
    const profiles = (data ?? []).map((value) => {
      const row = asRow(value);
      const userRoles = Array.isArray(row.user_roles) ? row.user_roles : [];
      return {
        id: textValue(row.id),
        email: textValue(row.email),
        displayName: textValue(row.display_name),
        status: textValue(row.status, 'ACTIVE') as Profile['status'],
        roles: userRoles
          .map((entry) => textValue(relation(asRow(entry).role).code) as RoleCode)
          .filter(Boolean),
        slackUserId: nullableText(row.slack_user_id),
      };
    });
    return role
      ? profiles.filter((profile) => profile.status === 'ACTIVE' && hasRole(profile.roles, role))
      : profiles;
  },

  async listNotifications() {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    assertSuccess(error);
    return (data ?? []).map(mapNotification);
  },

  async getOperationsHealth() {
    const { data, error } = await supabase.rpc('get_operations_health');
    assertSuccess(error);
    const health = asRow(data);
    const outbox = asRow(health.outbox);
    const connectionRows = Array.isArray(health.connections) ? health.connections : [];
    const failedJobs = Array.isArray(health.failedJobs) ? health.failedJobs : [];
    const failedAttempts = Array.isArray(health.recentIntegrationFailures)
      ? health.recentIntegrationFailures.length
      : 0;
    return {
      pendingOutbox: numberValue(outbox.pending),
      failedOutbox: numberValue(outbox.failed),
      deadLetter: numberValue(outbox.deadLetter),
      stuckProcessing: numberValue(outbox.stuckProcessing),
      failedAttempts,
      failedJobs: failedJobs.map((value) => {
        const row = asRow(value);
        return {
          id: textValue(row.id),
          aggregateType: textValue(row.aggregateType),
          aggregateId: textValue(row.aggregateId),
          eventType: textValue(row.eventType),
          status: textValue(row.status, 'FAILED') as 'FAILED' | 'DEAD_LETTER',
          attemptCount: numberValue(row.attemptCount),
          errorCode: nullableText(row.errorCode),
          availableAt: textValue(row.availableAt),
          createdAt: textValue(row.created_at),
        };
      }),
      connections: connectionRows.map((value): IntegrationConnection => {
        const row = asRow(value);
        const configured = row.configured === true;
        const manual = textValue(row.mode).toUpperCase() === 'MANUAL';
        const providerStatus = textValue(row.status, 'NOT_CONFIGURED');
        const status: IntegrationConnection['status'] = manual
          ? 'MANUAL'
          : providerStatus === 'HEALTHY' || providerStatus === 'CONFIGURED'
            ? 'CONNECTED'
            : providerStatus === 'DEGRADED'
              ? 'DEGRADED'
              : 'DISCONNECTED';
        return {
          id: textValue(row.id),
          provider: textValue(row.provider),
          status,
          lastTestedAt: nullableText(row.lastTestedAt),
          mode: manual || !configured ? 'MANUAL' : 'AUTOMATED',
        };
      }),
    };
  },

  async inviteUser(input) {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: {
        action: 'invite',
        email: input.email,
        displayName: input.displayName,
        roles: input.roles,
      },
      headers: requestHeaders('invite-user'),
    });
    await assertFunctionSuccess(error);
  },

  async createUser(input) {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: {
        action: 'create',
        email: input.email,
        displayName: input.displayName,
        temporaryPassword: input.temporaryPassword,
        roles: input.roles,
      },
      headers: requestHeaders('create-user'),
    });
    await assertFunctionSuccess(error);
  },

  async replaceUserRoles(profileId, roles) {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'replace_roles', userId: profileId, roles },
      headers: requestHeaders('replace-user-roles'),
    });
    await assertFunctionSuccess(error);
  },

  async setProfileStatus(profileId, status) {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'set_status', userId: profileId, status },
      headers: requestHeaders('set-profile-status'),
    });
    await assertFunctionSuccess(error);
  },

  async deleteUser(profileId) {
    const { error } = await supabase.functions.invoke('admin-users', {
      body: { action: 'delete_user', userId: profileId },
      headers: requestHeaders('delete-user'),
    });
    await assertFunctionSuccess(error);
  },

  async processOutbox() {
    const { data, error } = await supabase.functions.invoke('process-outbox', {
      body: { mode: 'manual', batchSize: 25 },
      headers: requestHeaders('process-outbox'),
    });
    await assertFunctionSuccess(error);
    const row = asRow(data);
    return { processed: numberValue(row.processed) };
  },

  async retryOutboxEvent(eventId: string) {
    await callRpc('retry_outbox_event', { event_id: eventId });
  },

  async testIntegration(provider: string) {
    const { data, error } = await supabase.functions.invoke('test-integration', {
      body: { provider },
      headers: requestHeaders('test-integration'),
    });
    await assertFunctionSuccess(error);
    const row = asRow(data);
    return {
      code: textValue(row.code),
      message: textValue(row.message, 'Integration test completed.'),
      provider: textValue(row.provider, provider),
      status: textValue(row.status, 'NOT_CONFIGURED') as
        'CONNECTED' | 'MANUAL' | 'NOT_CONFIGURED' | 'UNAVAILABLE',
    };
  },

  async createClient(input: ClientInput) {
    const data = await callRpc('create_client', {
      input: {
        name: input.name,
        billing_email: input.billingEmail || null,
        billing_address: input.billingAddress || null,
      },
    });
    return mapClient(data);
  },

  async updateClient(id: string, input: ClientInput) {
    const data = await callRpc('update_client', {
      client_id: id,
      input: {
        name: input.name,
        billing_email: input.billingEmail || null,
        billing_address: input.billingAddress || null,
      },
    });
    return mapClient(data);
  },

  async archiveClient(id: string) {
    await callRpc('archive_client', { client_id: id });
  },

  async createPromotion(input: PromotionInput) {
    const data = await callRpc('create_promotion', {
      input: {
        client_id: input.clientId,
        title: input.title,
        description: input.description || null,
        due_date: input.dueDate || null,
      },
    });
    const promotion = mapPromotion(data);
    if (input.metadata) await persistCampaignMetadata(promotion.id, input.metadata);
    return promotion;
  },

  async updatePromotion(id: string, version: number, input: Partial<PromotionInput>) {
    const data = await callRpc('update_promotion', {
      promotion_id: id,
      expected_version: version,
      input: {
        title: input.title,
        description: input.description,
        due_date: input.dueDate,
      },
    });
    return mapPromotion(data);
  },

  async cancelPromotion(id: string, version: number, reason: string) {
    await callRpc('cancel_promotion', { promotion_id: id, expected_version: version, reason });
  },

  async assignRole(id: string, role: AssignmentRole, userId: string, version: number) {
    await callRpc('assign_promotion_role', {
      promotion_id: id,
      role_type: role,
      user_id: userId,
      expected_version: version,
    });
  },

  async startCreativeWork(id: string, version: number) {
    await callRpc('start_creative_work', { promotion_id: id, expected_version: version });
  },

  async attachResource(id: string, input: ResourceLinkInput) {
    await callRpc('attach_resource_link', {
      promotion_id: id,
      input: {
        provider: input.provider,
        resource_type: input.resourceType,
        url: input.url,
        display_name: input.displayName,
      },
    });
  },

  async archiveResource(resourceId: string) {
    await callRpc('archive_resource_link', { resource_id: resourceId });
  },

  async submitForApproval(id: string, resourceId: string, version: number) {
    await callRpc('submit_for_approval', {
      promotion_id: id,
      resource_id: resourceId,
      expected_version: version,
    });
  },

  async decideApproval(submissionId: string, input: ApprovalDecisionInput, version: number) {
    await callRpc('decide_approval', {
      submission_id: submissionId,
      decision: input.decision,
      comments: input.comments || null,
      expected_version: version,
    });
  },

  async startPublishing(id: string, version: number) {
    await callRpc('start_publishing', { promotion_id: id, expected_version: version });
  },

  async recordPublication(id: string, input: PublicationInput, version: number) {
    await callRpc('record_publication', {
      promotion_id: id,
      input: {
        provider: input.provider,
        destination: input.destination,
        publication_url: input.publicationUrl,
        external_publication_id: input.externalPublicationId || null,
        artifact_resource_link_id: input.artifactResourceLinkId,
        published_at: new Date(input.publishedAt).toISOString(),
      },
      expected_version: version,
    });
  },

  async requestVerification(publicationId: string, version: number) {
    await callRpc('request_publication_verification', {
      publication_id: publicationId,
      expected_version: version,
    });
  },

  async recordVerification(publicationId: string, input: VerificationInput, version: number) {
    await callRpc('record_publication_verification', {
      publication_id: publicationId,
      input: {
        status: input.status,
        verification_method: 'MANUAL',
        details_json: { notes: input.notes },
      },
      expected_version: version,
    });
  },

  async completeVerifiedWorkflow(id: string, version: number) {
    await callRpc('complete_verified_workflow', {
      promotion_id: id,
      expected_version: version,
    });
  },

  async createInvoice(id: string, input: InvoiceInput, version: number) {
    await callRpc('create_invoice', {
      promotion_id: id,
      input: {
        amount: input.amount,
        currency: input.currency,
        invoice_number: input.invoiceNumber || null,
        status: input.status,
      },
      expected_version: version,
    });
  },

  async setInvoiceStatus(invoiceId, status, version, invoiceNumber) {
    await callRpc('set_invoice_status', {
      invoice_id: invoiceId,
      status,
      invoice_number: invoiceNumber ?? null,
      expected_version: version,
    });
  },

  async completePromotion(id: string, version: number) {
    await callRpc('complete_promotion', {
      promotion_id: id,
      expected_version: version,
    });
  },

  async markNotificationRead(id: string) {
    await callRpc('mark_notification_read', { notification_id: id });
  },

  async attachPrivateAsset(promotionId, file, onProgress) {
    const descriptor = createPrivateAssetDescriptor(promotionId, crypto.randomUUID(), file);
    onProgress?.(10);
    await callRpc('attach_resource_link', {
      promotion_id: promotionId,
      input: {
        id: descriptor.id,
        provider: 'SUPABASE_STORAGE',
        resource_type: descriptor.resourceType,
        url: descriptor.path,
        external_id: descriptor.path,
        display_name: descriptor.displayName,
        metadata_json: {
          mime_type: descriptor.mimeType,
          size_bytes: descriptor.size,
          original_filename: file.name,
        },
      },
    });
    onProgress?.(35);
    const { error } = await supabase.storage
      .from('promotion-assets')
      .upload(descriptor.path, file, {
        cacheControl: '3600',
        contentType: descriptor.mimeType,
        upsert: false,
      });
    if (error) {
      try {
        await callRpc('archive_resource_link', { resource_id: descriptor.id });
      } catch {
        // The audit record remains visible if best-effort cleanup is unavailable.
      }
      throw new DomainError({
        code: 'ASSET_UPLOAD_FAILED',
        message: 'The private asset could not be uploaded. Check your connection and try again.',
      });
    }
    try {
      await callRpc('finalize_private_asset', { resource_id: descriptor.id });
    } catch (error) {
      await supabase.storage.from('promotion-assets').remove([descriptor.path]);
      try {
        await callRpc('archive_resource_link', { resource_id: descriptor.id });
      } catch {
        // Preserve the original validation error and leave the audit trail intact.
      }
      throw error;
    }
    onProgress?.(100);
  },

  async getPrivateAssetUrl(storagePath) {
    const { data, error } = await supabase.storage
      .from('promotion-assets')
      .createSignedUrl(storagePath, 5 * 60);
    assertSuccess(error);
    if (!data?.signedUrl) {
      throw new DomainError({
        code: 'ASSET_SIGNING_FAILED',
        message: 'The private asset could not be opened. Try again.',
      });
    }
    return data.signedUrl;
  },
};
