import { describe, expect, it, vi } from 'vitest';
import {
  authenticateUser,
  hasRole,
  type AuthContext,
  requireAnyRole,
  requireInternalOrRoles,
} from '../_shared/auth/index.ts';
import type { DatabaseClient } from '../_shared/database.ts';
import { databaseError, HttpError } from '../_shared/errors.ts';
import { executeIdempotently, requestIdempotencyKey } from '../_shared/idempotency.ts';
import { sanitizeForLog } from '../_shared/logging.ts';
import { calculateBackoffSeconds, processClaimedEvents } from '../_shared/outbox.ts';
import { normalizeEmail, normalizeRoleCodes } from '../_shared/services/admin-users.ts';

describe('shared edge-function controls', () => {
  it('redacts secrets and signed URL query values from logs', () => {
    const sanitized = sanitizeForLog({
      authorization: 'Bearer secret-value',
      nested: { apiKey: 'provider-key' },
      resourceUrl: 'https://example.com/file?token=sensitive&x=1',
    });
    expect(JSON.stringify(sanitized)).not.toContain('secret-value');
    expect(JSON.stringify(sanitized)).not.toContain('provider-key');
    expect(JSON.stringify(sanitized)).not.toContain('sensitive');
  });

  it('uses a valid request idempotency key', () => {
    const request = new Request('https://example.com', {
      headers: { 'Idempotency-Key': 'resource:abc:validate' },
    });
    expect(requestIdempotencyKey(request, 'resource:123:validate')).toBe(
      'resource:123:validate:client:resource:abc:validate',
    );
  });

  it('rejects unsafe idempotency keys', () => {
    const request = new Request('https://example.com', {
      headers: { 'Idempotency-Key': 'bad key with spaces' },
    });
    expect(() => requestIdempotencyKey(request, 'fallback-key')).toThrowError(HttpError);
  });

  it('returns the stored response without repeating an idempotent effect', async () => {
    const client = {
      rpc: vi.fn(async (name: string) => {
        expect(name).toBe('claim_integration_operation');
        return {
          data: { response: { externalId: 'provider-123' }, state: 'SUCCEEDED' },
          error: null,
        };
      }),
    } as unknown as DatabaseClient;
    const effect = vi.fn(async () => ({ externalId: 'provider-new' }));

    await expect(
      executeIdempotently(client, 'PROVIDER', 'SEND', 'idempotency:test:key', effect),
    ).resolves.toEqual({ duplicate: true, externalId: 'provider-123' });
    expect(effect).not.toHaveBeenCalled();
  });

  it('requires a user JWT before creating a database client', async () => {
    await expect(authenticateUser(new Request('https://example.com'))).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 401,
    });
  });

  it('accepts the scoped outbox secret only when the caller opts into it', async () => {
    vi.stubEnv('OUTBOX_PROCESSOR_SECRET', 'outbox-test-secret');
    const request = new Request('https://example.com', {
      headers: { 'x-internal-secret': 'outbox-test-secret' },
    });
    try {
      await expect(
        requireInternalOrRoles(request, ['ADMINISTRATOR'], { allowOutboxSecret: true }),
      ).resolves.toEqual({ internal: true });
      await expect(requireInternalOrRoles(request, ['ADMINISTRATOR'])).rejects.toMatchObject({
        code: 'AUTH_REQUIRED',
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('caps exponential outbox backoff', () => {
    expect(calculateBackoffSeconds(1)).toBe(10);
    expect(calculateBackoffSeconds(2)).toBe(20);
    expect(calculateBackoffSeconds(20)).toBe(900);
  });

  it('normalizes admin user email and role inputs', () => {
    expect(normalizeEmail(' Admin@Example.COM ')).toBe('admin@example.com');
    expect(normalizeRoleCodes(['sales', 'sales'])).toEqual(['SALES']);
  });

  it('rejects multiple hierarchical roles for one admin user', () => {
    expect(() => normalizeRoleCodes(['SALES', 'CREATOR'])).toThrowError(HttpError);
  });

  it('authorizes edge functions with hierarchical roles', () => {
    const context = { roles: new Set(['SALES']) } as AuthContext;
    expect(hasRole(context, 'CREATOR')).toBe(true);
    expect(() => requireAnyRole(context, ['CREATOR'])).not.toThrow();
  });

  it('rejects legacy admin role assignment inputs', () => {
    expect(() => normalizeRoleCodes(['APPROVER'])).toThrowError(HttpError);
    expect(() => normalizeRoleCodes(['PUBLISHER'])).toThrowError(HttpError);
    expect(() => normalizeRoleCodes(['FINANCE'])).toThrowError(HttpError);
  });

  it('rejects unknown admin roles', () => {
    expect(() => normalizeRoleCodes(['OWNER'])).toThrowError(HttpError);
  });

  it('maps structured SQL domain errors without exposing raw database text', () => {
    const mapped = databaseError({
      code: 'P0001',
      details: JSON.stringify({
        correlationId: crypto.randomUUID(),
        details: {},
        message: 'Administrator role is required.',
      }),
      message: 'FORBIDDEN',
    });
    expect(mapped).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Administrator role is required.',
      status: 403,
    });
  });

  it.each([
    ['FAILED', 1, 0],
    ['DEAD_LETTER', 0, 1],
  ] as const)(
    'reports an outbox %s transition from the lock-checked RPC',
    async (status, failed, deadLetter) => {
      const fluent = {
        eq: vi.fn(function () {
          return this;
        }),
        in: vi.fn(function () {
          return this;
        }),
        insert: vi.fn(async () => ({ error: null })),
        limit: vi.fn(function () {
          return this;
        }),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        order: vi.fn(function () {
          return this;
        }),
        select: vi.fn(function () {
          return this;
        }),
      };
      const client = {
        from: vi.fn(() => fluent),
        rpc: vi.fn(async (name: string) => {
          if (name === 'claim_integration_operation') {
            return { data: { state: 'CLAIMED' }, error: null };
          }
          if (name === 'fail_outbox_event') return { data: status, error: null };
          return { data: null, error: null };
        }),
      } as unknown as DatabaseClient;
      const summary = await processClaimedEvents(
        client,
        [
          {
            aggregate_id: crypto.randomUUID(),
            aggregate_type: 'Promotion',
            attempt_count: status === 'DEAD_LETTER' ? 5 : 1,
            event_type: 'ResourceAttached',
            id: crypto.randomUUID(),
            payload_json: {},
          },
        ],
        'worker-test',
      );
      expect(summary.failed).toBe(failed);
      expect(summary.deadLetter).toBe(deadLetter);
      expect(client.rpc).toHaveBeenCalledWith(
        'fail_outbox_event',
        expect.objectContaining({ worker_id: 'worker-test' }),
      );
    },
  );
});
