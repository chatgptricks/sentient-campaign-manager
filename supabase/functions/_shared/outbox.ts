import type { DatabaseClient } from './database.ts';
import { databaseError, HttpError } from './errors.ts';
import { executeIdempotently, recordIntegrationAttempt } from './idempotency.ts';
import { sanitizeText } from './logging.ts';
import { syncInvoiceRecord } from './services/invoice-sync.ts';
import { sendNotificationRecord } from './services/notification-delivery.ts';
import { verifyPublicationRecord } from './services/publication-verification.ts';
import { validateResourceRecord } from './services/resource-validation.ts';

export type OutboxEvent = {
  aggregate_id: string;
  aggregate_type: string;
  attempt_count: number;
  event_type: string;
  id: string;
  payload_json: Record<string, unknown>;
};

export function calculateBackoffSeconds(
  attemptCount: number,
  baseSeconds = 5,
  maximumSeconds = 900,
): number {
  const exponent = Math.max(1, Math.min(10, attemptCount));
  return Math.min(maximumSeconds, baseSeconds * 2 ** exponent);
}

function requiredPayloadId(event: OutboxEvent, snakeCase: string, camelCase: string): string {
  const value = event.payload_json[snakeCase] ?? event.payload_json[camelCase];
  if (typeof value !== 'string' || !value) {
    throw new HttpError(422, 'OUTBOX_PAYLOAD_INVALID', `${snakeCase} is required.`);
  }
  return value;
}

async function createPayloadNotification(
  client: DatabaseClient,
  event: OutboxEvent,
): Promise<Record<string, unknown>> {
  const payload = event.payload_json;
  const promotionId = event.aggregate_type === 'Promotion' ? event.aggregate_id : null;
  const recipients = new Set<string>();
  const explicitRecipient = payload.recipient_user_id ?? payload.recipientUserId;
  if (typeof explicitRecipient === 'string') recipients.add(explicitRecipient);
  const assignedRecipient = payload.assignedUserId ?? payload.assigned_user_id;
  const approverRecipient = payload.approverId ?? payload.approver_id;
  if (
    ['CreatorAssigned', 'ApproverAssigned', 'PublisherAssigned'].includes(event.event_type) &&
    typeof assignedRecipient === 'string'
  ) {
    recipients.add(assignedRecipient);
  }
  if (event.event_type === 'ApprovalSubmitted' && typeof approverRecipient === 'string') {
    recipients.add(approverRecipient);
  }

  let promotion: {
    approver_id: string | null;
    creator_id: string | null;
    publisher_id: string | null;
    sales_owner_id: string;
  } | null = null;
  if (promotionId) {
    const { data, error } = await client
      .from('promotions')
      .select('sales_owner_id,creator_id,approver_id,publisher_id')
      .eq('id', promotionId)
      .maybeSingle();
    if (error) throw databaseError(error, 'Promotion notification recipients could not be loaded.');
    promotion = data;
  }
  if (promotion) {
    if (['PromotionApproved', 'PromotionRevisionRequested'].includes(event.event_type)) {
      recipients.add(promotion.sales_owner_id);
      if (promotion.creator_id) recipients.add(promotion.creator_id);
    }
    if (
      [
        'CreativeWorkStarted',
        'InvoiceFailed',
        'InvoiceIssued',
        'InvoicePaid',
        'InvoiceVoided',
        'PublicationRecorded',
        'PublicationVerified',
      ].includes(event.event_type)
    ) {
      recipients.add(promotion.sales_owner_id);
    }
    if (event.event_type === 'PublicationVerificationFailed') {
      recipients.add(promotion.sales_owner_id);
      if (promotion.publisher_id) recipients.add(promotion.publisher_id);
    }
    if (event.event_type === 'PromotionCancelled') {
      recipients.add(promotion.sales_owner_id);
      for (const userId of [promotion.creator_id, promotion.approver_id, promotion.publisher_id]) {
        if (userId) recipients.add(userId);
      }
    }
  }
  if (event.event_type === 'PromotionReadyForInvoicing') {
    const { data, error } = await client
      .from('user_roles')
      .select('user_id,profiles!inner(status),roles!inner(code)')
      .eq('profiles.status', 'ACTIVE')
      .in('roles.code', ['FINANCE', 'ADMINISTRATOR']);
    if (error) throw databaseError(error, 'Finance notification recipients could not be loaded.');
    for (const row of data ?? []) recipients.add(row.user_id);
  }
  if (recipients.size === 0) return { handled: false, reason: 'NO_REGISTERED_EFFECT' };

  const subject =
    typeof payload.subject === 'string'
      ? payload.subject
      : event.event_type.replace(/([a-z])([A-Z])/g, '$1 $2');
  const body =
    typeof payload.body === 'string'
      ? payload.body
      : 'A promotion you are involved with has new activity.';
  const notificationType = `${event.event_type}:${event.id}`;
  const notificationIds: string[] = [];
  for (const userId of recipients) {
    const { data: existing, error: existingError } = await client
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', notificationType)
      .limit(1)
      .maybeSingle();
    if (existingError) {
      throw databaseError(existingError, 'Outbox notification idempotency could not be checked.');
    }
    if (existing) {
      notificationIds.push(existing.id);
      continue;
    }
    const { data, error } = await client
      .from('notifications')
      .insert({
        body,
        channel: 'IN_APP',
        promotion_id: promotionId,
        sent_at: new Date().toISOString(),
        status: 'SENT',
        subject,
        type: notificationType,
        user_id: userId,
      })
      .select('id')
      .single();
    if (error) throw databaseError(error, 'Outbox notification could not be created.');
    notificationIds.push(data.id);
  }
  return { handled: true, notificationIds };
}

export async function routeOutboxEvent(
  client: DatabaseClient,
  event: OutboxEvent,
): Promise<Record<string, unknown>> {
  const idempotencyKey = `outbox:${event.id}`;
  switch (event.event_type) {
    case 'ResourceAttached':
      return validateResourceRecord(
        client,
        requiredPayloadId(event, 'resource_id', 'resourceId'),
        `${idempotencyKey}:validate-resource`,
      );
    case 'PublicationVerificationRequested': {
      const verification = await verifyPublicationRecord(
        client,
        requiredPayloadId(event, 'publication_id', 'publicationId'),
        `${idempotencyKey}:verify-publication`,
      );
      // The verification RPC emits its own success/failure event. That event is the
      // single notification source, which prevents duplicate failure messages.
      return { verification };
    }
    case 'InvoiceCreated':
      return syncInvoiceRecord(
        client,
        requiredPayloadId(event, 'invoice_id', 'invoiceId'),
        `${idempotencyKey}:sync-invoice`,
      );
    case 'NotificationCreated':
    case 'NotificationDeliveryRequested':
      return sendNotificationRecord(
        client,
        requiredPayloadId(event, 'notification_id', 'notificationId'),
        `${idempotencyKey}:send-notification`,
      );
    default:
      return createPayloadNotification(client, event);
  }
}

async function markProcessed(
  client: DatabaseClient,
  event: OutboxEvent,
  workerId: string,
): Promise<void> {
  const { error } = await client.rpc('complete_outbox_event', {
    event_id: event.id,
    worker_id: workerId,
  });
  if (error) throw databaseError(error, 'Outbox event could not be marked processed.');
}

async function markFailed(
  client: DatabaseClient,
  event: OutboxEvent,
  workerId: string,
  error: unknown,
): Promise<'DEAD_LETTER' | 'FAILED'> {
  const errorCode = sanitizeText(
    error instanceof Error ? error.message : 'Outbox handler failed.',
  ).slice(0, 500);
  const { data, error: rpcError } = await client.rpc('fail_outbox_event', {
    error_code: errorCode,
    event_id: event.id,
    worker_id: workerId,
  });
  if (rpcError) throw databaseError(rpcError, 'Outbox failure state could not be saved.');
  return data === 'DEAD_LETTER' ? 'DEAD_LETTER' : 'FAILED';
}

export async function processClaimedEvents(
  client: DatabaseClient,
  events: OutboxEvent[],
  workerId: string,
): Promise<{ deadLetter: number; failed: number; processed: number; results: unknown[] }> {
  const summary = { deadLetter: 0, failed: 0, processed: 0, results: [] as unknown[] };
  for (const event of events) {
    try {
      const routeKey = `outbox:${event.id}:route`;
      const result = await executeIdempotently(
        client,
        'OUTBOX',
        event.event_type,
        routeKey,
        async () => {
          const routed = await routeOutboxEvent(client, event);
          await recordIntegrationAttempt(client, {
            aggregateId: event.aggregate_id,
            idempotencyKey: routeKey,
            operation: event.event_type,
            provider: 'OUTBOX',
            responseMetadata: routed,
            status: 'SUCCEEDED',
          });
          return routed;
        },
      );
      await markProcessed(client, event, workerId);
      summary.processed += 1;
      summary.results.push({ eventId: event.id, result, status: 'PROCESSED' });
    } catch (error) {
      const status = await markFailed(client, event, workerId, error);
      await recordIntegrationAttempt(client, {
        aggregateId: event.aggregate_id,
        errorCode: error instanceof HttpError ? error.code : 'OUTBOX_HANDLER_ERROR',
        idempotencyKey: `outbox:${event.id}:route:failure:${crypto.randomUUID()}`,
        operation: event.event_type,
        provider: 'OUTBOX',
        responseMetadata: { status },
        status: 'FAILED',
      });
      if (status === 'DEAD_LETTER') summary.deadLetter += 1;
      else summary.failed += 1;
      summary.results.push({ eventId: event.id, status });
    }
  }
  return summary;
}
