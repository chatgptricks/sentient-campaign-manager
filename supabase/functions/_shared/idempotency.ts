import type { DatabaseClient } from './database.ts';
import { HttpError, databaseError } from './errors.ts';
import { sanitizeForLog } from './logging.ts';

export type IntegrationAttemptStatus = 'PENDING' | 'RETRYING' | 'SUCCEEDED' | 'FAILED';

export type IntegrationAttempt = {
  aggregateId?: string | null;
  errorCode?: string | null;
  idempotencyKey: string;
  operation: string;
  provider: string;
  requestMetadata?: Record<string, unknown>;
  responseMetadata?: Record<string, unknown>;
  status: IntegrationAttemptStatus;
};

export function requestIdempotencyKey(request: Request, fallback: string): string {
  const supplied = request.headers.get('idempotency-key')?.trim();
  const key = supplied ? `${fallback}:client:${supplied}` : fallback;
  if (key.length < 8 || key.length > 200 || !/^[a-z0-9._:/-]+$/i.test(key)) {
    throw new HttpError(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Idempotency-Key is too long or contains unsafe characters.',
    );
  }
  return key;
}

export async function executeIdempotently<T extends Record<string, unknown>>(
  client: DatabaseClient,
  provider: string,
  operation: string,
  idempotencyKey: string,
  effect: () => Promise<T>,
): Promise<T> {
  const lockToken = crypto.randomUUID();
  const { data, error } = await client.rpc('claim_integration_operation', {
    idempotency_key: idempotencyKey,
    lock_token: lockToken,
    operation,
    provider,
  });
  if (error) throw databaseError(error, 'Idempotency operation could not be claimed.');
  const claim = (data ?? {}) as { response?: T; state?: string };
  if (claim.state === 'SUCCEEDED') {
    return { ...(claim.response ?? ({} as T)), duplicate: true } as T;
  }
  if (claim.state !== 'CLAIMED') {
    throw new HttpError(
      409,
      'IDEMPOTENCY_IN_PROGRESS',
      'An operation with this idempotency key is already in progress.',
    );
  }

  try {
    const response = await effect();
    const { error: completeError } = await client.rpc('complete_integration_operation', {
      idempotency_key: idempotencyKey,
      lock_token: lockToken,
      response_metadata: sanitizeForLog(response),
    });
    if (completeError) {
      throw databaseError(completeError, 'Idempotency operation could not be completed.');
    }
    return response;
  } catch (caught) {
    await client.rpc('release_integration_operation', {
      error_code: caught instanceof Error ? caught.message : 'OPERATION_FAILED',
      idempotency_key: idempotencyKey,
      lock_token: lockToken,
    });
    throw caught;
  }
}

export async function recordIntegrationAttempt(
  client: DatabaseClient,
  attempt: IntegrationAttempt,
): Promise<void> {
  const { error } = await client.from('integration_attempts').insert({
    aggregate_id: attempt.aggregateId ?? null,
    error_code: attempt.errorCode ?? null,
    idempotency_key: attempt.idempotencyKey,
    operation: attempt.operation,
    provider: attempt.provider,
    request_metadata: sanitizeForLog(attempt.requestMetadata ?? {}),
    response_metadata: sanitizeForLog(attempt.responseMetadata ?? {}),
    status: attempt.status,
  });
  if (error && error.code !== '23505') {
    throw databaseError(error, 'Integration attempt could not be recorded.');
  }
}
