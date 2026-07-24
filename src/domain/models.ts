import type { PromotionStatus } from './promotion-status';
import type { RoleCode } from './permissions';
import type { PublishingChannel } from './channels';

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  roles: RoleCode[];
  slackUserId?: string | null;
}

export interface Client {
  id: string;
  name: string;
  billingEmail: string | null;
  billingAddress: string | null;
  externalAccountingId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface Promotion {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  description: string | null;
  status: PromotionStatus;
  salesOwnerId: string;
  salesOwnerName: string;
  creatorId: string | null;
  creatorName: string | null;
  approverId: string | null;
  approverName: string | null;
  dueDate: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  cancellationReason: string | null;
  allowedActions: PromotionAction[];
}

export type CampaignPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface CampaignMetadata {
  promotionId: string;
  campaignType: string;
  scheduledDate: string | null;
  priority: CampaignPriority;
  briefUrl: string | null;
  clientMaterialLinks: string[];
  externalResourceLinks: string[];
  platforms: string[];
  publishingAccountIds: string[];
  externalPartnerAccountIds: string[];
  internalNotes: string | null;
}

export interface PromotionChannelSheet {
  id: string;
  promotionId: string;
  sheetUrl: string;
  spreadsheetId: string;
  sheetGid: string | null;
  sheetName: string | null;
  lastSyncedAt: string | null;
}

export interface PromotionChannelSheetItem {
  id: string;
  sheetId: string;
  rowNumber: number;
  crmItemId: string;
  platform: PublishingChannel | null;
  accountName: string;
  handle: string;
  accountUrl: string | null;
  displayName: string;
  headers: string[];
  ownershipType: PublishingAccountOwnership;
  partnerName: string | null;
  active: boolean;
  notes: string | null;
  rowValues: string[];
}

export type PromotionAction =
  | 'UPDATE_PROMOTION'
  | 'CANCEL_PROMOTION'
  | 'ASSIGN_SALES_OWNER'
  | 'ASSIGN_CREATOR'
  | 'ASSIGN_APPROVER'
  | 'START_CREATIVE_WORK'
  | 'ATTACH_RESOURCE'
  | 'SUBMIT_FOR_APPROVAL'
  | 'DECIDE_APPROVAL'
  | 'START_PUBLISHING'
  | 'RECORD_PUBLICATION'
  | 'CREATE_INVOICE'
  | 'MARK_COMPLETED';

export interface ResourceLink {
  id: string;
  promotionId: string;
  provider: 'CANVA' | 'GOOGLE_DRIVE' | 'DROPBOX' | 'SUPABASE_STORAGE' | 'OTHER';
  resourceType: string;
  url: string;
  storagePath: string | null;
  displayName: string;
  validationStatus: 'PENDING' | 'VALID' | 'INVALID' | 'UNAVAILABLE';
  validationMessage: string | null;
  attachedByName: string;
  attachedAt: string;
  archivedAt: string | null;
}

export interface ApprovalSubmission {
  id: string;
  promotionId: string;
  submissionNumber: number;
  resourceLinkId: string;
  resourceName: string;
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  state: 'PENDING' | 'APPROVED' | 'REVISION_REQUESTED' | 'SUPERSEDED';
  decisionComments: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
}

export type PublicationVerificationStatus = 'VERIFIED' | 'FAILED' | 'UNAVAILABLE';

export type PublicationVerificationMethod = 'MANUAL' | 'PROVIDER_API' | 'AUTOMATED_CHECK';

export interface PublicationVerification {
  id: string;
  publicationId: string;
  promotionId: string;
  status: PublicationVerificationStatus;
  details: Record<string, unknown>;
  method: PublicationVerificationMethod;
  verifiedAt: string;
}

export interface Publication {
  id: string;
  promotionId: string;
  publishingAccountId: string | null;
  promotionChannelSheetItemId: string | null;
  provider: string;
  destination: string;
  publicationUrl: string;
  externalPublicationId: string | null;
  artifactResourceLinkId: string;
  artifactName: string;
  publishedByName: string;
  publishedAt: string;
  verificationStatus: PublicationVerificationStatus | null;
  verifiedAt: string | null;
  verifications: PublicationVerification[];
}

export interface Invoice {
  id: string;
  promotionId: string;
  clientId: string;
  invoiceNumber: string | null;
  amount: number;
  currency: string;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'VOID' | 'FAILED';
  issuedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  eventType: string;
  actorName: string | null;
  createdAt: string;
  correlationId: string;
  metadata: Record<string, unknown>;
}

export interface Notification {
  id: string;
  promotionId: string | null;
  type: string;
  channel: 'IN_APP' | 'EMAIL' | 'SLACK';
  subject: string;
  body: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  createdAt: string;
  readAt: string | null;
}

export interface PromotionDetail {
  promotion: Promotion;
  metadata: CampaignMetadata | null;
  channelSheet: PromotionChannelSheet | null;
  channelSheetItems: PromotionChannelSheetItem[];
  resources: ResourceLink[];
  submissions: ApprovalSubmission[];
  publications: Publication[];
  invoice: Invoice | null;
  activity: ActivityEvent[];
}

export interface FinanceCalendarEvent {
  id: string;
  promotionId: string;
  title: string;
  clientName: string;
  date: string;
  status: Invoice['status'];
  amount: number;
  currency: string;
  invoiceNumber: string | null;
}

export type PublishingAccountOwnership = 'SENTIENT_OWNED' | 'CLIENT_OWNED' | 'EXTERNAL_PARTNER';

export interface PublishingAccount {
  id: string;
  platform: PublishingChannel;
  accountName: string;
  handle: string;
  accountUrl: string;
  ownershipType: PublishingAccountOwnership;
  partnerName: string | null;
  active: boolean;
  defaultPublisherName: string | null;
  notes: string | null;
}

export interface DashboardData {
  promotions: Promotion[];
  counts: Partial<Record<PromotionStatus, number>>;
  attention: Promotion[];
  overdue: Promotion[];
  recentActivity: ActivityEvent[];
  myAssignments: Promotion[];
}

export interface IntegrationConnection {
  id: string;
  provider: string;
  status: 'MANUAL' | 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED';
  lastTestedAt: string | null;
  mode: 'MANUAL' | 'AUTOMATED';
}

export interface OperationsHealth {
  pendingOutbox: number;
  failedOutbox: number;
  deadLetter: number;
  stuckProcessing: number;
  failedAttempts: number;
  connections: IntegrationConnection[];
  failedJobs: FailedOutboxJob[];
}

export interface FailedOutboxJob {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  status: 'FAILED' | 'DEAD_LETTER';
  attemptCount: number;
  errorCode: string | null;
  availableAt: string;
  createdAt: string;
}
