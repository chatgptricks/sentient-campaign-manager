import type { DatabaseClient } from './database.ts';
import { databaseError, HttpError } from './errors.ts';

const encoder = new TextEncoder();

export type EdgeRateLimitOptions = {
  limit: number;
  scope: string;
  windowSeconds: number;
};

export type EdgeRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  requestCount: number;
  resetAt: string;
  retryAfterSeconds: number;
};

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function firstHeaderValue(value: string | null): string | undefined {
  const candidate = value?.split(',', 1)[0]?.trim();
  if (!candidate || candidate.length > 256 || /[\u0000-\u001f\u007f]/.test(candidate)) {
    return undefined;
  }
  return candidate;
}

function clientIdentifier(request: Request): string {
  const connectingIp = firstHeaderValue(request.headers.get('cf-connecting-ip'));
  if (connectingIp) return `cf:${connectingIp}`;

  const realIp = firstHeaderValue(request.headers.get('x-real-ip'));
  if (realIp) return `real:${realIp}`;

  const forwardedIp = firstHeaderValue(request.headers.get('x-forwarded-for'));
  if (forwardedIp) return `forwarded:${forwardedIp}`;

  const userAgent = firstHeaderValue(request.headers.get('user-agent')) ?? 'unknown';
  return `unknown:${userAgent}`;
}

export async function edgeRateLimitKeyHash(request: Request, scope: string): Promise<string> {
  const material = `${scope}\n${clientIdentifier(request)}`;
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(material));
  return bytesToHex(new Uint8Array(digest));
}

function isRateLimitResult(value: unknown): value is EdgeRateLimitResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.allowed === 'boolean' &&
    typeof result.limit === 'number' &&
    typeof result.remaining === 'number' &&
    typeof result.requestCount === 'number' &&
    typeof result.resetAt === 'string' &&
    typeof result.retryAfterSeconds === 'number'
  );
}

export async function enforceEdgeRateLimit(
  client: DatabaseClient,
  request: Request,
  options: EdgeRateLimitOptions,
): Promise<EdgeRateLimitResult> {
  const keyHash = await edgeRateLimitKeyHash(request, options.scope);
  const { data, error } = await client.rpc('consume_edge_rate_limit', {
    rate_key_hash: keyHash,
    rate_scope: options.scope,
    request_limit: options.limit,
    window_seconds: options.windowSeconds,
  });
  if (error) throw databaseError(error, 'Request rate limit could not be checked.');
  if (!isRateLimitResult(data)) {
    throw new HttpError(
      500,
      'RATE_LIMIT_RESPONSE_INVALID',
      'Request rate limit returned an invalid response.',
    );
  }
  if (!data.allowed) {
    throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again later.', {
      retryAfterSeconds: Math.max(1, Math.ceil(data.retryAfterSeconds)),
    });
  }
  return data;
}
