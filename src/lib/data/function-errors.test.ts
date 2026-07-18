import { describe, expect, it } from 'vitest';

import { DomainError } from '../../domain/errors';
import { assertFunctionSuccess } from './function-errors';

describe('assertFunctionSuccess', () => {
  it('reads a structured FunctionsHttpError response body', async () => {
    const context = new Response(
      JSON.stringify({
        error: {
          code: 'LAST_ADMINISTRATOR_REQUIRED',
          message: 'At least one active Administrator is required.',
          details: { profileId: 'profile-1' },
          correlationId: 'correlation-1',
        },
      }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    );

    const caught = await assertFunctionSuccess({
      context,
      message: 'Edge Function returned a non-2xx status code',
    }).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(DomainError);
    expect(caught).toMatchObject({
      code: 'LAST_ADMINISTRATOR_REQUIRED',
      correlationId: 'correlation-1',
      details: { profileId: 'profile-1' },
      message: 'At least one active Administrator is required.',
    });
  });

  it('falls back safely when no response body is available', async () => {
    await expect(assertFunctionSuccess({ message: 'Network unavailable' })).rejects.toMatchObject({
      code: 'FUNCTION_ERROR',
      message: 'Network unavailable',
    });
  });
});
