import { authenticateUser } from '../_shared/auth/index.ts';
import { createServiceClient } from '../_shared/database.ts';
import { assertMethod, assertUuid, databaseError, HttpError } from '../_shared/errors.ts';
import { functionHandler } from '../_shared/function-handler.ts';
import { jsonResponse, readJson } from '../_shared/http.ts';
import { requestIdempotencyKey } from '../_shared/idempotency.ts';
import { serve } from '../_shared/runtime.ts';
import { validateResourceRecord } from '../_shared/services/resource-validation.ts';

type ValidateResourceBody = { resourceId?: string; resource_id?: string };

export const handleRequest = functionHandler('validate-resource', async (request) => {
  assertMethod(request);
  const auth = await authenticateUser(request);
  const body = await readJson<ValidateResourceBody>(request);
  const resourceId = body.resourceId ?? body.resource_id;
  assertUuid(resourceId, 'resourceId');

  const { data: visible, error } = await auth.userClient
    .from('promotion_resource_links')
    .select('id')
    .eq('id', resourceId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw databaseError(error, 'Resource access could not be checked.');
  if (!visible) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');

  const key = requestIdempotencyKey(request, `resource:${resourceId}:validate`);
  const result = await validateResourceRecord(createServiceClient(), resourceId, key);
  return jsonResponse(request, result);
});

serve(handleRequest);
