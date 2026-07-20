import type {
  Client,
  CampaignMetadata,
  DashboardData,
  FinanceCalendarEvent,
  Invoice,
  Notification,
  OperationsHealth,
  PublishingAccount,
  Profile,
  Promotion,
  PromotionDetail,
} from '../../domain/models';
import type { RoleCode } from '../../domain/permissions';
import type {
  ApprovalDecisionInput,
  CampaignMetadataInput,
  ClientInput,
  InvoiceInput,
  PromotionInput,
  PublicationInput,
  ResourceLinkInput,
} from '../validation/schemas';

export type AssignmentRole = 'SALES_OWNER' | 'CREATOR';

export interface ListPromotionsInput {
  search?: string;
  status?: string;
  mine?: boolean;
}

export interface IntegrationTestResult {
  code: string;
  message: string;
  provider: string;
  status: 'CONNECTED' | 'MANUAL' | 'NOT_CONFIGURED' | 'UNAVAILABLE';
}

export interface CampaignService {
  getDashboard(userId: string): Promise<DashboardData>;
  listFinanceCalendarEvents(): Promise<FinanceCalendarEvent[]>;
  listPromotions(input?: ListPromotionsInput): Promise<Promotion[]>;
  getPromotion(id: string): Promise<PromotionDetail>;
  saveCampaignMetadata(id: string, input: CampaignMetadataInput): Promise<CampaignMetadata>;
  listClients(): Promise<Client[]>;
  listPublishingAccounts(): Promise<PublishingAccount[]>;
  listProfiles(role?: RoleCode): Promise<Profile[]>;
  listNotifications(): Promise<Notification[]>;
  getOperationsHealth(): Promise<OperationsHealth>;
  inviteUser(input: { email: string; displayName: string; roles: RoleCode[] }): Promise<void>;
  createUser(input: {
    email: string;
    displayName: string;
    temporaryPassword: string;
    roles: RoleCode[];
  }): Promise<void>;
  replaceUserRoles(profileId: string, roles: RoleCode[]): Promise<void>;
  setProfileStatus(profileId: string, status: Profile['status']): Promise<void>;
  deleteUser(profileId: string): Promise<void>;
  processOutbox(): Promise<{ processed: number }>;
  retryOutboxEvent(eventId: string): Promise<void>;
  testIntegration(provider: string): Promise<IntegrationTestResult>;
  createClient(input: ClientInput): Promise<Client>;
  updateClient(id: string, input: ClientInput): Promise<Client>;
  archiveClient(id: string): Promise<void>;
  createPromotion(input: PromotionInput): Promise<Promotion>;
  updatePromotion(id: string, version: number, input: Partial<PromotionInput>): Promise<Promotion>;
  cancelPromotion(id: string, version: number, reason: string): Promise<void>;
  assignRole(id: string, role: AssignmentRole, userId: string, version: number): Promise<void>;
  startCreativeWork(id: string, version: number): Promise<void>;
  attachResource(id: string, input: ResourceLinkInput): Promise<void>;
  archiveResource(resourceId: string): Promise<void>;
  submitForApproval(id: string, resourceId: string, version: number): Promise<void>;
  decideApproval(
    submissionId: string,
    input: ApprovalDecisionInput,
    version: number,
  ): Promise<void>;
  startPublishing(id: string, version: number): Promise<void>;
  recordPublication(id: string, input: PublicationInput, version: number): Promise<void>;
  createInvoice(id: string, input: InvoiceInput, version: number): Promise<void>;
  setInvoiceStatus(
    invoiceId: string,
    status: Invoice['status'],
    version: number,
    invoiceNumber?: string,
  ): Promise<void>;
  completePromotion(id: string, version: number): Promise<void>;
  markNotificationRead(id: string): Promise<void>;
  attachPrivateAsset(
    promotionId: string,
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<void>;
  getPrivateAssetUrl(storagePath: string): Promise<string>;
}
