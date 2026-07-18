import { createServiceClient } from '../_shared/database.ts';
import { getEnv } from '../_shared/env.ts';
import { assertMethod, databaseError, HttpError } from '../_shared/errors.ts';
import { functionHandler } from '../_shared/function-handler.ts';
import { jsonResponse } from '../_shared/http.ts';
import { recordIntegrationAttempt } from '../_shared/idempotency.ts';
import { enforceEdgeRateLimit } from '../_shared/rate-limit.ts';
import { serve } from '../_shared/runtime.ts';
import { sha256Hex, verifyWebhookSignature } from '../_shared/webhook.ts';

function providerCode(request: Request): string {
  const provider = request.headers.get('x-provider')?.trim().toUpperCase();
  if (!provider || !/^[A-Z0-9_-]{2,50}$/.test(provider)) {
    throw new HttpError(400, 'PROVIDER_INVALID', 'x-provider is invalid.');
  }
  return provider;
}

function eventIdFrom(request: Request, payload: unknown): string {
  const headerValue = request.headers.get('x-event-id')?.trim();
  const objectValue =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? ((payload as Record<string, unknown>).event_id ?? (payload as Record<string, unknown>).id)
      : undefined;
  const eventId = headerValue ?? (typeof objectValue === 'string' ? objectValue.trim() : undefined);
  if (!eventId || eventId.length > 200 || /[\u0000-\u001f]/.test(eventId)) {
    throw new HttpError(400, 'WEBHOOK_EVENT_ID_INVALID', 'A valid external event ID is required.');
  }
  return eventId;
}

export const handleRequest = functionHandler('provider-webhook', async (request) => {
  assertMethod(request);
  const client = createServiceClient();
  await enforceEdgeRateLimit(client, request, {
    limit: 120,
    scope: 'provider-webhook',
    windowSeconds: 60,
  });
  const provider = providerCode(request);
  const signature = request.headers.get('x-webhook-signature')?.trim();
  const timestamp = request.headers.get('x-webhook-timestamp')?.trim();
  if (!signature || !timestamp) {
    throw new HttpError(
      401,
      'WEBHOOK_SIGNATURE_REQUIRED',
      'Webhook signature headers are required.',
    );
  }
  const secret = getEnv(`WEBHOOK_SECRET_${provider.replaceAll('-', '_')}`);
  if (!secret) {
    throw new HttpError(503, 'WEBHOOK_NOT_CONFIGURED', 'This webhook provider is not configured.');
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 1_000_000) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Webhook body is too large.');
  }
  await verifyWebhookSignature({ rawBody, secret, signature, timestamp });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Webhook body must be valid JSON.');
  }
  if (!payload || typeof payload !== 'object') {
    throw new HttpError(
      400,
      'WEBHOOK_PAYLOAD_INVALID',
      'Webhook payload must be an object or array.',
    );
  }
  const externalEventId = eventIdFrom(request, payload);
  const checksum = await sha256Hex(rawBody);

  const { data: existing, error: existingError } = await client
    .from('inbox_events')
    .select('id,payload_checksum,status')
    .eq('provider', provider)
    .eq('external_event_id', externalEventId)
    .maybeSingle();
  if (existingError)
    throw databaseError(existingError, 'Webhook deduplication could not be checked.');
  if (existing) {
    throw new HttpError(
      409,
      existing.payload_checksum === checksum ? 'WEBHOOK_DUPLICATE' : 'WEBHOOK_EVENT_ID_REUSED',
      existing.payload_checksum === checksum
        ? 'This webhook event was already received.'
        : 'This event ID was already used with a different payload.',
    );
  }

  const { data: inbox, error: insertError } = await client
    .from('inbox_events')
    .insert({
      external_event_id: externalEventId,
      payload_checksum: checksum,
      payload_json: payload,
      provider,
      status: 'RECEIVED',
    })
    .select('id')
    .single();
  if (insertError) {
    if (insertError.code === '23505') {
      throw new HttpError(409, 'WEBHOOK_DUPLICATE', 'This webhook event was already received.');
    }
    throw databaseError(insertError, 'Webhook event could not be stored.');
  }

  const processedAt = new Date().toISOString();
  const { error: processError } = await client
    .from('inbox_events')
    .update({ processed_at: processedAt, status: 'PROCESSED' })
    .eq('id', inbox.id)
    .eq('status', 'RECEIVED');
  if (processError) throw databaseError(processError, 'Webhook receipt could not be finalized.');

  await recordIntegrationAttempt(client, {
    idempotencyKey: `webhook:${provider}:${externalEventId}`,
    operation: 'RECEIVE_WEBHOOK',
    provider,
    requestMetadata: { externalEventId, inboxEventId: inbox.id, payloadChecksum: checksum },
    responseMetadata: { domainEffect: 'NONE_REGISTERED', status: 'PROCESSED' },
    status: 'SUCCEEDED',
  });
  return jsonResponse(
    request,
    {
      accepted: true,
      domainEffect: 'NONE_REGISTERED',
      eventId: inbox.id,
      status: 'PROCESSED',
    },
    202,
  );
});

serve(handleRequest);
