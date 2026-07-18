import type { ResourceProvider } from '../ssrf.ts';

export type ResourceReference = {
  displayName: string;
  externalId?: string | null;
  promotionId?: string;
  provider: ResourceProvider;
  resourceId?: string;
  resourceType: string;
  url: string;
};

export type ResourceValidationResult = {
  availability: 'AVAILABLE' | 'NOT_CHECKED' | 'UNAVAILABLE';
  message: string;
  metadata: Record<string, unknown>;
  status: 'VALID' | 'INVALID' | 'UNAVAILABLE';
};

export type ResourceMetadata = {
  host: string;
  provider: ResourceProvider;
};

export interface CreativeResourceAdapter {
  validate(reference: ResourceReference): Promise<ResourceValidationResult>;
  getMetadata(reference: ResourceReference): Promise<ResourceMetadata>;
}

export type NotificationMessage = {
  body: string;
  channel: 'EMAIL' | 'IN_APP' | 'SLACK';
  idempotencyKey: string;
  recipient?: string;
  subject: string;
};

export type NotificationDeliveryResult = {
  delivered: boolean;
  externalId?: string;
  message: string;
  mode: 'MANUAL' | 'PROVIDER' | 'SYSTEM';
  status: 'MANUAL_REQUIRED' | 'SENT';
};

export interface NotificationAdapter {
  readonly configured: boolean;
  readonly provider: string;
  send(message: NotificationMessage): Promise<NotificationDeliveryResult>;
}

export type PublicationReference = {
  destination: string;
  externalPublicationId?: string | null;
  manualDetails?: Record<string, unknown>;
  manualStatus?: 'FAILED' | 'UNAVAILABLE' | 'VERIFIED';
  provider: string;
  url: string;
};

export type VerificationResult = {
  details: Record<string, unknown>;
  method: 'AUTOMATED_CHECK' | 'MANUAL' | 'PROVIDER_API';
  status: 'FAILED' | 'UNAVAILABLE' | 'VERIFIED';
};

export interface PublishingAdapter {
  readonly provider: string;
  verify(reference: PublicationReference): Promise<VerificationResult>;
}

export type InvoiceSyncRequest = {
  amount: number;
  clientId: string;
  currency: string;
  externalInvoiceId?: string | null;
  invoiceId: string;
  invoiceNumber?: string | null;
  localStatus: string;
  promotionId: string;
};

export type InvoiceSyncResult = {
  externalInvoiceId?: string;
  message: string;
  mode: 'MANUAL' | 'PROVIDER';
  status: 'MANUAL_REQUIRED' | 'SYNCED';
};

export interface AccountingAdapter {
  readonly configured: boolean;
  readonly provider: string;
  createInvoice(request: InvoiceSyncRequest): Promise<InvoiceSyncResult>;
}
