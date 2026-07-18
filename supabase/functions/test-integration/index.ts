import { authenticateUser, requireAnyRole } from '../_shared/auth/index.ts';
import { createServiceClient } from '../_shared/database.ts';
import { assertMethod } from '../_shared/errors.ts';
import { functionHandler } from '../_shared/function-handler.ts';
import { jsonResponse, readJson } from '../_shared/http.ts';
import { requestIdempotencyKey } from '../_shared/idempotency.ts';
import { serve } from '../_shared/runtime.ts';
import { testIntegrationConnection } from '../_shared/services/integration-test.ts';

type TestIntegrationBody = { provider?: string };

export const handleRequest = functionHandler('test-integration', async (request) => {
  assertMethod(request);
  const auth = await authenticateUser(request);
  requireAnyRole(auth, ['ADMINISTRATOR']);
  const body = await readJson<TestIntegrationBody>(request);
  const provider = body.provider?.trim();
  const key = requestIdempotencyKey(
    request,
    `integration-test:${provider ?? 'unknown'}:${crypto.randomUUID()}`,
  );
  const result = await testIntegrationConnection(createServiceClient(), provider ?? '', key);
  return jsonResponse(request, result);
});

serve(handleRequest);
