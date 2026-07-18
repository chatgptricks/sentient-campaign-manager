import { corsHeaders } from './cors.ts';
import { HttpError } from './errors.ts';

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

export async function readJson<T>(request: Request, maxBytes = 1_000_000): Promise<T> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json.');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}
