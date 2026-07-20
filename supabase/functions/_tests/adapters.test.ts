import { describe, expect, it, vi } from 'vitest';
import { ManualAccountingAdapter } from '../_shared/adapters/accounting.ts';
import {
  DEFAULT_SLACK_TRACKING_CHANNEL_ID,
  ManualNotificationAdapter,
  SlackNotificationAdapter,
} from '../_shared/adapters/notification.ts';
import { ManualPublishingAdapter } from '../_shared/adapters/publishing.ts';
import { buildSlackDirectMessage, describeOutboxEvent } from '../_shared/outbox.ts';
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
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('chat.postMessage');
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

  const titleLink = '<https://app.example/#/promotions/1|*Summer rooftop launch*>';

  it('records who assigned what to whom, without pinging anyone', () => {
    const line = describeOutboxEvent({
      actor: 'Sergio',
      assignee: 'Esteban',
      eventType: 'CreatorAssigned',
      titleLink,
    });

    expect(line).toBe(`Sergio assigned ${titleLink} to Esteban.`);
    expect(line).not.toContain('<@');
  });

  it('names the actor for workflow steps that have no assignee', () => {
    expect(
      describeOutboxEvent({
        actor: 'Esteban',
        assignee: 'someone',
        eventType: 'ApprovalSubmitted',
        titleLink,
      }),
    ).toBe(`Esteban marked ${titleLink} ready for approval.`);
  });

  it('renders the same event with mentions for a direct message', () => {
    expect(
      describeOutboxEvent({
        actor: '<@USERGIO>',
        assignee: '<@UESTEBAN>',
        eventType: 'CreatorAssigned',
        titleLink,
      }),
    ).toBe(`<@USERGIO> assigned ${titleLink} to <@UESTEBAN>.`);
  });

  it('addresses an assignment DM to the reader rather than naming them', () => {
    const dm = buildSlackDirectMessage({
      description: `<@USERGIO> assigned ${titleLink} to <@UESTEBAN>.`,
      eventType: 'CreatorAssigned',
      mention: '<@UESTEBAN>',
      recipientAssignment: `<@USERGIO> just assigned ${titleLink} to your tasks.`,
    });

    expect(dm).toBe(`Hey <@UESTEBAN>, <@USERGIO> just assigned ${titleLink} to your tasks.`);
  });

  it('greets the reader for non-assignment events', () => {
    const dm = buildSlackDirectMessage({
      description: `<@USERGIO> marked ${titleLink} ready for approval.`,
      eventType: 'ApprovalSubmitted',
      mention: '<@UESTEBAN>',
      recipientAssignment: 'unused',
    });

    expect(dm).toBe(`Hey <@UESTEBAN>, <@USERGIO> marked ${titleLink} ready for approval.`);
  });

  it('falls back to the default tracking channel when SLACK_CHANNEL_ID is unset', async () => {
    const channels: string[] = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('chat.postMessage');
      channels.push((JSON.parse(String(init?.body)) as { channel: string }).channel);
      return Response.json({ ok: true, ts: '123.456' });
    };
    const adapter = new SlackNotificationAdapter(fetcher, 'xoxb-test', undefined);

    expect(adapter.trackingChannelId).toBe(DEFAULT_SLACK_TRACKING_CHANNEL_ID);
    const result = await adapter.send({
      body: 'Body',
      channel: 'SLACK',
      idempotencyKey: 'notification:default-channel',
      subject: 'Subject',
    });

    expect(channels).toEqual([DEFAULT_SLACK_TRACKING_CHANNEL_ID]);
    expect(result).toMatchObject({ delivered: true, status: 'SENT' });
  });

  it('opens a Slack DM channel before sending directly to an assigned user', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body));
      requests.push({ url, body });
      if (url.includes('conversations.open')) {
        expect(body).toMatchObject({ users: 'U123' });
        return Response.json({ ok: true, channel: { id: 'D123' } });
      }
      return Response.json({ ok: true, ts: '123.456' });
    };
    const adapter = new SlackNotificationAdapter(fetcher, 'xoxb-test', 'C123');

    await adapter.send({
      body: 'Body',
      channel: 'SLACK',
      idempotencyKey: 'notification:assigned-user',
      recipient: 'U123',
      subject: 'Subject',
    });

    expect(requests.map((request) => request.url)).toEqual([
      'https://slack.com/api/chat.postMessage',
      'https://slack.com/api/conversations.open',
      'https://slack.com/api/chat.postMessage',
    ]);
    expect(requests[0]?.body).toMatchObject({ channel: 'C123' });
    expect(requests[2]?.body).toMatchObject({ channel: 'D123' });
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
