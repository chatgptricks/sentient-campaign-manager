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

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly botToken = getEnv('SLACK_BOT_TOKEN'),
    private readonly channelId = getEnv('SLACK_CHANNEL_ID'),
  ) {
    this.configured = Boolean(botToken && channelId);
  }

  async send(message: NotificationMessage): Promise<NotificationDeliveryResult> {
    if (!this.configured || !this.botToken || !this.channelId) {
      return new ManualNotificationAdapter().send(message);
    }
    const digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message.idempotencyKey)),
    );
    digest[6] = (digest[6]! & 0x0f) | 0x50;
    digest[8] = (digest[8]! & 0x3f) | 0x80;
    const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const clientMessageId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const response = await this.fetcher('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: this.channelId,
        client_msg_id: clientMessageId,
        text: `*${message.subject}*\n${message.body}`,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; ts?: string };
    if (!response.ok || !payload.ok) {
      throw new HttpError(502, 'SLACK_PROVIDER_ERROR', `Slack returned HTTP ${response.status}.`);
    }
    return {
      delivered: true,
      externalId: payload.ts,
      message: 'Slack accepted the notification.',
      mode: 'PROVIDER',
      status: 'SENT',
    };
  }
}

export function notificationAdapterFor(
  channel: NotificationMessage['channel'],
  fetcher: typeof fetch = fetch,
): NotificationAdapter {
  if (channel === 'EMAIL') return new ResendNotificationAdapter(fetcher);
  if (channel === 'SLACK') return new SlackNotificationAdapter(fetcher);
  return new ManualNotificationAdapter();
}
