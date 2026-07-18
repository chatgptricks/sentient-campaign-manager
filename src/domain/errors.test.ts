import { describe, expect, it } from 'vitest';

import { DomainError, getFriendlyError, toDomainError } from './errors';

describe('domain error mapping', () => {
  it('maps stable conflict codes to actionable copy', () => {
    expect(
      getFriendlyError(
        new DomainError({
          code: 'PROMOTION_VERSION_CONFLICT',
          message: 'stale version',
          correlationId: 'correlation-1',
        }),
      ),
    ).toMatch(/changed in another session/i);
  });

  it('extracts a structured database payload without exposing implementation details', () => {
    const error = toDomainError(
      new Error(
        'database error: {"code":"FORBIDDEN","message":"Not allowed","correlationId":"abc"}',
      ),
    );
    expect(error.code).toBe('FORBIDDEN');
    expect(error.correlationId).toBe('abc');
  });
});
