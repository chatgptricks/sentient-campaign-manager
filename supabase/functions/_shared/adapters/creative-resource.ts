import type {
  CreativeResourceAdapter,
  ResourceMetadata,
  ResourceReference,
  ResourceValidationResult,
} from './contracts.ts';
import { getEnv } from '../env.ts';
import { HttpError } from '../errors.ts';
import { safeHeadRequest, validateSafeExternalUrl, type DnsResolver } from '../ssrf.ts';

function validateStorageUrl(input: string, reference: ResourceReference): URL {
  const configuredUrl = getEnv('SUPABASE_URL');
  let expected: URL;
  try {
    expected = new URL(configuredUrl ?? '');
  } catch {
    throw new HttpError(500, 'STORAGE_CONFIGURATION_INVALID', 'Storage is not configured.');
  }

  const validateObjectSegments = (segments: string[]) => {
    const [promotionId, resourceId, filename, ...extra] = segments;
    const pathMatches =
      extra.length === 0 &&
      Boolean(filename) &&
      (!reference.promotionId || promotionId === reference.promotionId) &&
      (!reference.resourceId || resourceId === reference.resourceId) &&
      /^[a-z0-9][a-z0-9._-]*$/i.test(filename ?? '') &&
      filename !== '.' &&
      filename !== '..';
    if (!pathMatches) {
      throw new HttpError(
        400,
        'RESOURCE_PROVIDER_MISMATCH',
        'Storage path must use the promotion/resource UUID scope and a sanitized filename.',
      );
    }
  };

  if (!/^https?:\/\//i.test(input)) {
    let objectSegments: string[];
    try {
      objectSegments = input.split('/').map(decodeURIComponent);
    } catch {
      throw new HttpError(400, 'RESOURCE_URL_INVALID', 'Storage object path is invalid.');
    }
    validateObjectSegments(objectSegments);
    return new URL(
      `/storage/v1/object/promotion-assets/${objectSegments.map(encodeURIComponent).join('/')}`,
      expected,
    );
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, 'RESOURCE_URL_INVALID', 'Storage URL is invalid.');
  }
  let segments: string[];
  try {
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new HttpError(400, 'RESOURCE_URL_INVALID', 'Storage object path is invalid.');
  }
  const bucketIndex = segments.indexOf('promotion-assets');
  if (
    url.origin !== expected.origin ||
    url.username ||
    url.password ||
    !url.pathname.startsWith('/storage/v1/object/') ||
    bucketIndex < 0
  ) {
    throw new HttpError(
      400,
      'RESOURCE_PROVIDER_MISMATCH',
      'Storage URL must belong to the configured Supabase project.',
    );
  }
  validateObjectSegments(segments.slice(bucketIndex + 1));
  return url;
}

export class ManualCreativeResourceAdapter implements CreativeResourceAdapter {
  constructor(
    private readonly dependencies: {
      fetcher?: typeof fetch;
      resolveDns?: DnsResolver;
    } = {},
  ) {}

  async validate(reference: ResourceReference): Promise<ResourceValidationResult> {
    const url =
      reference.provider === 'SUPABASE_STORAGE'
        ? validateStorageUrl(reference.url, reference)
        : await validateSafeExternalUrl(reference.url, {
            provider: reference.provider,
            resolveDns: this.dependencies.resolveDns,
          });

    if (reference.provider === 'OTHER' || reference.provider === 'SUPABASE_STORAGE') {
      return {
        availability: 'NOT_CHECKED',
        message:
          reference.provider === 'OTHER'
            ? 'URL format and public DNS are valid. Availability was not fetched for an untrusted custom provider.'
            : 'Storage URL format is valid. Availability remains governed by private Storage access controls.',
        metadata: { host: url.hostname, networkRequestPerformed: false },
        status: 'VALID',
      };
    }

    try {
      const result = await safeHeadRequest(url.toString(), {
        fetcher: this.dependencies.fetcher,
        provider: reference.provider,
        resolveDns: this.dependencies.resolveDns,
      });
      if (!result.available) {
        return {
          availability: 'UNAVAILABLE',
          message: `Provider returned HTTP ${result.status}.`,
          metadata: { host: new URL(result.finalUrl).hostname, httpStatus: result.status },
          status: 'UNAVAILABLE',
        };
      }
      return {
        availability: 'AVAILABLE',
        message: 'URL format, provider host, DNS, and availability check passed.',
        metadata: { host: new URL(result.finalUrl).hostname, httpStatus: result.status },
        status: 'VALID',
      };
    } catch (error) {
      if (error instanceof HttpError) {
        return {
          availability: 'UNAVAILABLE',
          message: `Availability check stopped safely: ${error.message}`,
          metadata: { host: url.hostname },
          status: 'UNAVAILABLE',
        };
      }
      throw error;
    }
  }

  async getMetadata(reference: ResourceReference): Promise<ResourceMetadata> {
    const url =
      reference.provider === 'SUPABASE_STORAGE'
        ? validateStorageUrl(reference.url, reference)
        : await validateSafeExternalUrl(reference.url, {
            provider: reference.provider,
            resolveDns: this.dependencies.resolveDns,
          });
    return { host: url.hostname, provider: reference.provider };
  }
}
