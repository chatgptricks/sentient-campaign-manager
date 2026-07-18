import { DomainError } from '../../domain/errors';

type ErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): ErrorRecord {
  return value && typeof value === 'object' ? (value as ErrorRecord) : {};
}

function text(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

async function readContextPayload(context: unknown): Promise<unknown> {
  const candidate = asRecord(context);
  const clone = candidate.clone;
  try {
    const receiver = typeof clone === 'function' ? clone.call(context) : context;
    const reader = asRecord(receiver).json;
    if (typeof reader !== 'function') return undefined;
    return await (reader as () => Promise<unknown>).call(receiver);
  } catch {
    return undefined;
  }
}

/** Converts Supabase FunctionsHttpError response bodies into stable domain errors. */
export async function assertFunctionSuccess(error: unknown): Promise<void> {
  if (!error) return;

  const fallback = asRecord(error);
  const payload = asRecord(await readContextPayload(fallback.context));
  const structured = asRecord(payload.error ?? payload);
  const code = text(structured.code) ?? text(fallback.code);
  const message = text(structured.message) ?? text(fallback.message) ?? 'Edge Function failed.';

  if (code || Object.keys(structured).length > 0) {
    throw new DomainError({
      code: code ?? 'FUNCTION_ERROR',
      message,
      details: asRecord(structured.details),
      correlationId: text(structured.correlationId) ?? text(structured.correlation_id),
    });
  }

  throw new DomainError({ code: 'FUNCTION_ERROR', message });
}
