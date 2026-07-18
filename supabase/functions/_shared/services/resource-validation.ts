import { ManualCreativeResourceAdapter } from '../adapters/creative-resource.ts';
import type { ResourceProvider } from '../ssrf.ts';
import type { DatabaseClient } from '../database.ts';
import { databaseError, HttpError } from '../errors.ts';
import { executeIdempotently, recordIntegrationAttempt } from '../idempotency.ts';

const supportedProviders = new Set<ResourceProvider>([
  'CANVA',
  'DROPBOX',
  'GOOGLE_DRIVE',
  'OTHER',
  'SUPABASE_STORAGE',
]);

export async function validateResourceRecord(
  client: DatabaseClient,
  resourceId: string,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const { data: resource, error } = await client
    .from('promotion_resource_links')
    .select(
      'id,promotion_id,provider,resource_type,external_id,url,display_name,metadata_json,archived_at',
    )
    .eq('id', resourceId)
    .maybeSingle();
  if (error) throw databaseError(error, 'Resource could not be loaded.');
  if (!resource) {
    throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'Resource was not found.');
  }

  const provider = String(resource.provider).toUpperCase() as ResourceProvider;
  if (!supportedProviders.has(provider)) {
    throw new HttpError(400, 'RESOURCE_PROVIDER_UNSUPPORTED', 'Resource provider is unsupported.');
  }

  return executeIdempotently(client, provider, 'VALIDATE_RESOURCE', idempotencyKey, async () => {
    if (resource.archived_at) {
      const response = {
        ignored: true,
        message: 'Archived resource validation was skipped.',
        resourceId: resource.id,
        status: 'ARCHIVED',
      };
      await recordIntegrationAttempt(client, {
        aggregateId: resource.promotion_id,
        idempotencyKey,
        operation: 'VALIDATE_RESOURCE',
        provider,
        requestMetadata: { resourceId: resource.id },
        responseMetadata: response,
        status: 'SUCCEEDED',
      });
      return response;
    }

    try {
      if (provider === 'SUPABASE_STORAGE') {
        const path = String(resource.url);
        const segments = path.split('/');
        const filename = segments.pop();
        const folder = segments.join('/');
        if (!filename || !folder) {
          throw new HttpError(400, 'STORAGE_PATH_INVALID', 'Private asset path is invalid.');
        }
        const { data: objects, error: storageError } = await client.storage
          .from('promotion-assets')
          .list(folder, { limit: 2, search: filename });
        if (storageError) {
          throw databaseError(storageError, 'Private asset object could not be checked.');
        }
        if (!objects?.some((object) => object.name === filename)) {
          throw new HttpError(
            503,
            'ASSET_OBJECT_PENDING',
            'Private asset upload is not available yet.',
          );
        }
      }

      const adapter = new ManualCreativeResourceAdapter();
      const result = await adapter.validate({
        displayName: resource.display_name,
        externalId: resource.external_id,
        promotionId: resource.promotion_id,
        provider,
        resourceId: resource.id,
        resourceType: resource.resource_type,
        url: resource.url,
      });
      const mergedMetadata = {
        ...((resource.metadata_json ?? {}) as Record<string, unknown>),
        validation: result.metadata,
      };
      const { error: updateError } = await client
        .from('promotion_resource_links')
        .update({
          metadata_json: mergedMetadata,
          validation_message: result.message,
          validation_status: result.status,
        })
        .eq('id', resource.id);
      if (updateError) throw databaseError(updateError, 'Resource validation could not be saved.');

      const response = {
        availability: result.availability,
        message: result.message,
        resourceId: resource.id,
        status: result.status,
      };
      await recordIntegrationAttempt(client, {
        aggregateId: resource.promotion_id,
        idempotencyKey,
        operation: 'VALIDATE_RESOURCE',
        provider,
        requestMetadata: { resourceId: resource.id },
        responseMetadata: response,
        status: 'SUCCEEDED',
      });
      return response;
    } catch (caught) {
      const invalid = caught instanceof HttpError && caught.status === 400;
      const message = caught instanceof Error ? caught.message : 'Resource validation failed.';
      await client
        .from('promotion_resource_links')
        .update({
          validation_message: message,
          validation_status: invalid ? 'INVALID' : 'UNAVAILABLE',
        })
        .eq('id', resource.id);
      await recordIntegrationAttempt(client, {
        aggregateId: resource.promotion_id,
        errorCode: caught instanceof HttpError ? caught.code : 'RESOURCE_VALIDATION_ERROR',
        idempotencyKey: `${idempotencyKey}:failure:${crypto.randomUUID()}`,
        operation: 'VALIDATE_RESOURCE',
        provider,
        requestMetadata: { resourceId: resource.id },
        responseMetadata: { status: invalid ? 'INVALID' : 'UNAVAILABLE' },
        status: 'FAILED',
      });
      throw caught;
    }
  });
}
