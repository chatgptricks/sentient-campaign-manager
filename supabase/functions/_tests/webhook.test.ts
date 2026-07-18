import { describe, expect, it } from 'vitest';
import { HttpError } from '../_shared/errors.ts';
import { signWebhookPayload, verifyWebhookSignature } from '../_shared/webhook.ts';

describe('provider webhook signatures', () => {
  it('accepts a current valid HMAC signature', async () => {
    const secret = 'unit-test-secret';
    const rawBody = JSON.stringify({ id: 'evt_1' });
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const signature = await signWebhookPayload(secret, timestamp, rawBody);
    await expect(
      verifyWebhookSignature({ now, rawBody, secret, signature, timestamp }),
    ).resolves.toBeUndefined();
  });

  it('rejects an invalid signature', async () => {
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    await expect(
      verifyWebhookSignature({
        now,
        rawBody: '{}',
        secret: 'secret',
        signature: `sha256=${'0'.repeat(64)}`,
        timestamp,
      }),
    ).rejects.toMatchObject<HttpError>({ code: 'WEBHOOK_SIGNATURE_INVALID' });
  });

  it('rejects replayed signatures outside the tolerance window', async () => {
    const timestamp = '1700000000';
    const signature = await signWebhookPayload('secret', timestamp, '{}');
    await expect(
      verifyWebhookSignature({
        now: 1_800_000_000_000,
        rawBody: '{}',
        secret: 'secret',
        signature,
        timestamp,
      }),
    ).rejects.toMatchObject<HttpError>({ code: 'WEBHOOK_TIMESTAMP_INVALID' });
  });
});
