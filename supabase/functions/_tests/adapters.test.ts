import { describe, expect, it, vi } from 'vitest';
import { ManualAccountingAdapter } from '../_shared/adapters/accounting.ts';
import {
  ManualNotificationAdapter,
  SlackNotificationAdapter,
} from '../_shared/adapters/notification.ts';
import { ManualPublishingAdapter } from '../_shared/adapters/publishing.ts';
import type { DatabaseClient } from '../_shared/database.ts';
import { testIntegrationConnection } from '../_shared/services/integration-test.ts';

const publicDns = async () => ['93.184.216.34'];

function integrationClient(): DatabaseClient {
  return {
    from: vi.fn((table: string) => {
      if (table === 'integration_connections') {
        return { update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
      }
      return { insert: vi.fn(async () => ({ error: null })) };
    }),
  } as unknown as DatabaseClient;
}

describe('truthful manual adapters', () => {
  it('marks external notification delivery as manual rather than sent', async () => {
    const result = await new ManualNotificationAdapter().send({
      body: 'Body',
      channel: 'EMAIL',
      idempotencyKey: 'notification:123',
      recipient: 'person@example.com',
      subject: 'Subject',
    });
    expect(result).toMatchObject({ delivered: false, mode: 'MANUAL', status: 'MANUAL_REQUIRED' });
  });

  it('treats an in-app notification as locally delivered', async () => {
    const result = await new ManualNotificationAdapter().send({
      body: 'Body',
      channel: 'IN_APP',
      idempotencyKey: 'notification:123',
      subject: 'Subject',
    });
    expect(result).toMatchObject({ delivered: true, mode: 'SYSTEM', status: 'SENT' });
  });

  it('passes a deterministic client message ID to configured Slack delivery', async () => {
    const requests: RequestInit[] = [];
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      return Response.json({ ok: true, ts: '123.456' });
    };
    const adapter = new SlackNotificationAdapter(fetcher, 'xoxb-test', 'C123');
    const message = {
      body: 'Body',
      channel: 'SLACK' as const,
      idempotencyKey: 'notification:stable-key',
      subject: 'Subject',
    };
    await adapter.send(message);
    await adapter.send(message);
    const ids = requests.map((request) => {
      const payload = JSON.parse(String(request.body)) as { client_msg_id: string };
      return payload.client_msg_id;
    });
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[0]).toBe(ids[1]);
  });

  it('does not claim automatic publication verification', async () => {
    const adapter = new ManualPublishingAdapter(publicDns);
    const result = await adapter.verify({
      destination: 'Instagram',
      provider: 'INSTAGRAM',
      url: 'https://www.instagram.com/p/example',
    });
    expect(result).toMatchObject({ method: 'AUTOMATED_CHECK', status: 'UNAVAILABLE' });
  });

  it('records an explicit manual verification truthfully', async () => {
    const adapter = new ManualPublishingAdapter(publicDns);
    const result = await adapter.verify({
      destination: 'Instagram',
      manualDetails: { checkedByHuman: true },
      manualStatus: 'VERIFIED',
      provider: 'INSTAGRAM',
      url: 'https://www.instagram.com/p/example',
    });
    expect(result).toMatchObject({ method: 'MANUAL', status: 'VERIFIED' });
  });

  it('preserves local invoice state and requires manual accounting', async () => {
    const result = await new ManualAccountingAdapter().createInvoice({
      amount: 1200,
      clientId: crypto.randomUUID(),
      currency: 'USD',
      invoiceId: crypto.randomUUID(),
      localStatus: 'DRAFT',
      promotionId: crypto.randomUUID(),
    });
    expect(result).toMatchObject({ mode: 'MANUAL', status: 'MANUAL_REQUIRED' });
    expect(result.message).toContain('DRAFT');
  });

  it('only reports Resend as connected when the sender domain is verified', async () => {
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('EMAIL_FROM', 'Sentient <notifications@example.com>');
    const fetcher = vi.fn(async () =>
      Response.json({ data: [{ name: 'example.com', status: 'verified' }] }),
    );
    try {
      await expect(
        testIntegrationConnection(
          integrationClient(),
          'RESEND',
          'integration-test:resend',
          fetcher,
        ),
      ).resolves.toMatchObject({ code: 'RESEND_SENDER_VERIFIED', status: 'CONNECTED' });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not claim Resend delivery readiness without EMAIL_FROM', async () => {
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    vi.stubEnv('EMAIL_FROM', '');
    const fetcher = vi.fn();
    try {
      await expect(
        testIntegrationConnection(
          integrationClient(),
          'RESEND',
          'integration-test:resend-missing-sender',
          fetcher,
        ),
      ).resolves.toMatchObject({ code: 'RESEND_SENDER_MISSING', status: 'NOT_CONFIGURED' });
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
