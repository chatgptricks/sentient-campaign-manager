import { notificationAdapterFor } from '../adapters/notification.ts';
import type { DatabaseClient } from '../database.ts';
import { databaseError, HttpError } from '../errors.ts';
import { executeIdempotently, recordIntegrationAttempt } from '../idempotency.ts';

type NotificationRecord = {
  body: string;
  channel: 'EMAIL' | 'IN_APP' | 'SLACK';
  id: string;
  promotion_id: string | null;
  status: string;
  subject: string;
  type: string;
  user_id: string;
};

async function preserveInAppNotification(
  client: DatabaseClient,
  notification: NotificationRecord,
): Promise<void> {
  if (notification.channel === 'IN_APP') return;
  const query = client
    .from('notifications')
    .select('id')
    .eq('user_id', notification.user_id)
    .eq('type', notification.type)
    .eq('channel', 'IN_APP')
    .eq('subject', notification.subject)
    .eq('body', notification.body);
  const scoped = notification.promotion_id
    ? query.eq('promotion_id', notification.promotion_id)
    : query.is('promotion_id', null);
  const { data: existing, error } = await scoped.limit(1).maybeSingle();
  if (error) throw databaseError(error, 'In-app notification could not be checked.');
  if (existing) return;
  const { error: insertError } = await client.from('notifications').insert({
    body: notification.body,
    channel: 'IN_APP',
    promotion_id: notification.promotion_id,
    sent_at: new Date().toISOString(),
    status: 'SENT',
    subject: notification.subject,
    type: notification.type,
    user_id: notification.user_id,
  });
  if (insertError) throw databaseError(insertError, 'In-app notification could not be preserved.');
}

export async function sendNotificationRecord(
  client: DatabaseClient,
  notificationId: string,
  idempotencyKey: string,
): Promise<Record<string, unknown>> {
  const { data: notification, error } = await client
    .from('notifications')
    .select('id,user_id,promotion_id,type,channel,subject,body,status')
    .eq('id', notificationId)
    .maybeSingle();
  if (error) throw databaseError(error, 'Notification could not be loaded.');
  if (!notification)
    throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found.');

  await preserveInAppNotification(client, notification);
  const adapter = notificationAdapterFor(notification.channel);
  return executeIdempotently(
    client,
    adapter.provider,
    'SEND_NOTIFICATION',
    idempotencyKey,
    async () => {
      let recipient: string | undefined;
      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('email, slack_user_id')
        .eq('id', notification.user_id)
        .maybeSingle();
      if (profileError)
        throw databaseError(profileError, 'Notification recipient could not be loaded.');

      if (notification.channel === 'EMAIL') {
        recipient = profile?.email;
      } else if (notification.channel === 'SLACK') {
        recipient = profile?.slack_user_id ?? undefined;
      }

      try {
        const result = await adapter.send({
          body: notification.body,
          channel: notification.channel,
          idempotencyKey,
          recipient,
          subject: notification.subject,
        });
        const now = new Date().toISOString();
        const { error: updateError } = await client
          .from('notifications')
          .update(
            result.delivered
              ? { failed_at: null, sent_at: now, status: 'SENT' }
              : { failed_at: now, status: 'FAILED' },
          )
          .eq('id', notification.id);
        if (updateError)
          throw databaseError(updateError, 'Notification status could not be saved.');

        const response = {
          delivered: result.delivered,
          message: result.message,
          mode: result.mode,
          notificationId: notification.id,
          status: result.status,
        };
        await recordIntegrationAttempt(client, {
          aggregateId: notification.promotion_id,
          idempotencyKey,
          operation: 'SEND_NOTIFICATION',
          provider: adapter.provider,
          requestMetadata: { channel: notification.channel, notificationId },
          responseMetadata: response,
          status: 'SUCCEEDED',
        });
        return response;
      } catch (caught) {
        await client
          .from('notifications')
          .update({ failed_at: new Date().toISOString(), status: 'FAILED' })
          .eq('id', notification.id);
        await recordIntegrationAttempt(client, {
          aggregateId: notification.promotion_id,
          errorCode: caught instanceof HttpError ? caught.code : 'NOTIFICATION_PROVIDER_ERROR',
          idempotencyKey: `${idempotencyKey}:failed:${crypto.randomUUID()}`,
          operation: 'SEND_NOTIFICATION',
          provider: adapter.provider,
          requestMetadata: { channel: notification.channel, notificationId },
          status: 'FAILED',
        });
        throw caught;
      }
    },
  );
}
