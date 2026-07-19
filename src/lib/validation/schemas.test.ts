import { describe, expect, it } from 'vitest';

import {
  approvalDecisionSchema,
  invoiceSchema,
  promotionSchema,
  publicationSchema,
  resourceLinkSchema,
} from './schemas';

const validUuid = '00000000-0000-4000-8000-000000000001';

describe('workflow form validation', () => {
  it('requires the core promotion fields', () => {
    expect(
      promotionSchema.safeParse({
        clientId: validUuid,
        title: 'Summer launch',
        description: '',
        dueDate: '2026-07-30',
      }).success,
    ).toBe(true);
    expect(
      promotionSchema.safeParse({
        clientId: '',
        title: '',
        description: '',
        dueDate: '',
      }).success,
    ).toBe(false);
  });

  it('requires revision comments but permits an approval without comments', () => {
    expect(
      approvalDecisionSchema.safeParse({ decision: 'REVISION_REQUESTED', comments: '' }).success,
    ).toBe(false);
    expect(approvalDecisionSchema.safeParse({ decision: 'APPROVED', comments: '' }).success).toBe(
      true,
    );
  });

  it('accepts HTTPS evidence and rejects unsafe schemes', () => {
    const resource = {
      provider: 'CANVA',
      resourceType: 'SOCIAL_CREATIVE',
      displayName: 'Master creative',
    } as const;
    expect(
      resourceLinkSchema.safeParse({ ...resource, url: 'https://canva.com/design/123' }).success,
    ).toBe(true);
    expect(
      resourceLinkSchema.safeParse({ ...resource, url: 'http://internal.local/asset' }).success,
    ).toBe(false);
  });

  it('rejects publication and invoice records that violate money or URL rules', () => {
    expect(
      publicationSchema.safeParse({
        provider: 'INSTAGRAM',
        destination: '@client',
        publicationUrl: 'javascript:alert(1)',
        externalPublicationId: '',
        artifactResourceLinkId: validUuid,
        publishedAt: '2026-07-18T12:00',
      }).success,
    ).toBe(false);
    expect(
      invoiceSchema.safeParse({
        amount: 0,
        currency: 'US',
        invoiceNumber: '',
        status: 'DRAFT',
      }).success,
    ).toBe(false);
  });
});
