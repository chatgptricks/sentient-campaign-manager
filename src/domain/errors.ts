export interface DomainErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlationId?: string;
}

export class DomainError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly correlationId?: string;

  constructor(payload: DomainErrorPayload) {
    super(payload.message);
    this.name = 'DomainError';
    this.code = payload.code;
    this.details = payload.details ?? {};
    this.correlationId = payload.correlationId;
  }
}

export function toDomainError(error: unknown) {
  if (error instanceof DomainError) return error;
  if (error instanceof Error) {
    const match = error.message.match(/\{.*\}/s);
    if (match) {
      try {
        const payload = JSON.parse(match[0]) as DomainErrorPayload;
        if (payload.code && payload.message) return new DomainError(payload);
      } catch {
        // Fall through to the safe generic error below.
      }
    }
    return new DomainError({ code: 'UNEXPECTED_ERROR', message: error.message });
  }
  return new DomainError({ code: 'UNEXPECTED_ERROR', message: 'Something went wrong.' });
}

export function getFriendlyError(error: unknown) {
  const domainError = toDomainError(error);
  const friendly: Record<string, string> = {
    PROMOTION_VERSION_CONFLICT: 'This promotion changed in another session. Refresh and try again.',
    PROMOTION_INVALID_TRANSITION: 'That action is no longer available for this promotion.',
    FORBIDDEN: 'You do not have permission to perform this action.',
    AUTH_REQUIRED: 'Your session expired. Sign in again to continue.',
    APPROVAL_SELF_REVIEW_FORBIDDEN: 'A creator cannot approve their own submission.',
  };
  return friendly[domainError.code] ?? domainError.message;
}
