import { corsHeaders } from './cors.ts';
import { sanitizeText } from './logging.ts';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function assertMethod(request: Request, method = 'POST'): void {
  if (request.method !== method) {
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', `Use ${method}.`);
  }
}

export function assertUuid(value: unknown, fieldName: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new HttpError(400, 'INVALID_INPUT', `${fieldName} must be a UUID.`);
  }
}

export function databaseError(error: unknown, fallback = 'Database operation failed.'): HttpError {
  const candidate = error as { code?: string; details?: string; message?: string } | null;
  const conflictCodes = new Set(['23505', 'P0002', 'P0003']);
  if (candidate?.code && conflictCodes.has(candidate.code)) {
    return new HttpError(409, 'CONFLICT', fallback);
  }
  if (
    candidate?.code === 'P0001' &&
    candidate.message &&
    /^[A-Z][A-Z0-9_]{2,80}$/.test(candidate.message)
  ) {
    const domainCode = candidate.message;
    let domainMessage = fallback;
    let domainDetails: Record<string, unknown> | undefined;
    if (candidate.details) {
      try {
        const parsed = JSON.parse(candidate.details) as {
          correlationId?: unknown;
          details?: unknown;
          message?: unknown;
        };
        if (typeof parsed.message === 'string' && parsed.message.length <= 500) {
          domainMessage = parsed.message;
        }
        domainDetails = {
          ...(parsed.details && typeof parsed.details === 'object'
            ? (parsed.details as Record<string, unknown>)
            : {}),
          ...(typeof parsed.correlationId === 'string'
            ? { correlationId: parsed.correlationId }
            : {}),
        };
      } catch {
        // Trigger errors without structured detail still use the safe domain code.
      }
    }
    const status =
      domainCode === 'AUTHENTICATION_REQUIRED'
        ? 401
        : domainCode === 'FORBIDDEN'
          ? 403
          : domainCode.endsWith('_NOT_FOUND')
            ? 404
            : domainCode.includes('CONFLICT') ||
                domainCode.includes('LOCK_MISMATCH') ||
                domainCode.includes('INVALID_TRANSITION') ||
                domainCode.includes('NOT_RETRYABLE') ||
                domainCode.includes('ALREADY_')
              ? 409
              : 400;
    return new HttpError(status, domainCode, domainMessage, domainDetails);
  }
  return new HttpError(500, 'DATABASE_ERROR', fallback);
}

export function errorResponse(request: Request, error: unknown): Response {
  const normalized =
    error instanceof HttpError
      ? error
      : new HttpError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
  const body: Record<string, unknown> = {
    error: {
      code: normalized.code,
      message: sanitizeText(normalized.message),
    },
  };
  if (normalized.details && normalized.status < 500) {
    (body.error as Record<string, unknown>).details = normalized.details;
  }
  return new Response(JSON.stringify(body), {
    status: normalized.status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json' },
  });
}
