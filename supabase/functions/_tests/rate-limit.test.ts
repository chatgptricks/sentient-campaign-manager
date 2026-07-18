import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '../_shared/database.ts';
import { edgeRateLimitKeyHash, enforceEdgeRateLimit } from '../_shared/rate-limit.ts';

const options = { limit: 2, scope: 'provider-webhook', windowSeconds: 60 };

describe('Edge rate limiting', () => {
  it('hashes the first forwarded client address without exposing it', async () => {
    const first = await edgeRateLimitKeyHash(
      new Request('https://example.com', {
        headers: { 'x-forwarded-for': '198.51.100.20, 10.0.0.1' },
      }),
      options.scope,
    );
    const sameClient = await edgeRateLimitKeyHash(
      new Request('https://example.com', {
        headers: { 'x-forwarded-for': '198.51.100.20, 192.0.2.4' },
      }),
      options.scope,
    );

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).toBe(sameClient);
    expect(first).not.toContain('198.51.100.20');
  });

  it('uses the service-only consume RPC and returns an allowed bucket', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        allowed: true,
        limit: 2,
        remaining: 1,
        requestCount: 1,
        resetAt: '2026-07-18T12:01:00.000Z',
        retryAfterSeconds: 60,
      },
      error: null,
    }));
    const client = { rpc } as unknown as DatabaseClient;

    await expect(
      enforceEdgeRateLimit(
        client,
        new Request('https://example.com', {
          headers: { 'cf-connecting-ip': '203.0.113.10' },
        }),
        options,
      ),
    ).resolves.toMatchObject({ allowed: true, remaining: 1 });
    expect(rpc).toHaveBeenCalledWith('consume_edge_rate_limit', {
      rate_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      rate_scope: 'provider-webhook',
      request_limit: 2,
      window_seconds: 60,
    });
  });

  it('rejects an exhausted bucket with a retry hint', async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: {
          allowed: false,
          limit: 2,
          remaining: 0,
          requestCount: 3,
          resetAt: '2026-07-18T12:01:00.000Z',
          retryAfterSeconds: 17.1,
        },
        error: null,
      })),
    } as unknown as DatabaseClient;

    await expect(
      enforceEdgeRateLimit(client, new Request('https://example.com'), options),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: { retryAfterSeconds: 18 },
      status: 429,
    });
  });

  it('fails closed when the consume RPC is unavailable or malformed', async () => {
    const databaseFailure = {
      rpc: vi.fn(async () => ({ data: null, error: { code: '08006' } })),
    } as unknown as DatabaseClient;
    const malformedResponse = {
      rpc: vi.fn(async () => ({ data: { allowed: true }, error: null })),
    } as unknown as DatabaseClient;

    await expect(
      enforceEdgeRateLimit(databaseFailure, new Request('https://example.com'), options),
    ).rejects.toMatchObject({ code: 'DATABASE_ERROR', status: 500 });
    await expect(
      enforceEdgeRateLimit(malformedResponse, new Request('https://example.com'), options),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT_RESPONSE_INVALID', status: 500 });
  });
});
