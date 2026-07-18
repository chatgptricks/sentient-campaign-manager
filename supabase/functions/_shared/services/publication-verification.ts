import { ManualPublishingAdapter } from '../adapters/publishing.ts';
import type { AuthContext } from '../auth/index.ts';
import type { DatabaseClient } from '../database.ts';
import { databaseError, HttpError } from '../errors.ts';
import { executeIdempotently, recordIntegrationAttempt } from '../idempotency.ts';

export type VerificationInput = {
  details?: Record<string, unknown>;
  expectedVersion?: number;
  status?: 'FAILED' | 'UNAVAILABLE' | 'VERIFIED';
};

export async function verifyPublicationRecord(
  client: DatabaseClient,
  publicationId: string,
  idempotencyKey: string,
  input: VerificationInput = {},
  auth?: AuthContext,
): Promise<Record<string, unknown>> {
  const { data: publication, error } = await client
    .from('publications')
    .select(
      'id,promotion_id,provider,destination,external_publication_id,publication_url,event_type,promotions(status,version)',
    )
    .eq('id', publicationId)
    .maybeSingle();
  if (error) throw databaseError(error, 'Publication could not be loaded.');
  if (!publication || publication.event_type !== 'PUBLISHED') {
    throw new HttpError(404, 'PUBLICATION_NOT_FOUND', 'A current published record was not found.');
  }
  const provider = `PUBLISHING_${String(publication.provider).toUpperCase()}`;
  return executeIdempotently(client, provider, 'VERIFY_PUBLICATION', idempotencyKey, async () => {
    const promotionRelation = Array.isArray(publication.promotions)
      ? publication.promotions[0]
      : publication.promotions;
    if ((promotionRelation as { status?: string } | null)?.status !== 'VERIFICATION_PENDING') {
      const response = {
        publicationId: publication.id,
        reason: 'ALREADY_RESOLVED',
        skipped: true,
        status: (promotionRelation as { status?: string } | null)?.status ?? 'UNKNOWN',
      };
      await recordIntegrationAttempt(client, {
        aggregateId: publication.promotion_id,
        idempotencyKey,
        operation: 'VERIFY_PUBLICATION',
        provider,
        requestMetadata: { publicationId },
        responseMetadata: response,
        status: 'SUCCEEDED',
      });
      return response;
    }
    const { data: superseding, error: supersedingError } = await client
      .from('publications')
      .select('id')
      .eq('supersedes_publication_id', publication.id)
      .limit(1)
      .maybeSingle();
    if (supersedingError) {
      throw databaseError(supersedingError, 'Current publication state could not be checked.');
    }
    if (superseding) {
      throw new HttpError(409, 'PUBLICATION_SUPERSEDED', 'The publication is no longer current.');
    }
    if (input.status && !auth) {
      throw new HttpError(
        403,
        'MANUAL_VERIFICATION_REQUIRES_USER',
        'Manual verification requires a user.',
      );
    }

    const adapter = new ManualPublishingAdapter();
    const result = await adapter.verify({
      destination: publication.destination,
      externalPublicationId: publication.external_publication_id,
      manualDetails: input.details,
      manualStatus: input.status,
      provider: publication.provider,
      url: publication.publication_url,
    });

    let verification: unknown;
    if (result.method === 'MANUAL' && auth) {
      const expectedVersion =
        input.expectedVersion ??
        Number((promotionRelation as { version?: number } | null)?.version);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw new HttpError(400, 'EXPECTED_VERSION_REQUIRED', 'expectedVersion is required.');
      }
      const { data: rpcData, error: rpcError } = await auth.userClient.rpc(
        'record_publication_verification',
        {
          expected_version: expectedVersion,
          input: {
            details_json: result.details,
            status: result.status,
            verification_method: 'MANUAL',
          },
          publication_id: publication.id,
        },
      );
      if (rpcError) throw databaseError(rpcError, 'Publication verification was rejected.');
      verification = rpcData;
    } else {
      const expectedVersion = Number((promotionRelation as { version?: number } | null)?.version);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw new HttpError(409, 'PROMOTION_VERSION_INVALID', 'Promotion version is invalid.');
      }
      const { data: rpcData, error: rpcError } = await client.rpc(
        'record_automated_publication_verification',
        {
          expected_version: expectedVersion,
          input: {
            details_json: result.details,
            status: result.status,
            verification_method: result.method,
          },
          publication_id: publication.id,
        },
      );
      if (rpcError) {
        throw databaseError(rpcError, 'Automated publication verification was rejected.');
      }
      verification = rpcData;
    }

    const response = {
      method: result.method,
      publicationId: publication.id,
      status: result.status,
      verification,
    };
    await recordIntegrationAttempt(client, {
      aggregateId: publication.promotion_id,
      idempotencyKey,
      operation: 'VERIFY_PUBLICATION',
      provider,
      requestMetadata: { manual: result.method === 'MANUAL', publicationId },
      responseMetadata: { method: result.method, status: result.status },
      status: 'SUCCEEDED',
    });
    return response;
  });
}
