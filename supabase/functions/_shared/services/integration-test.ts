import type { DatabaseClient } from '../database.ts';
import { getEnv } from '../env.ts';
import { databaseError, HttpError } from '../errors.ts';
import { recordIntegrationAttempt } from '../idempotency.ts';

export type IntegrationTestResult = {
  code: string;
  message: string;
  provider: string;
  status: 'CONNECTED' | 'MANUAL' | 'NOT_CONFIGURED' | 'UNAVAILABLE';
};

async function testResend(fetcher: typeof fetch): Promise<IntegrationTestResult> {
  const apiKey = getEnv('RESEND_API_KEY');
  const emailFrom = getEnv('EMAIL_FROM');
  if (!apiKey) {
    return {
      code: 'RESEND_KEY_MISSING',
      message: 'Resend is not configured.',
      provider: 'RESEND',
      status: 'NOT_CONFIGURED',
    };
  }
  const senderDomain = emailFrom?.match(/@([a-z0-9.-]+)(?:>|$)/i)?.[1]?.toLowerCase();
  if (!emailFrom || !senderDomain) {
    return {
      code: 'RESEND_SENDER_MISSING',
      message: 'Resend has an API key, but EMAIL_FROM is not configured with a valid sender.',
      provider: 'RESEND',
      status: 'NOT_CONFIGURED',
    };
  }
  const response = await fetcher('https://api.resend.com/domains', {
    method: 'GET',
    redirect: 'error',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    return {
      code: `RESEND_HTTP_${response.status}`,
      message: 'Resend rejected the non-destructive authentication check.',
      provider: 'RESEND',
      status: 'UNAVAILABLE',
    };
  }
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { name?: unknown; status?: unknown }[];
  };
  const senderReady = payload.data?.some(
    (domain) =>
      typeof domain.name === 'string' &&
      domain.name.toLowerCase() === senderDomain &&
      domain.status === 'verified',
  );
  return senderReady
    ? {
        code: 'RESEND_SENDER_VERIFIED',
        message: 'Resend authenticated and the configured sender domain is verified.',
        provider: 'RESEND',
        status: 'CONNECTED',
      }
    : {
        code: 'RESEND_SENDER_UNVERIFIED',
        message: 'Resend authenticated, but the configured sender domain is not verified.',
        provider: 'RESEND',
        status: 'NOT_CONFIGURED',
      };
}

async function testSlack(fetcher: typeof fetch): Promise<IntegrationTestResult> {
  const botToken = getEnv('SLACK_BOT_TOKEN');
  const channelId = getEnv('SLACK_CHANNEL_ID');
  const webhookUrl = getEnv('SLACK_WEBHOOK_URL');
  if (botToken && !channelId) {
    return {
      code: 'SLACK_CHANNEL_MISSING',
      message: 'Slack has a bot token but no delivery channel is configured.',
      provider: 'SLACK',
      status: 'NOT_CONFIGURED',
    };
  }
  if (botToken) {
    const response = await fetcher(
      `https://slack.com/api/conversations.info?channel=${encodeURIComponent(channelId ?? '')}`,
      {
        method: 'GET',
        redirect: 'error',
        headers: { Authorization: `Bearer ${botToken}` },
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      channel?: { id?: unknown };
      ok?: boolean;
    };
    return response.ok && payload.ok && payload.channel?.id === channelId
      ? {
          code: 'SLACK_CHANNEL_ACCESS_OK',
          message: 'Slack authenticated and the configured channel is accessible.',
          provider: 'SLACK',
          status: 'CONNECTED',
        }
      : {
          code: `SLACK_HTTP_${response.status}`,
          message: 'Slack rejected access to the configured delivery channel.',
          provider: 'SLACK',
          status: 'UNAVAILABLE',
        };
  }
  if (webhookUrl && /^https:\/\/hooks\.slack\.com\/services\//.test(webhookUrl)) {
    return {
      code: 'SLACK_WEBHOOK_CONFIGURED',
      message:
        'A Slack webhook is configured, but no message was sent during this non-destructive test.',
      provider: 'SLACK',
      status: 'MANUAL',
    };
  }
  return {
    code: 'SLACK_CREDENTIAL_MISSING',
    message: 'Slack is not configured.',
    provider: 'SLACK',
    status: 'NOT_CONFIGURED',
  };
}

export async function testIntegrationConnection(
  client: DatabaseClient,
  providerInput: string,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<IntegrationTestResult> {
  const provider = providerInput.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{2,50}$/.test(provider)) {
    throw new HttpError(400, 'PROVIDER_INVALID', 'Provider code is invalid.');
  }

  let result: IntegrationTestResult;
  try {
    if (provider === 'EMAIL' || provider === 'RESEND') result = await testResend(fetcher);
    else if (provider === 'SLACK') result = await testSlack(fetcher);
    else if (
      provider.startsWith('MANUAL_') ||
      provider === 'ACCOUNTING' ||
      provider === 'PUBLISHING'
    ) {
      result = {
        code: 'MANUAL_ADAPTER_READY',
        message: 'The manual adapter is ready and performs no destructive external action.',
        provider,
        status: 'MANUAL',
      };
    } else {
      result = {
        code: 'NON_DESTRUCTIVE_TEST_UNAVAILABLE',
        message:
          'No credential-backed, non-destructive test adapter is implemented for this provider.',
        provider,
        status: 'NOT_CONFIGURED',
      };
    }
  } catch (error) {
    result = {
      code: error instanceof HttpError ? error.code : 'PROVIDER_UNAVAILABLE',
      message: 'The configured provider could not complete its non-destructive test.',
      provider,
      status: 'UNAVAILABLE',
    };
  }

  const { error: updateError } = await client
    .from('integration_connections')
    .update({ last_tested_at: new Date().toISOString() })
    .eq('provider', provider);
  if (updateError) {
    throw databaseError(updateError, 'Integration test timestamp could not be saved.');
  }
  await recordIntegrationAttempt(client, {
    errorCode:
      result.status === 'UNAVAILABLE' || result.status === 'NOT_CONFIGURED' ? result.code : null,
    idempotencyKey,
    operation: 'TEST_INTEGRATION',
    provider,
    responseMetadata: result,
    status: result.status === 'UNAVAILABLE' ? 'FAILED' : 'SUCCEEDED',
  });
  return result;
}
