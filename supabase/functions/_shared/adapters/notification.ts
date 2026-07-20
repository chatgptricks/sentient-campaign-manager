import { getEnv } from '../env.ts';
import { HttpError } from '../errors.ts';
import type {
  NotificationAdapter,
  NotificationDeliveryResult,
  NotificationMessage,
} from './contracts.ts';

export class ManualNotificationAdapter implements NotificationAdapter {
  readonly configured = true;
  readonly provider = 'MANUAL';

  async send(message: NotificationMessage): Promise<NotificationDeliveryResult> {
    if (message.channel === 'IN_APP') {
      return {
        delivered: true,
        message: 'The in-app notification is available in the local notification record.',
        mode: 'SYSTEM',
        status: 'SENT',
      };
    }
    return {
      delivered: false,
      message: `${message.channel} delivery is not configured. The message remains available in-app for manual follow-up.`,
      mode: 'MANUAL',
      status: 'MANUAL_REQUIRED',
    };
  }
}

export class ResendNotificationAdapter implements NotificationAdapter {
  readonly provider = 'RESEND';
  readonly configured: boolean;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly apiKey = getEnv('RESEND_API_KEY'),
    private readonly from = getEnv('EMAIL_FROM'),
  ) {
    this.configured = Boolean(apiKey && from);
  }

  async send(message: NotificationMessage): Promise<NotificationDeliveryResult> {
    if (!this.configured || !this.apiKey || !this.from || !message.recipient) {
      return new ManualNotificationAdapter().send(message);
    }
    const response = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.recipient],
        subject: message.subject,
        text: message.body,
      }),
    });
    if (!response.ok) {
      throw new HttpError(
        502,
        'EMAIL_PROVIDER_ERROR',
        `Email provider returned HTTP ${response.status}.`,
      );
    }
    const payload = (await response.json().catch(() => ({}))) as { id?: string };
    return {
      delivered: true,
      externalId: payload.id,
      message: 'Email accepted by the configured provider.',
      mode: 'PROVIDER',
      status: 'SENT',
    };
  }
}

export class SlackNotificationAdapter implements NotificationAdapter {
  readonly provider = 'SLACK';
  readonly configured: boolean;
  private readonly trackingChannelId: string;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly botToken = getEnv('SLACK_BOT_TOKEN'),
    channelId = getEnv('SLACK_CHANNEL_ID'),
  ) {
    this.trackingChannelId = channelId || 'C0BJ627G19R';
    this.configured = Boolean(botToken);
  }

  async send(message: NotificationMessage): Promise<NotificationDeliveryResult> {
    if (!this.configured || !this.botToken) {
      return new ManualNotificationAdapter().send(message);
    }

    const text = message.body;
    let ts: string | undefined;

    // 1. Send activity log line to global tracking channel C0BJ627G19R
    ts = await this.postSlackMessage(this.trackingChannelId, text, message.idempotencyKey);

    // 2. If recipient is a direct Slack User ID (starts with U) and different from tracking channel, send DM
    if (
      message.recipient &&
      message.recipient.startsWith('U') &&
      message.recipient !== this.trackingChannelId
    ) {
      const userDmTs = await this.postSlackMessage(message.recipient, text, message.idempotencyKey);
      ts = ts || userDmTs;
    }

    return {
      delivered: true,
      externalId: ts,
      message: 'Slack notification posted successfully.',
      mode: 'PROVIDER',
      status: 'SENT',
    };
  }

  private async postSlackMessage(
    channel: string,
    text: string,
    idempotencyKey: string,
  ): Promise<string | undefined> {
    const response = await this.fetcher('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel,
        client_msg_id: await stableSlackClientMessageId(idempotencyKey, channel),
        text,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      ts?: string;
      error?: string;
    };
    if (!response.ok || !payload.ok) {
      console.error(`Slack postMessage to ${channel} failed: ${payload.error ?? response.status}`);
      throw new HttpError(
        502,
        'SLACK_PROVIDER_ERROR',
        `Slack returned error '${payload.error ?? response.status}' for channel ${channel}.`,
      );
    }
    return payload.ts;
  }
}

async function stableSlackClientMessageId(idempotencyKey: string, channel: string) {
  const input = new TextEncoder().encode(`${idempotencyKey}:${channel}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  digest[6] = ((digest[6] ?? 0) & 0x0f) | 0x50;
  digest[8] = ((digest[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function notificationAdapterFor(
  channel: NotificationMessage['channel'],
  fetcher: typeof fetch = fetch,
): NotificationAdapter {
  if (channel === 'EMAIL') return new ResendNotificationAdapter(fetcher);
  if (channel === 'SLACK') return new SlackNotificationAdapter(fetcher);
  return new ManualNotificationAdapter();
}
