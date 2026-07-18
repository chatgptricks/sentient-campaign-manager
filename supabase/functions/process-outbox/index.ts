import { requireInternalOrRoles } from '../_shared/auth/index.ts';
import { createServiceClient } from '../_shared/database.ts';
import { assertMethod, databaseError } from '../_shared/errors.ts';
import { functionHandler } from '../_shared/function-handler.ts';
import { jsonResponse, readJson } from '../_shared/http.ts';
import { processClaimedEvents, type OutboxEvent } from '../_shared/outbox.ts';
import { enforceEdgeRateLimit } from '../_shared/rate-limit.ts';
import { serve } from '../_shared/runtime.ts';

type ProcessOutboxBody = { batchSize?: number };

export const handleRequest = functionHandler('process-outbox', async (request) => {
  assertMethod(request);
  const client = createServiceClient();
  await enforceEdgeRateLimit(client, request, {
    limit: 30,
    scope: 'process-outbox',
    windowSeconds: 60,
  });
  await requireInternalOrRoles(request, ['ADMINISTRATOR'], { allowOutboxSecret: true });
  const body = await readJson<ProcessOutboxBody>(request);
  const requestedBatch = Number.isInteger(body.batchSize) ? Number(body.batchSize) : 10;
  const batchSize = Math.max(1, Math.min(50, requestedBatch));
  const workerId = `edge-${crypto.randomUUID()}`;
  const { data, error } = await client.rpc('claim_outbox_events', {
    batch_size: batchSize,
    worker_id: workerId,
  });
  if (error) throw databaseError(error, 'Outbox events could not be claimed.');
  const events = (Array.isArray(data) ? data : []) as OutboxEvent[];
  const summary = await processClaimedEvents(client, events, workerId);
  return jsonResponse(request, { claimed: events.length, workerId, ...summary });
});

serve(handleRequest);
