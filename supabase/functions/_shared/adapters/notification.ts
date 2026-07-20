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

/** Sentient's activity channel, used whenever SLACK_CHANNEL_ID is not set in the environment. */
export const DEFAULT_SLACK_TRACKING_CHANNEL_ID = 'C0BJ627G19R';

export class SlackNotificationAdapter implements NotificationAdapter {
  readonly provider = 'SLACK';
  readonly configured: boolean;
  readonly trackingChannelId: string;

  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly botToken = getEnv('SLACK_BOT_TOKEN'),
    channelId = getEnv('SLACK_CHANNEL_ID'),
  ) {
    this.trackingChannelId = channelId?.trim() || DEFAULT_SLACK_TRACKING_CHANNEL_ID;
    this.configured = Boolean(botToken);
  }

  /** Posts one activity line to the shared tracking channel. */
  async postToChannel(text: string, idempotencyKey: string): Promise<string | undefined> {
    if (!this.configured || !this.botToken) return undefined;
    return this.postSlackMessage(this.trackingChannelId, text, idempotencyKey);
  }

  /** Opens an IM channel with the user and delivers the message directly. */
  async sendDirectMessage(
    slackUserId: string,
    text: string,
    idempotencyKey: string,
  ): Promise<string | undefined> {
    if (!this.configured || !this.botToken) return undefined;
    if (!slackUserId.startsWith('U')) return undefined;
    const dmChannelId = await this.openDirectMessage(slackUserId);
    return this.postSlackMessage(dmChannelId, text, idempotencyKey);
  }

  async send(message: NotificationMessage): Promise<NotificationDeliveryResult> {
    if (!this.configured || !this.botToken) {
      return new ManualNotificationAdapter().send(message);
    }

    const text = message.body;
    const ts = await this.postToChannel(text, message.idempotencyKey);

    let dmTs: string | undefined;
    if (message.recipient && message.recipient !== this.trackingChannelId) {
      dmTs = await this.sendDirectMessage(message.recipient, text, message.idempotencyKey);
    }

    return {
      delivered: true,
      externalId: ts ?? dmTs,
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

  private async openDirectMessage(userId: string): Promise<string> {
    const response = await this.fetcher('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.botToken}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ users: userId }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      channel?: { id?: string };
      error?: string;
    };
    if (!response.ok || !payload.ok || !payload.channel?.id) {
      console.error(
        `Slack conversations.open for ${userId} failed: ${payload.error ?? response.status}`,
      );
      throw new HttpError(
        502,
        'SLACK_PROVIDER_ERROR',
        `Slack could not open DM for user ${userId}: ${payload.error ?? response.status}.`,
      );
    }
    return payload.channel.id;
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
