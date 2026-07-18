import { describe, expect, it } from 'vitest';

import { handleRequest as adminUsers } from '../admin-users/index.ts';
import { handleRequest as processOutbox } from '../process-outbox/index.ts';
import { handleRequest as providerWebhook } from '../provider-webhook/index.ts';
import { handleRequest as sendNotification } from '../send-notification/index.ts';
import { handleRequest as syncInvoice } from '../sync-invoice/index.ts';
import { handleRequest as testIntegration } from '../test-integration/index.ts';
import { handleRequest as validateResource } from '../validate-resource/index.ts';
import { handleRequest as verifyPublication } from '../verify-publication/index.ts';

describe('Edge Function entrypoints', () => {
  it('loads every endpoint through the same module graph used by the runtime', () => {
    expect([
      adminUsers,
      processOutbox,
      providerWebhook,
      sendNotification,
      syncInvoice,
      testIntegration,
      validateResource,
      verifyPublication,
    ]).toSatisfy((handlers: unknown[]) =>
      handlers.every((handler) => typeof handler === 'function'),
    );
  });
});
