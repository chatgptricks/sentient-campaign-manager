import type {
  Client,
  DashboardData,
  Invoice,
  Notification,
  OperationsHealth,
  Profile,
  Promotion,
  PromotionDetail,
} from '../../domain/models';
import type { RoleCode } from '../../domain/permissions';
import type {
  ApprovalDecisionInput,
  ClientInput,
  InvoiceInput,
  PromotionInput,
  PublicationInput,
  ResourceLinkInput,
  VerificationInput,
} from '../validation/schemas';

export type AssignmentRole = 'SALES_OWNER' | 'CREATOR' | 'APPROVER' | 'PUBLISHER';

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
  listPromotions(input?: ListPromotionsInput): Promise<Promotion[]>;
  getPromotion(id: string): Promise<PromotionDetail>;
  listClients(): Promise<Client[]>;
  listProfiles(role?: RoleCode): Promise<Profile[]>;
  listNotifications(): Promise<Notification[]>;
  getOperationsHealth(): Promise<OperationsHealth>;
  inviteUser(input: { email: string; displayName: string; roles: RoleCode[] }): Promise<void>;
  replaceUserRoles(profileId: string, roles: RoleCode[]): Promise<void>;
  setProfileStatus(profileId: string, status: Profile['status']): Promise<void>;
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
  requestVerification(publicationId: string, version: number): Promise<void>;
  recordVerification(
    publicationId: string,
    input: VerificationInput,
    version: number,
  ): Promise<void>;
  completeVerifiedWorkflow(id: string, version: number): Promise<void>;
  createInvoice(id: string, input: InvoiceInput, version: number): Promise<void>;
  setInvoiceStatus(
    invoiceId: string,
    status: Invoice['status'],
    version: number,
    invoiceNumber?: string,
  ): Promise<void>;
  markNotificationRead(id: string): Promise<void>;
  attachPrivateAsset(
    promotionId: string,
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<void>;
  getPrivateAssetUrl(storagePath: string): Promise<string>;
}
