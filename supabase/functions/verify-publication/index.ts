import { authenticateUser, hasRole, isInternalRequest } from '../_shared/auth/index.ts';
import { createServiceClient } from '../_shared/database.ts';
import { assertMethod, assertUuid, databaseError, HttpError } from '../_shared/errors.ts';
import { functionHandler } from '../_shared/function-handler.ts';
import { jsonResponse, readJson } from '../_shared/http.ts';
import { requestIdempotencyKey } from '../_shared/idempotency.ts';
import { serve } from '../_shared/runtime.ts';
import {
  verifyPublicationRecord,
  type VerificationInput,
} from '../_shared/services/publication-verification.ts';

type VerifyPublicationBody = VerificationInput & {
  publicationId?: string;
  publication_id?: string;
};

export const handleRequest = functionHandler('verify-publication', async (request) => {
  assertMethod(request);
  const internal = await isInternalRequest(request);
  const auth = internal ? undefined : await authenticateUser(request);
  const body = await readJson<VerifyPublicationBody>(request);
  const publicationId = body.publicationId ?? body.publication_id;
  assertUuid(publicationId, 'publicationId');
  if (body.status && !['FAILED', 'UNAVAILABLE', 'VERIFIED'].includes(body.status)) {
    throw new HttpError(400, 'VERIFICATION_STATUS_INVALID', 'Verification status is invalid.');
  }
  if (internal && body.status) {
    throw new HttpError(
      403,
      'MANUAL_VERIFICATION_REQUIRES_USER',
      'Internal requests cannot assert manual verification.',
    );
  }

  const client = createServiceClient();
  if (auth) {
    const { data: publication, error } = await client
      .from('publications')
      .select('promotion_id,promotions(sales_owner_id,publisher_id)')
      .eq('id', publicationId)
      .maybeSingle();
    if (error) throw databaseError(error, 'Publication access could not be checked.');
    if (!publication)
      throw new HttpError(404, 'PUBLICATION_NOT_FOUND', 'Publication was not found.');
    const relation = Array.isArray(publication.promotions)
      ? publication.promotions[0]
      : publication.promotions;
    const promotion = relation as { publisher_id?: string | null; sales_owner_id?: string } | null;
    const canVerify =
      hasRole(auth, 'ADMINISTRATOR') ||
      (hasRole(auth, 'SALES') && promotion?.sales_owner_id === auth.user.id) ||
      (hasRole(auth, 'PUBLISHER') && promotion?.publisher_id === auth.user.id);
    if (!canVerify) throw new HttpError(403, 'FORBIDDEN', 'You cannot verify this publication.');
  }

  const key = requestIdempotencyKey(
    request,
    `publication:${publicationId}:verify:${body.status ?? 'automatic'}`,
  );
  const result = await verifyPublicationRecord(client, publicationId, key, body, auth);
  return jsonResponse(request, result);
});

serve(handleRequest);
