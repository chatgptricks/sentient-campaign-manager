import { requireInternalOrRoles } from '../_shared/auth/index.ts';
import { createServiceClient } from '../_shared/database.ts';
import { assertMethod, assertUuid } from '../_shared/errors.ts';
import { functionHandler } from '../_shared/function-handler.ts';
import { jsonResponse, readJson } from '../_shared/http.ts';
import { requestIdempotencyKey } from '../_shared/idempotency.ts';
import { serve } from '../_shared/runtime.ts';
import { sendNotificationRecord } from '../_shared/services/notification-delivery.ts';

type SendNotificationBody = { notificationId?: string; notification_id?: string };

export const handleRequest = functionHandler('send-notification', async (request) => {
  assertMethod(request);
  await requireInternalOrRoles(request, ['ADMINISTRATOR']);
  const body = await readJson<SendNotificationBody>(request);
  const notificationId = body.notificationId ?? body.notification_id;
  assertUuid(notificationId, 'notificationId');
  const key = requestIdempotencyKey(request, `notification:${notificationId}:send`);
  const result = await sendNotificationRecord(createServiceClient(), notificationId, key);
  return jsonResponse(request, result);
});

serve(handleRequest);
