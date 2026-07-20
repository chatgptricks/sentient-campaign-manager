import { SlackNotificationAdapter } from './adapters/notification.ts';
import type { DatabaseClient } from './database.ts';
import { getEnv } from './env.ts';
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
  if (
    ['CreatorAssigned', 'ApproverAssigned', 'PublisherAssigned'].includes(event.event_type) &&
    typeof assignedRecipient === 'string'
  ) {
    recipients.add(assignedRecipient);
  }

  let promotion: {
    creator_id: string | null;
    sales_owner_id: string;
  } | null = null;
  if (promotionId) {
    const { data, error } = await client
      .from('promotions')
      .select('sales_owner_id,creator_id')
      .eq('id', promotionId)
      .maybeSingle();
    if (error) throw databaseError(error, 'Promotion notification recipients could not be loaded.');
    promotion = data;
  }
  if (promotion) {
    if (
      ['ApprovalSubmitted', 'PromotionApproved', 'PromotionRevisionRequested'].includes(
        event.event_type,
      )
    ) {
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
      if (promotion.creator_id) recipients.add(promotion.creator_id);
    }
    if (event.event_type === 'PromotionCancelled') {
      recipients.add(promotion.sales_owner_id);
      for (const userId of [promotion.creator_id]) {
        if (userId) recipients.add(userId);
      }
    }
  }
  if (event.event_type === 'PromotionReadyForInvoicing') {
    const { data, error } = await client.from('user_roles').select('user_id, roles(code)');
    if (error) throw databaseError(error, 'Finance notification recipients could not be loaded.');
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      const relation = row.roles;
      const values = Array.isArray(relation) ? relation : [relation];
      for (const val of values) {
        if (val && typeof val === 'object' && 'code' in val) {
          const code = String((val as { code: unknown }).code).toUpperCase();
          if (['SALES', 'ADMINISTRATOR'].includes(code) && typeof row.user_id === 'string') {
            recipients.add(row.user_id);
          }
        }
      }
    }
  }
  if (recipients.size === 0) return { handled: false, reason: 'NO_REGISTERED_EFFECT' };

  let promotionTitle = 'Promotion';
  let promoUrl = '';
  if (promotionId) {
    const { data: promoData } = await client
      .from('promotions')
      .select('title')
      .eq('id', promotionId)
      .maybeSingle();
    if (promoData?.title) promotionTitle = promoData.title;
    // SITE_URL when the deployment provides it, otherwise the known production host so
    // Slack messages never lose their promotion link.
    const siteUrl =
      getEnv('SITE_URL')?.trim() || 'https://chatgptricks.github.io/sentient-campaign-manager/';
    promoUrl = `${siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`}#/promotions/${promotionId}`;
  }

  let actorName = 'Someone';
  const actorId = payload.actor_id ?? payload.actorId;
  if (typeof actorId === 'string') {
    const { data: actorProfile } = await client
      .from('profiles')
      .select('display_name')
      .eq('id', actorId)
      .maybeSingle();
    if (actorProfile?.display_name) actorName = actorProfile.display_name;
  }

  let body = typeof payload.body === 'string' ? payload.body : '';
  if (!body) {
    const titleLink = promoUrl ? `<${promoUrl}|*${promotionTitle}*>` : `*${promotionTitle}*`;
    switch (event.event_type) {
      case 'CreatorAssigned':
      case 'ApproverAssigned':
      case 'PublisherAssigned': {
        const assignedId = payload.assignedUserId ?? payload.assigned_user_id;
        let assigneeTag = 'someone';
        if (typeof assignedId === 'string') {
          const { data: assigneeProfile } = await client
            .from('profiles')
            .select('display_name, slack_user_id')
            .eq('id', assignedId)
            .maybeSingle();
          if (assigneeProfile?.slack_user_id) {
            assigneeTag = `<@${assigneeProfile.slack_user_id}>`;
          } else if (assigneeProfile?.display_name) {
            assigneeTag = assigneeProfile.display_name;
          }
        }
        body = `${actorName} assigned ${titleLink} to ${assigneeTag}.`;
        break;
      }
      case 'CreativeWorkStarted':
        body = `${actorName} started creative work on ${titleLink}.`;
        break;
      case 'ApprovalSubmitted':
        body = `${actorName} submitted ${titleLink} for approval.`;
        break;
      case 'PromotionApproved':
        body = `${actorName} approved ${titleLink}.`;
        break;
      case 'PromotionRevisionRequested':
        body = `${actorName} requested revision for ${titleLink}.`;
        break;
      case 'PublicationRecorded':
        body = `${actorName} recorded publication for ${titleLink}.`;
        break;
      case 'PublicationVerificationRequested':
        body = `${actorName} requested publication verification for ${titleLink}.`;
        break;
      case 'PublicationVerified':
        body = `Publication verified for ${titleLink}.`;
        break;
      case 'InvoiceIssued':
        body = `${actorName} issued an invoice for ${titleLink}.`;
        break;
      case 'InvoicePaid':
        body = `Invoice paid for ${titleLink}.`;
        break;
      case 'PromotionCompleted':
        body = `${actorName} marked ${titleLink} as completed.`;
        break;
      case 'PromotionCancelled':
        body = `${actorName} cancelled ${titleLink}.`;
        break;
      default:
        body = `${actorName} updated ${titleLink}.`;
        break;
    }
  }

  const subject =
    typeof payload.subject === 'string'
      ? payload.subject
      : event.event_type.replace(/([a-z])([A-Z])/g, '$1 $2');
  const notificationType = `${event.event_type}:${event.id}`;
  const notificationIds: string[] = [];

  for (const userId of recipients) {
    const { data: existing } = await client
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', notificationType)
      .limit(1)
      .maybeSingle();

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

  const slack = await dispatchSlackForEvent(client, event, [...recipients], body, subject);
  return { handled: true, notificationIds, slack };
}

/**
 * Delivers one Slack activity line per event to the tracking channel, plus a DM per
 * recipient who has a Slack user ID. The channel post is deliberately outside the
 * recipient loop: fanning it out per recipient posted N identical copies.
 *
 * Failures are recorded as integration attempts so they surface in Admin > Operations
 * instead of vanishing into function logs.
 */
async function dispatchSlackForEvent(
  client: DatabaseClient,
  event: OutboxEvent,
  recipients: string[],
  body: string,
  subject: string,
): Promise<Record<string, unknown>> {
  const promotionId = event.aggregate_type === 'Promotion' ? event.aggregate_id : null;
  const adapter = new SlackNotificationAdapter();
  if (!adapter.configured) {
    return { delivered: false, reason: 'SLACK_BOT_TOKEN_MISSING' };
  }

  const attempt = async (
    operation: string,
    idempotencyKey: string,
    run: () => Promise<string | undefined>,
  ): Promise<boolean> => {
    try {
      const ts = await run();
      if (ts === undefined) return false;
      await recordIntegrationAttempt(client, {
        aggregateId: promotionId,
        idempotencyKey,
        operation,
        provider: 'SLACK',
        requestMetadata: { eventId: event.id, eventType: event.event_type, subject },
        responseMetadata: { ts },
        status: 'SUCCEEDED',
      });
      return true;
    } catch (caught) {
      const code = caught instanceof HttpError ? caught.code : 'SLACK_PROVIDER_ERROR';
      console.error(`Slack ${operation} failed for event ${event.id}: ${sanitizeText(code)}`);
      await recordIntegrationAttempt(client, {
        aggregateId: promotionId,
        errorCode: code,
        idempotencyKey: `${idempotencyKey}:failed:${crypto.randomUUID()}`,
        operation,
        provider: 'SLACK',
        requestMetadata: { eventId: event.id, eventType: event.event_type, subject },
        status: 'FAILED',
      });
      return false;
    }
  };

  const channelKey = `outbox:${event.id}:slack:channel`;
  const channelPosted = await attempt('SLACK_CHANNEL_POST', channelKey, () =>
    adapter.postToChannel(body, channelKey),
  );

  let directMessages = 0;
  for (const userId of recipients) {
    const { data: profile } = await client
      .from('profiles')
      .select('slack_user_id')
      .eq('id', userId)
      .maybeSingle();
    const slackUserId = profile?.slack_user_id;
    if (!slackUserId) continue;
    const key = `outbox:${event.id}:slack:dm:${userId}`;
    const sent = await attempt('SLACK_DIRECT_MESSAGE', key, () =>
      adapter.sendDirectMessage(slackUserId, body, key),
    );
    if (sent) directMessages += 1;
  }

  return {
    channel: adapter.trackingChannelId,
    channelPosted,
    delivered: channelPosted || directMessages > 0,
    directMessages,
  };
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
