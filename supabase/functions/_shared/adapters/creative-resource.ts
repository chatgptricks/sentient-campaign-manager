import type {
  CreativeResourceAdapter,
  ResourceMetadata,
  ResourceReference,
  ResourceValidationResult,
} from './contracts.ts';
import { getEnv } from '../env.ts';
import { HttpError } from '../errors.ts';
import type { DnsResolver } from '../ssrf.ts';

/**
 * External creative links accept any http/https URL with no provider or domain check.
 * We never fetch them, so there is no SSRF surface; we only confirm the URL parses and
 * uses a safe scheme (javascript:/data: would be dangerous when rendered as a link).
 */
function validateExternalUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, 'RESOURCE_URL_INVALID', 'Resource URL is not a valid link.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(
      400,
      'RESOURCE_URL_INVALID',
      'Resource URL must start with http:// or https://.',
    );
  }
  return url;
}

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
  // fetcher/resolveDns are accepted for backward compatibility with existing callers and
  // tests, but external links are never fetched, so they are intentionally unused.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_dependencies: { fetcher?: typeof fetch; resolveDns?: DnsResolver } = {}) {}

  async validate(reference: ResourceReference): Promise<ResourceValidationResult> {
    const url =
      reference.provider === 'SUPABASE_STORAGE'
        ? validateStorageUrl(reference.url, reference)
        : validateExternalUrl(reference.url);

    // Every external link is accepted as-is and never fetched, regardless of provider.
    // Private Storage objects keep their own scoped access controls.
    return {
      availability: 'NOT_CHECKED',
      message:
        reference.provider === 'SUPABASE_STORAGE'
          ? 'Storage URL format is valid. Availability remains governed by private Storage access controls.'
          : 'Link accepted. Availability is not checked for external links.',
      metadata: { host: url.hostname, networkRequestPerformed: false },
      status: 'VALID',
    };
  }

  async getMetadata(reference: ResourceReference): Promise<ResourceMetadata> {
    const url =
      reference.provider === 'SUPABASE_STORAGE'
        ? validateStorageUrl(reference.url, reference)
        : validateExternalUrl(reference.url);
    return { host: url.hostname, provider: reference.provider };
  }
}
