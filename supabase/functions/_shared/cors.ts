import { getEnv } from './env.ts';

const allowedMethods = 'POST, OPTIONS';
const allowedHeaders =
  'authorization, apikey, content-type, idempotency-key, x-client-info, x-event-id, x-internal-secret, x-provider, x-webhook-signature, x-webhook-timestamp';

function configuredOrigins(): Set<string> {
  return new Set(
    (getEnv('ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  const allowlist = configuredOrigins();
  const allowOrigin =
    allowlist.size === 0 ? '*' : origin && allowlist.has(origin) ? origin : 'null';

  return {
    'Access-Control-Allow-Headers': allowedHeaders,
    'Access-Control-Allow-Methods': allowedMethods,
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function handleCors(request: Request): Response | undefined {
  if (request.method !== 'OPTIONS') return undefined;
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
