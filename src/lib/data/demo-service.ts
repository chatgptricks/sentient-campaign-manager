import type {
  ActivityEvent,
  CampaignMetadata,
  Client,
  DashboardData,
  Invoice,
  Notification,
  OperationsHealth,
  Profile,
  Promotion,
  PromotionAction,
  PromotionDetail,
  PublishingAccount,
  PublicationVerification,
  ResourceLink,
} from '../../domain/models';
import { DomainError } from '../../domain/errors';
import type { PromotionStatus } from '../../domain/promotion-status';
import type { RoleCode } from '../../domain/permissions';
import type {
  ApprovalDecisionInput,
  CampaignMetadataInput,
  ClientInput,
  InvoiceInput,
  PromotionInput,
  PublicationInput,
  ResourceLinkInput,
  VerificationInput,
} from '../validation/schemas';
import type { AssignmentRole, CampaignService, ListPromotionsInput } from './service';
import { createPrivateAssetDescriptor } from './private-assets';

const ids = {
  admin: '00000000-0000-4000-8000-000000000001',
  sales: '00000000-0000-4000-8000-000000000002',
  creator: '00000000-0000-4000-8000-000000000003',
  approver: '00000000-0000-4000-8000-000000000004',
  publisher: '00000000-0000-4000-8000-000000000005',
  finance: '00000000-0000-4000-8000-000000000006',
  client1: '10000000-0000-4000-8000-000000000001',
  client2: '10000000-0000-4000-8000-000000000002',
  client3: '10000000-0000-4000-8000-000000000003',
  client4: '10000000-0000-4000-8000-000000000004',
  promo1: '20000000-0000-4000-8000-000000000001',
  promo2: '20000000-0000-4000-8000-000000000002',
  promo3: '20000000-0000-4000-8000-000000000003',
  promo4: '20000000-0000-4000-8000-000000000004',
  promo5: '20000000-0000-4000-8000-000000000005',
  promo6: '20000000-0000-4000-8000-000000000006',
} as const;

const now = new Date();
const iso = (dayOffset = 0, hourOffset = 0) =>
  new Date(now.getTime() + dayOffset * 86_400_000 + hourOffset * 3_600_000).toISOString();

const profiles: Profile[] = [
  {
    id: ids.admin,
    email: 'alex@sentient.agency',
    displayName: 'Alex Rivera',
    status: 'ACTIVE',
    roles: ['ADMINISTRATOR'],
  },
  {
    id: ids.sales,
    email: 'maya@sentient.agency',
    displayName: 'Maya Chen',
    status: 'ACTIVE',
    roles: ['SALES'],
  },
  {
    id: ids.creator,
    email: 'leo@sentient.agency',
    displayName: 'Leo Martins',
    status: 'ACTIVE',
    roles: ['CREATOR'],
  },
  {
    id: ids.approver,
    email: 'amina@sentient.agency',
    displayName: 'Amina Okafor',
    status: 'ACTIVE',
    roles: ['CREATOR'],
  },
  {
    id: ids.publisher,
    email: 'noah@sentient.agency',
    displayName: 'Noah Williams',
    status: 'ACTIVE',
    roles: ['CREATOR'],
  },
  {
    id: ids.finance,
    email: 'sofia@sentient.agency',
    displayName: 'Sofia Rossi',
    status: 'ACTIVE',
    roles: ['SALES'],
  },
];

let clients: Client[] = [
  {
    id: ids.client1,
    name: 'Arcadia Hotels',
    billingEmail: 'finance@arcadia.example',
    billingAddress: '40 Harbor Avenue, Miami, FL',
    externalAccountingId: null,
    createdAt: iso(-45),
    updatedAt: iso(-3),
    archivedAt: null,
  },
  {
    id: ids.client2,
    name: 'Northstar Robotics',
    billingEmail: 'ap@northstar.example',
    billingAddress: '125 Mission Street, San Francisco, CA',
    externalAccountingId: 'NS-204',
    createdAt: iso(-80),
    updatedAt: iso(-6),
    archivedAt: null,
  },
  {
    id: ids.client3,
    name: 'Solenne Beauty',
    billingEmail: 'billing@solenne.example',
    billingAddress: '8 Mercer Street, New York, NY',
    externalAccountingId: null,
    createdAt: iso(-28),
    updatedAt: iso(-1),
    archivedAt: null,
  },
  {
    id: ids.client4,
    name: 'Vela Mobility',
    billingEmail: 'accounts@vela.example',
    billingAddress: '600 Congress Avenue, Austin, TX',
    externalAccountingId: 'VELA-18',
    createdAt: iso(-120),
    updatedAt: iso(-2),
    archivedAt: null,
  },
];

const publishingAccounts: PublishingAccount[] = [
  {
    id: 'account-instagram-sentient',
    platform: 'INSTAGRAM',
    accountName: 'Sentient official',
    handle: '@sentient.agency',
    accountUrl: 'https://www.instagram.com/sentient.agency',
    ownershipType: 'SENTIENT_OWNED',
    partnerName: null,
    active: true,
    defaultPublisherName: 'Noah Williams',
    notes: 'Primary internal account.',
  },
  {
    id: 'account-linkedin-sentient',
    platform: 'LINKEDIN',
    accountName: 'Sentient company page',
    handle: 'sentient-agency',
    accountUrl: 'https://www.linkedin.com/company/sentient-agency',
    ownershipType: 'SENTIENT_OWNED',
    partnerName: null,
    active: true,
    defaultPublisherName: 'Noah Williams',
    notes: null,
  },
  {
    id: 'account-x-arcadia',
    platform: 'X',
    accountName: 'Arcadia Hotels X',
    handle: '@arcadiahotels',
    accountUrl: 'https://x.com/arcadiahotels',
    ownershipType: 'CLIENT_OWNED',
    partnerName: null,
    active: true,
    defaultPublisherName: 'Noah Williams',
    notes: 'Client approval required before publishing.',
  },
  {
    id: 'account-x-partner',
    platform: 'X',
    accountName: 'Travel Network partner account',
    handle: 'travel-network',
    accountUrl: 'https://x.com/travel-network',
    ownershipType: 'EXTERNAL_PARTNER',
    partnerName: 'Travel Network',
    active: false,
    defaultPublisherName: null,
    notes: 'Retained for historical campaign records.',
  },
];

function allowedActions(status: PromotionStatus): PromotionAction[] {
  const byStatus: Partial<Record<PromotionStatus, PromotionAction[]>> = {
    DRAFT: ['UPDATE_PROMOTION', 'ASSIGN_CREATOR', 'ATTACH_RESOURCE', 'CANCEL_PROMOTION'],
    CREATOR_ASSIGNED: ['START_CREATIVE_WORK', 'ATTACH_RESOURCE', 'CANCEL_PROMOTION'],
    CREATIVE_IN_PROGRESS: ['ATTACH_RESOURCE', 'SUBMIT_FOR_APPROVAL', 'CANCEL_PROMOTION'],
    REVISION_REQUESTED: ['START_CREATIVE_WORK', 'ATTACH_RESOURCE', 'CANCEL_PROMOTION'],
    SUBMITTED_FOR_APPROVAL: ['DECIDE_APPROVAL', 'CANCEL_PROMOTION'],
    APPROVED: ['START_PUBLISHING', 'CANCEL_PROMOTION'],
    PUBLISHER_ASSIGNED: ['START_PUBLISHING', 'CANCEL_PROMOTION'],
    PUBLISHING_IN_PROGRESS: ['RECORD_PUBLICATION', 'CANCEL_PROMOTION'],
    PUBLISHED: ['REQUEST_PUBLICATION_VERIFICATION', 'CANCEL_PROMOTION'],
    VERIFICATION_PENDING: ['RECORD_PUBLICATION_VERIFICATION', 'CANCEL_PROMOTION'],
    VERIFIED: ['COMPLETE_VERIFIED_WORKFLOW', 'CANCEL_PROMOTION'],
    READY_FOR_INVOICING: ['CREATE_INVOICE', 'CANCEL_PROMOTION'],
  };
  const actions = byStatus[status] ?? [];
  return actions;
}

function promotion(
  id: string,
  clientId: string,
  title: string,
  status: PromotionStatus,
  dueDate: string,
  overrides: Partial<Promotion> = {},
): Promotion {
  const clientName = clients.find((item) => item.id === clientId)?.name ?? 'Unknown client';
  return {
    id,
    clientId,
    clientName,
    title,
    description:
      'Multi-channel promotional campaign managed through Sentient’s verified creative workflow.',
    status,
    salesOwnerId: ids.sales,
    salesOwnerName: 'Maya Chen',
    creatorId: ids.creator,
    creatorName: 'Leo Martins',
    approverId: ids.approver,
    approverName: 'Amina Okafor',
    publisherId: [
      'APPROVED',
      'PUBLISHER_ASSIGNED',
      'PUBLISHING_IN_PROGRESS',
      'PUBLISHED',
      'VERIFICATION_PENDING',
      'VERIFIED',
      'READY_FOR_INVOICING',
      'INVOICED',
    ].includes(status)
      ? ids.publisher
      : null,
    publisherName: [
      'APPROVED',
      'PUBLISHER_ASSIGNED',
      'PUBLISHING_IN_PROGRESS',
      'PUBLISHED',
      'VERIFICATION_PENDING',
      'VERIFIED',
      'READY_FOR_INVOICING',
      'INVOICED',
    ].includes(status)
      ? 'Noah Williams'
      : null,
    dueDate,
    version: 4,
    createdAt: iso(-20),
    updatedAt: iso(-1),
    cancellationReason: null,
    allowedActions: allowedActions(status),
    ...overrides,
  };
}

let promotions: Promotion[] = [
  promotion(
    ids.promo1,
    ids.client1,
    'Summer rooftop launch',
    'SUBMITTED_FOR_APPROVAL',
    iso(4).slice(0, 10),
    { version: 6, updatedAt: iso(0, -2) },
  ),
  promotion(
    ids.promo2,
    ids.client2,
    'Atlas humanoid reveal',
    'CREATIVE_IN_PROGRESS',
    iso(8).slice(0, 10),
    { version: 3, updatedAt: iso(-1, -1) },
  ),
  promotion(
    ids.promo3,
    ids.client3,
    'Lumina creator stories',
    'REVISION_REQUESTED',
    iso(2).slice(0, 10),
    { version: 8, updatedAt: iso(0, -4) },
  ),
  promotion(
    ids.promo4,
    ids.client4,
    'City electric rollout',
    'READY_FOR_INVOICING',
    iso(-2).slice(0, 10),
    { version: 12, updatedAt: iso(-1) },
  ),
  promotion(
    ids.promo5,
    ids.client1,
    'Weekend escape series',
    'VERIFICATION_PENDING',
    iso(-1).slice(0, 10),
    { version: 10, updatedAt: iso(0, -5) },
  ),
  promotion(ids.promo6, ids.client2, 'Research lab spotlight', 'INVOICED', iso(-18).slice(0, 10), {
    version: 14,
    updatedAt: iso(-8),
  }),
];

const resourceFor = (promotionId: string, index = 1): ResourceLink => ({
  id: `${promotionId.slice(0, 28)}${String(index).padStart(4, '0')}`,
  promotionId,
  provider: 'CANVA',
  resourceType: 'SOCIAL_CREATIVE',
  url: 'https://www.canva.com/design/demo-sentient-campaign',
  storagePath: null,
  displayName: index === 1 ? 'Campaign master creative' : `Creative revision ${index}`,
  validationStatus: 'VALID',
  validationMessage: 'HTTPS URL and provider format verified.',
  attachedByName: 'Leo Martins',
  attachedAt: iso(-4 + index),
  archivedAt: null,
});

const resourcesByPromotion = new Map<string, ResourceLink[]>(
  promotions.map((item) => [item.id, [resourceFor(item.id)]]),
);

function metadataFromInput(promotionId: string, input?: CampaignMetadataInput): CampaignMetadata {
  const value = input ?? {
    campaignType: 'Social campaign',
    scheduledDate: '',
    priority: 'NORMAL' as const,
    briefUrl: '',
    clientMaterialLinks: '',
    externalResourceLinks: '',
    platforms: ['INSTAGRAM'],
    publishingAccountIds: ['account-instagram-sentient'],
    externalPartnerAccountIds: [],
    internalNotes: '',
  };
  const links = (raw: string) =>
    raw
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  return {
    promotionId,
    campaignType: value.campaignType,
    scheduledDate: value.scheduledDate || null,
    priority: value.priority,
    briefUrl: value.briefUrl || null,
    clientMaterialLinks: links(value.clientMaterialLinks),
    externalResourceLinks: links(value.externalResourceLinks),
    platforms: value.platforms,
    publishingAccountIds: value.publishingAccountIds,
    externalPartnerAccountIds: value.externalPartnerAccountIds,
    internalNotes: value.internalNotes || null,
  };
}

const metadataByPromotion = new Map<string, CampaignMetadata>(
  promotions.map((item) => [item.id, metadataFromInput(item.id)]),
);

const publicationIdFor = (promotionId: string) => `${promotionId.slice(0, 28)}8001`;

function verificationFor(
  promotionId: string,
  index: number,
  status: PublicationVerification['status'],
  details: PublicationVerification['details'],
): PublicationVerification {
  const publicationId = publicationIdFor(promotionId);
  return {
    id: `${promotionId.slice(0, 28)}${String(6000 + index).padStart(4, '0')}`,
    publicationId,
    promotionId,
    status,
    details,
    method: 'MANUAL',
    verifiedAt: iso(-index),
  };
}

const verificationsByPublication = new Map<string, PublicationVerification[]>([
  [
    publicationIdFor(ids.promo4),
    [
      verificationFor(ids.promo4, 1, 'VERIFIED', {
        notes: 'Live URL, destination, and approved creative were confirmed.',
      }),
    ],
  ],
  [
    publicationIdFor(ids.promo5),
    [
      verificationFor(ids.promo5, 1, 'FAILED', {
        notes: 'The destination returned an unavailable response. Retry is required.',
      }),
    ],
  ],
  [
    publicationIdFor(ids.promo6),
    [
      verificationFor(ids.promo6, 2, 'VERIFIED', {
        notes: 'Publication evidence was verified before invoicing.',
      }),
    ],
  ],
]);

const demoPrivateAssets = new Map<string, File>();

const invoicesByPromotion = new Map<string, Invoice>([
  [
    ids.promo6,
    {
      id: `${ids.promo6.slice(0, 28)}7001`,
      promotionId: ids.promo6,
      clientId: ids.client2,
      invoiceNumber: 'INV-2026-1042',
      amount: 4850,
      currency: 'USD',
      status: 'ISSUED',
      issuedAt: iso(-8),
      paidAt: null,
      createdAt: iso(-8),
    },
  ],
]);

let activity: ActivityEvent[] = promotions.flatMap((item, index) => [
  {
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    eventType:
      item.status === 'REVISION_REQUESTED' ? 'PromotionRevisionRequested' : 'PromotionUpdated',
    actorName: index % 2 ? 'Leo Martins' : 'Maya Chen',
    createdAt: item.updatedAt,
    correlationId: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    metadata: { status: item.status },
  },
]);

let notifications: Notification[] = [
  {
    id: '50000000-0000-4000-8000-000000000001',
    promotionId: ids.promo1,
    type: 'ApprovalSubmitted',
    channel: 'IN_APP',
    subject: 'Creative ready for approval',
    body: 'Summer rooftop launch has a new creative submission.',
    status: 'SENT',
    createdAt: iso(0, -2),
    readAt: null,
  },
  {
    id: '50000000-0000-4000-8000-000000000002',
    promotionId: ids.promo3,
    type: 'PromotionRevisionRequested',
    channel: 'IN_APP',
    subject: 'Revision requested',
    body: 'Amina added revision notes to Lumina creator stories.',
    status: 'SENT',
    createdAt: iso(0, -4),
    readAt: null,
  },
  {
    id: '50000000-0000-4000-8000-000000000003',
    promotionId: ids.promo4,
    type: 'PromotionReadyForInvoicing',
    channel: 'IN_APP',
    subject: 'Ready for invoicing',
    body: 'City electric rollout has verified publications.',
    status: 'SENT',
    createdAt: iso(-1),
    readAt: iso(-1, 1),
  },
];

function findPromotion(id: string) {
  const item = promotions.find((promotionItem) => promotionItem.id === id);
  if (!item) throw new DomainError({ code: 'NOT_FOUND', message: 'Promotion not found.' });
  return item;
}

function assertVersion(item: Promotion, version: number) {
  if (item.version !== version) {
    throw new DomainError({
      code: 'PROMOTION_VERSION_CONFLICT',
      message: 'Promotion version conflict.',
    });
  }
}

function transition(
  item: Promotion,
  status: PromotionStatus,
  eventType: string,
  actorName = 'Alex Rivera',
) {
  item.status = status;
  item.version += 1;
  item.updatedAt = new Date().toISOString();
  item.allowedActions = allowedActions(status);
  activity = [
    {
      id: crypto.randomUUID(),
      eventType,
      actorName,
      createdAt: item.updatedAt,
      correlationId: crypto.randomUUID(),
      metadata: { status, version: item.version },
    },
    ...activity,
  ];
}

function detailFor(item: Promotion): PromotionDetail {
  const resources = resourcesByPromotion.get(item.id) ?? [];
  const invoice = invoicesByPromotion.get(item.id);
  const currentInvoice =
    invoice && !['VOID', 'FAILED'].includes(invoice.status) ? invoice : undefined;
  const hasSubmission = [
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
  ].includes(item.status);
  const hasPublication = [
    'PUBLISHED',
    'VERIFICATION_PENDING',
    'VERIFIED',
    'READY_FOR_INVOICING',
    'INVOICED',
  ].includes(item.status);
  return {
    promotion: { ...item },
    metadata: metadataByPromotion.get(item.id)
      ? {
          ...metadataByPromotion.get(item.id)!,
          clientMaterialLinks: [...metadataByPromotion.get(item.id)!.clientMaterialLinks],
          externalResourceLinks: [...metadataByPromotion.get(item.id)!.externalResourceLinks],
          platforms: [...metadataByPromotion.get(item.id)!.platforms],
          publishingAccountIds: [...metadataByPromotion.get(item.id)!.publishingAccountIds],
          externalPartnerAccountIds: [
            ...metadataByPromotion.get(item.id)!.externalPartnerAccountIds,
          ],
        }
      : null,
    resources: [...resources],
    submissions:
      hasSubmission && resources[0]
        ? [
            {
              id: `${item.id.slice(0, 28)}9001`,
              promotionId: item.id,
              submissionNumber: 1,
              resourceLinkId: resources[0].id,
              resourceName: resources[0].displayName,
              submittedBy: ids.creator,
              submittedByName: 'Leo Martins',
              submittedAt: iso(-2),
              state:
                item.status === 'REVISION_REQUESTED'
                  ? 'REVISION_REQUESTED'
                  : item.status === 'SUBMITTED_FOR_APPROVAL'
                    ? 'PENDING'
                    : 'APPROVED',
              decisionComments:
                item.status === 'REVISION_REQUESTED'
                  ? 'Tighten the opening frame and increase product contrast.'
                  : null,
              decidedByName: item.status === 'SUBMITTED_FOR_APPROVAL' ? null : 'Amina Okafor',
              decidedAt: item.status === 'SUBMITTED_FOR_APPROVAL' ? null : iso(-1),
            },
          ]
        : [],
    publications:
      hasPublication && resources[0]
        ? (() => {
            const publicationId = publicationIdFor(item.id);
            const verifications = verificationsByPublication.get(publicationId) ?? [];
            const latestVerification = verifications[0];
            return [
              {
                id: publicationId,
                promotionId: item.id,
                provider: 'INSTAGRAM',
                destination: '@client_official',
                publicationUrl: 'https://www.instagram.com/p/demo-sentient',
                externalPublicationId: null,
                artifactResourceLinkId: resources[0].id,
                artifactName: resources[0].displayName,
                publishedByName: 'Noah Williams',
                publishedAt: iso(-2),
                verificationStatus: latestVerification?.status ?? null,
                verifiedAt: latestVerification?.verifiedAt ?? null,
                verifications: verifications.map((verification) => ({
                  ...verification,
                  details: { ...verification.details },
                })),
              },
            ];
          })()
        : [],
    invoice: currentInvoice ? { ...currentInvoice } : null,
    activity: activity
      .filter(
        (event) => event.metadata.status === item.status || event.metadata.promotionId === item.id,
      )
      .slice(0, 20),
  };
}

export const demoCampaignService: CampaignService = {
  async listPromotions(input: ListPromotionsInput = {}) {
    return promotions
      .filter(
        (item) =>
          !input.search ||
          `${item.title} ${item.clientName}`.toLowerCase().includes(input.search.toLowerCase()),
      )
      .filter((item) => (input.status ? item.status === input.status : item.status !== 'CANCELLED'))
      .map((item) => ({ ...item }));
  },

  async getDashboard(userId: string) {
    const counts: DashboardData['counts'] = {};
    promotions.forEach((item) => (counts[item.status] = (counts[item.status] ?? 0) + 1));
    return {
      promotions: promotions.map((item) => ({ ...item })),
      counts,
      attention: promotions.filter((item) =>
        [
          'SUBMITTED_FOR_APPROVAL',
          'REVISION_REQUESTED',
          'VERIFICATION_PENDING',
          'READY_FOR_INVOICING',
        ].includes(item.status),
      ),
      overdue: promotions.filter(
        (item) =>
          item.dueDate &&
          new Date(item.dueDate) < now &&
          !['INVOICED', 'CANCELLED'].includes(item.status),
      ),
      recentActivity: activity.slice(0, 8),
      myAssignments: promotions.filter((item) =>
        [item.salesOwnerId, item.creatorId, item.approverId, item.publisherId].includes(userId),
      ),
    };
  },

  async listFinanceCalendarEvents() {
    return Array.from(invoicesByPromotion.values()).flatMap((invoice) => {
      const promotion = promotions.find((item) => item.id === invoice.promotionId);
      const date = invoice.paidAt ?? invoice.issuedAt ?? invoice.createdAt;
      if (!promotion || !date) return [];
      return [
        {
          id: invoice.id,
          promotionId: invoice.promotionId,
          title: promotion.title,
          clientName: promotion.clientName,
          date: date.slice(0, 10),
          status: invoice.status,
          amount: invoice.amount,
          currency: invoice.currency,
          invoiceNumber: invoice.invoiceNumber,
        },
      ];
    });
  },

  async getPromotion(id) {
    return detailFor(findPromotion(id));
  },

  async saveCampaignMetadata(id, input) {
    findPromotion(id);
    const metadata = metadataFromInput(id, input);
    metadataByPromotion.set(id, metadata);
    return {
      ...metadata,
      clientMaterialLinks: [...metadata.clientMaterialLinks],
      externalResourceLinks: [...metadata.externalResourceLinks],
      platforms: [...metadata.platforms],
      publishingAccountIds: [...metadata.publishingAccountIds],
      externalPartnerAccountIds: [...metadata.externalPartnerAccountIds],
    };
  },

  async listClients() {
    return clients.filter((item) => !item.archivedAt).map((item) => ({ ...item }));
  },

  async listPublishingAccounts() {
    return publishingAccounts.map((item) => ({ ...item }));
  },

  async listProfiles(role?: RoleCode) {
    return profiles
      .filter((profile) => !role || profile.roles.includes(role))
      .map((profile) => ({ ...profile }));
  },

  async listNotifications() {
    return notifications.map((item) => ({ ...item }));
  },

  async getOperationsHealth(): Promise<OperationsHealth> {
    return {
      pendingOutbox: 3,
      failedOutbox: 1,
      deadLetter: 0,
      stuckProcessing: 0,
      failedAttempts: 1,
      failedJobs: [],
      connections: [
        {
          id: crypto.randomUUID(),
          provider: 'Canva',
          status: 'MANUAL',
          lastTestedAt: iso(-1),
          mode: 'MANUAL',
        },
        {
          id: crypto.randomUUID(),
          provider: 'Publishing',
          status: 'MANUAL',
          lastTestedAt: iso(-1),
          mode: 'MANUAL',
        },
        {
          id: crypto.randomUUID(),
          provider: 'Accounting',
          status: 'MANUAL',
          lastTestedAt: iso(-2),
          mode: 'MANUAL',
        },
        {
          id: crypto.randomUUID(),
          provider: 'Email',
          status: 'DISCONNECTED',
          lastTestedAt: null,
          mode: 'AUTOMATED',
        },
      ],
    };
  },

  async inviteUser(input) {
    profiles.push({
      id: crypto.randomUUID(),
      email: input.email,
      displayName: input.displayName,
      status: 'INVITED',
      roles: input.roles,
    });
  },

  async createUser(input) {
    profiles.push({
      id: crypto.randomUUID(),
      email: input.email,
      displayName: input.displayName,
      status: 'ACTIVE',
      roles: input.roles,
    });
  },

  async replaceUserRoles(profileId, roles) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) throw new DomainError({ code: 'NOT_FOUND', message: 'User not found.' });
    profile.roles = roles;
  },

  async setProfileStatus(profileId, status) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) throw new DomainError({ code: 'NOT_FOUND', message: 'User not found.' });
    profile.status = status;
  },

  async deleteUser(profileId) {
    const index = profiles.findIndex((item) => item.id === profileId);
    if (index < 0) throw new DomainError({ code: 'NOT_FOUND', message: 'User not found.' });
    const [profile] = profiles.splice(index, 1);
    if (!profile) throw new DomainError({ code: 'NOT_FOUND', message: 'User not found.' });
  },

  async processOutbox() {
    return { processed: 3 };
  },

  async retryOutboxEvent() {},

  async testIntegration(provider) {
    const normalized = provider.trim().toUpperCase();
    const manual = ['CANVA', 'PUBLISHING', 'ACCOUNTING'].includes(normalized);
    return {
      code: manual ? 'MANUAL_ADAPTER_READY' : 'DEMO_CONNECTION_READY',
      message: manual
        ? 'The manual adapter is ready and performs no destructive external action.'
        : 'The demo adapter completed a non-destructive connection check.',
      provider: normalized,
      status: manual ? ('MANUAL' as const) : ('CONNECTED' as const),
    };
  },

  async createClient(input: ClientInput) {
    const item: Client = {
      id: crypto.randomUUID(),
      name: input.name,
      billingEmail: input.billingEmail || null,
      billingAddress: input.billingAddress || null,
      externalAccountingId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    };
    clients = [...clients, item];
    return { ...item };
  },

  async updateClient(id, input) {
    const item = clients.find((client) => client.id === id && !client.archivedAt);
    if (!item) throw new DomainError({ code: 'NOT_FOUND', message: 'Client not found.' });
    item.name = input.name;
    item.billingEmail = input.billingEmail || null;
    item.billingAddress = input.billingAddress || null;
    item.updatedAt = new Date().toISOString();
    return { ...item };
  },

  async archiveClient(id) {
    const item = clients.find((client) => client.id === id && !client.archivedAt);
    if (!item) throw new DomainError({ code: 'NOT_FOUND', message: 'Client not found.' });
    item.archivedAt = new Date().toISOString();
    item.updatedAt = item.archivedAt;
  },

  async createPromotion(input: PromotionInput) {
    const item = promotion(
      crypto.randomUUID(),
      input.clientId,
      input.title,
      'DRAFT',
      input.dueDate || iso(7).slice(0, 10),
      {
        description: input.description || null,
        salesOwnerId: ids.sales,
        salesOwnerName:
          profiles.find((profile) => profile.id === ids.sales)?.displayName ?? 'Campaign owner',
        creatorId: null,
        creatorName: null,
        approverId: null,
        approverName: null,
        publisherId: null,
        publisherName: null,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    );
    promotions = [item, ...promotions];
    metadataByPromotion.set(item.id, metadataFromInput(item.id, input.metadata));
    transition(item, 'DRAFT', 'PromotionCreated');
    return { ...item };
  },

  async updatePromotion(id, version, input) {
    const item = findPromotion(id);
    assertVersion(item, version);
    if (input.title) item.title = input.title;
    if (input.description !== undefined) item.description = input.description || null;
    if (input.dueDate !== undefined) item.dueDate = input.dueDate || null;
    transition(item, item.status, 'PromotionUpdated');
    return { ...item };
  },

  async cancelPromotion(id, version, reason) {
    const item = findPromotion(id);
    assertVersion(item, version);
    item.cancellationReason = reason;
    transition(item, 'CANCELLED', 'PromotionCancelled');
  },

  async assignRole(id, role: AssignmentRole, userId, version) {
    const item = findPromotion(id);
    assertVersion(item, version);
    const assignee = profiles.find((profile) => profile.id === userId);
    if (!assignee)
      throw new DomainError({ code: 'INVALID_ASSIGNEE', message: 'Team member not found.' });
    if (role === 'CREATOR') {
      item.creatorId = userId;
      item.creatorName = assignee.displayName;
      transition(item, 'CREATOR_ASSIGNED', 'CreatorAssigned');
    } else if (role === 'APPROVER' || role === 'PUBLISHER') {
      item.creatorId = userId;
      item.creatorName = assignee.displayName;
      transition(
        item,
        item.status === 'DRAFT' ? 'CREATOR_ASSIGNED' : item.status,
        'CreatorAssigned',
      );
    } else {
      item.salesOwnerId = userId;
      item.salesOwnerName = assignee.displayName;
      transition(item, item.status, 'SalesOwnerAssigned');
    }
  },

  async startCreativeWork(id, version) {
    const item = findPromotion(id);
    assertVersion(item, version);
    transition(item, 'CREATIVE_IN_PROGRESS', 'CreativeWorkStarted', 'Leo Martins');
  },

  async attachResource(id, input: ResourceLinkInput) {
    const item = findPromotion(id);
    const resource: ResourceLink = {
      id: crypto.randomUUID(),
      promotionId: id,
      provider: input.provider,
      resourceType: input.resourceType,
      url: input.url,
      storagePath: null,
      displayName: input.displayName,
      validationStatus: 'VALID',
      validationMessage: 'URL validated in manual adapter mode.',
      attachedByName: 'Alex Rivera',
      attachedAt: new Date().toISOString(),
      archivedAt: null,
    };
    resourcesByPromotion.set(id, [resource, ...(resourcesByPromotion.get(id) ?? [])]);
    transition(item, item.status, 'ResourceAttached');
  },

  async archiveResource(resourceId) {
    for (const [promotionId, items] of resourcesByPromotion) {
      const resource = items.find((item) => item.id === resourceId);
      if (resource) {
        resource.archivedAt = new Date().toISOString();
        transition(
          findPromotion(promotionId),
          findPromotion(promotionId).status,
          'ResourceArchived',
        );
        return;
      }
    }
    throw new DomainError({ code: 'NOT_FOUND', message: 'Resource not found.' });
  },

  async submitForApproval(id, _resourceId, version) {
    const item = findPromotion(id);
    assertVersion(item, version);
    transition(item, 'SUBMITTED_FOR_APPROVAL', 'ApprovalSubmitted', 'Leo Martins');
  },

  async decideApproval(submissionId, input: ApprovalDecisionInput, version) {
    const item =
      promotions.find((promotionItem) => submissionId.startsWith(promotionItem.id.slice(0, 28))) ??
      promotions.find((promotionItem) => promotionItem.status === 'SUBMITTED_FOR_APPROVAL');
    if (!item) throw new DomainError({ code: 'NOT_FOUND', message: 'Submission not found.' });
    assertVersion(item, version);
    transition(
      item,
      input.decision === 'APPROVED' ? 'APPROVED' : 'REVISION_REQUESTED',
      input.decision === 'APPROVED' ? 'PromotionApproved' : 'PromotionRevisionRequested',
      item.creatorName ?? 'Creator',
    );
  },

  async startPublishing(id, version) {
    const item = findPromotion(id);
    assertVersion(item, version);
    transition(item, 'PUBLISHING_IN_PROGRESS', 'PublishingStarted', item.creatorName ?? 'Creator');
  },

  async recordPublication(id, _input: PublicationInput, version) {
    const item = findPromotion(id);
    assertVersion(item, version);
    transition(item, 'PUBLISHED', 'PublicationRecorded', item.creatorName ?? 'Creator');
  },

  async requestVerification(publicationId, version) {
    const item =
      promotions.find((promotionItem) => publicationId.startsWith(promotionItem.id.slice(0, 28))) ??
      promotions.find((promotionItem) => promotionItem.status === 'PUBLISHED');
    if (!item) throw new DomainError({ code: 'NOT_FOUND', message: 'Publication not found.' });
    assertVersion(item, version);
    transition(item, 'VERIFICATION_PENDING', 'PublicationVerificationRequested');
  },

  async recordVerification(publicationId, input: VerificationInput, version) {
    const item =
      promotions.find((promotionItem) => publicationId.startsWith(promotionItem.id.slice(0, 28))) ??
      promotions.find((promotionItem) => promotionItem.status === 'VERIFICATION_PENDING');
    if (!item) throw new DomainError({ code: 'NOT_FOUND', message: 'Publication not found.' });
    assertVersion(item, version);
    const attempts = verificationsByPublication.get(publicationId) ?? [];
    verificationsByPublication.set(publicationId, [
      {
        id: crypto.randomUUID(),
        publicationId,
        promotionId: item.id,
        status: input.status,
        details: input.notes ? { notes: input.notes } : {},
        method: 'MANUAL',
        verifiedAt: new Date().toISOString(),
      },
      ...attempts,
    ]);
    if (input.status === 'VERIFIED') {
      transition(item, 'VERIFIED', 'PublicationVerified');
    } else {
      transition(item, 'VERIFICATION_PENDING', 'PublicationVerificationFailed');
    }
  },

  async completeVerifiedWorkflow(id, version) {
    const item = findPromotion(id);
    assertVersion(item, version);
    transition(item, 'READY_FOR_INVOICING', 'PromotionReadyForInvoicing');
  },

  async createInvoice(id, input: InvoiceInput, version) {
    const item = findPromotion(id);
    assertVersion(item, version);
    const createdAt = new Date().toISOString();
    invoicesByPromotion.set(id, {
      id: crypto.randomUUID(),
      promotionId: id,
      clientId: item.clientId,
      invoiceNumber: input.invoiceNumber || null,
      amount: input.amount,
      currency: input.currency,
      status: input.status,
      issuedAt: input.status === 'ISSUED' ? createdAt : null,
      paidAt: null,
      createdAt,
    });
    transition(item, 'INVOICED', 'InvoiceCreated', 'Sofia Rossi');
  },

  async setInvoiceStatus(invoiceId, status, version, invoiceNumber) {
    const entry = [...invoicesByPromotion.entries()].find(
      ([, invoice]) => invoice.id === invoiceId,
    );
    if (!entry) throw new DomainError({ code: 'NOT_FOUND', message: 'Invoice not found.' });
    const [promotionId, invoice] = entry;
    const item = findPromotion(promotionId);
    assertVersion(item, version);
    const validTransitions: Partial<Record<Invoice['status'], Invoice['status'][]>> = {
      DRAFT: ['ISSUED', 'VOID', 'FAILED'],
      ISSUED: ['PAID', 'VOID', 'FAILED'],
      FAILED: ['DRAFT', 'VOID'],
    };
    if (!validTransitions[invoice.status]?.includes(status)) {
      throw new DomainError({
        code: 'INVOICE_INVALID_TRANSITION',
        message: `Invoice cannot move from ${invoice.status} to ${status}.`,
      });
    }
    if (status === 'ISSUED' && !invoiceNumber && !invoice.invoiceNumber) {
      throw new DomainError({
        code: 'INVOICE_NUMBER_REQUIRED',
        message: 'Issued invoices require an invoice number.',
      });
    }
    invoice.status = status;
    if (status === 'ISSUED') {
      invoice.invoiceNumber = invoiceNumber ?? invoice.invoiceNumber;
      invoice.issuedAt ??= new Date().toISOString();
    }
    if (status === 'PAID') invoice.paidAt ??= new Date().toISOString();
    transition(
      item,
      status === 'VOID' || status === 'FAILED' ? 'READY_FOR_INVOICING' : 'INVOICED',
      `Invoice${status}`,
      'Sofia Rossi',
    );
  },

  async markNotificationRead(id) {
    notifications = notifications.map((item) =>
      item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
    );
  },

  async attachPrivateAsset(promotionId, file, onProgress) {
    const item = findPromotion(promotionId);
    const descriptor = createPrivateAssetDescriptor(promotionId, crypto.randomUUID(), file);
    onProgress?.(10);
    const resource: ResourceLink = {
      id: descriptor.id,
      promotionId,
      provider: 'SUPABASE_STORAGE',
      resourceType: descriptor.resourceType,
      url: descriptor.path,
      storagePath: descriptor.path,
      displayName: descriptor.displayName,
      validationStatus: 'VALID',
      validationMessage: 'Stored in the private promotion-assets bucket.',
      attachedByName: 'Alex Rivera',
      attachedAt: new Date().toISOString(),
      archivedAt: null,
    };
    onProgress?.(35);
    demoPrivateAssets.set(descriptor.path, file);
    resourcesByPromotion.set(promotionId, [
      resource,
      ...(resourcesByPromotion.get(promotionId) ?? []),
    ]);
    transition(item, item.status, 'PrivateAssetUploaded');
    onProgress?.(100);
  },

  async getPrivateAssetUrl(storagePath) {
    const file = demoPrivateAssets.get(storagePath);
    if (!file) {
      throw new DomainError({ code: 'NOT_FOUND', message: 'Private asset not found.' });
    }
    if (typeof URL.createObjectURL === 'function') return URL.createObjectURL(file);
    return `data:${file.type},Demo%20private%20asset`;
  },
};

export const demoUser = profiles[0]!;
