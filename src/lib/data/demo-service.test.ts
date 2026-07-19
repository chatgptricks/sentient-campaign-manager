import { describe, expect, it } from 'vitest';

import { demoCampaignService } from './demo-service';

describe('manual-adapter development workflow', () => {
  it('runs the full promotion lifecycle with immutable version increments', async () => {
    const client = await demoCampaignService.createClient({
      name: 'Lifecycle Test Client',
      billingEmail: 'billing@example.com',
      billingAddress: 'Test address',
    });
    const profiles = await demoCampaignService.listProfiles();
    const sales = profiles.find((profile) => profile.roles.includes('SALES'))!;
    const creator = profiles.find((profile) => profile.roles.includes('CREATOR'))!;
    const approver = profiles.find((profile) => profile.roles.includes('APPROVER'))!;
    const publisher = profiles.find((profile) => profile.roles.includes('PUBLISHER'))!;

    let promotion = await demoCampaignService.createPromotion({
      clientId: client.id,
      title: 'Lifecycle test promotion',
      description: 'Exercises every internal workflow command.',
      dueDate: '2026-08-01',
      salesOwnerId: sales.id,
    });

    await demoCampaignService.assignRole(promotion.id, 'CREATOR', creator.id, promotion.version);
    promotion = (await demoCampaignService.getPromotion(promotion.id)).promotion;
    await demoCampaignService.assignRole(promotion.id, 'APPROVER', approver.id, promotion.version);
    promotion = (await demoCampaignService.getPromotion(promotion.id)).promotion;
    await demoCampaignService.startCreativeWork(promotion.id, promotion.version);
    promotion = (await demoCampaignService.getPromotion(promotion.id)).promotion;

    await demoCampaignService.attachResource(promotion.id, {
      provider: 'CANVA',
      resourceType: 'SOCIAL_CREATIVE',
      displayName: 'Creative v1',
      url: 'https://www.canva.com/design/lifecycle-v1',
    });
    let detail = await demoCampaignService.getPromotion(promotion.id);
    await demoCampaignService.submitForApproval(
      promotion.id,
      detail.resources[0]!.id,
      detail.promotion.version,
    );
    detail = await demoCampaignService.getPromotion(promotion.id);
    await demoCampaignService.decideApproval(
      detail.submissions[0]!.id,
      { decision: 'REVISION_REQUESTED', comments: 'Increase product contrast.' },
      detail.promotion.version,
    );
    detail = await demoCampaignService.getPromotion(promotion.id);
    expect(detail.promotion.status).toBe('REVISION_REQUESTED');

    await demoCampaignService.startCreativeWork(promotion.id, detail.promotion.version);
    detail = await demoCampaignService.getPromotion(promotion.id);
    await demoCampaignService.attachResource(promotion.id, {
      provider: 'CANVA',
      resourceType: 'SOCIAL_CREATIVE',
      displayName: 'Creative v2',
      url: 'https://www.canva.com/design/lifecycle-v2',
    });
    detail = await demoCampaignService.getPromotion(promotion.id);
    await demoCampaignService.submitForApproval(
      promotion.id,
      detail.resources[0]!.id,
      detail.promotion.version,
    );
    detail = await demoCampaignService.getPromotion(promotion.id);
    await demoCampaignService.decideApproval(
      detail.submissions[0]!.id,
      { decision: 'APPROVED', comments: 'Ready to publish.' },
      detail.promotion.version,
    );
    detail = await demoCampaignService.getPromotion(promotion.id);
    expect(detail.promotion.status).toBe('APPROVED');

    await demoCampaignService.assignRole(
      promotion.id,
      'PUBLISHER',
      publisher.id,
      detail.promotion.version,
    );
    detail = await demoCampaignService.getPromotion(promotion.id);
    await demoCampaignService.startPublishing(promotion.id, detail.promotion.version);
    detail = await demoCampaignService.getPromotion(promotion.id);
    await demoCampaignService.recordPublication(
      promotion.id,
      {
        provider: 'INSTAGRAM',
        destination: '@lifecycle',
        publicationUrl: 'https://www.instagram.com/p/lifecycle',
        externalPublicationId: '',
        artifactResourceLinkId: detail.resources[0]!.id,
        publishedAt: '2026-07-18T12:00',
      },
      detail.promotion.version,
    );
    detail = await demoCampaignService.getPromotion(promotion.id);
    await demoCampaignService.requestVerification(
      detail.publications[0]!.id,
      detail.promotion.version,
    );
    detail = await demoCampaignService.getPromotion(promotion.id);
    await demoCampaignService.recordVerification(
      detail.publications[0]!.id,
      { status: 'VERIFIED', notes: 'Live URL and artifact verified.' },
      detail.promotion.version,
    );
    detail = await demoCampaignService.getPromotion(promotion.id);
    expect(detail.promotion.status).toBe('VERIFIED');
    await demoCampaignService.completeVerifiedWorkflow(promotion.id, detail.promotion.version);
    detail = await demoCampaignService.getPromotion(promotion.id);
    expect(detail.promotion.status).toBe('READY_FOR_INVOICING');

    await demoCampaignService.createInvoice(
      promotion.id,
      { amount: 2500, currency: 'USD', invoiceNumber: 'TEST-1001', status: 'ISSUED' },
      detail.promotion.version,
    );
    detail = await demoCampaignService.getPromotion(promotion.id);
    expect(detail.promotion.status).toBe('INVOICED');
    expect(detail.promotion.version).toBeGreaterThan(10);
  });

  it('rejects stale expected versions', async () => {
    const existing = (await demoCampaignService.listPromotions())[0]!;
    await expect(demoCampaignService.startCreativeWork(existing.id, 999)).rejects.toMatchObject({
      code: 'PROMOTION_VERSION_CONFLICT',
    });
  });

  it('stores campaign planning metadata with the parent campaign', async () => {
    const client = await demoCampaignService.createClient({
      name: 'Metadata Test Client',
      billingEmail: '',
      billingAddress: '',
    });
    const sales = (await demoCampaignService.listProfiles('SALES'))[0]!;
    const promotion = await demoCampaignService.createPromotion({
      clientId: client.id,
      title: 'Metadata test campaign',
      description: 'Structured planning metadata should survive the create flow.',
      dueDate: '2026-08-02',
      salesOwnerId: sales.id,
      metadata: {
        campaignType: 'Product launch',
        scheduledDate: '2026-08-03',
        priority: 'HIGH',
        briefUrl: 'https://docs.example.com/brief',
        clientMaterialLinks:
          'https://drive.example.com/materials\nhttps://docs.example.com/context',
        externalResourceLinks: '',
        platforms: ['INSTAGRAM', 'LINKEDIN'],
        publishingAccountIds: ['account-instagram-sentient'],
        externalPartnerAccountIds: [],
        internalNotes: 'Use the approved master creative.',
      },
    });
    const detail = await demoCampaignService.getPromotion(promotion.id);
    expect(detail.metadata).toMatchObject({
      campaignType: 'Product launch',
      priority: 'HIGH',
      platforms: ['INSTAGRAM', 'LINKEDIN'],
      clientMaterialLinks: [
        'https://drive.example.com/materials',
        'https://docs.example.com/context',
      ],
    });
  });

  it('simulates a private upload and opens it through an ephemeral URL', async () => {
    const promotion = (await demoCampaignService.listPromotions()).find((item) =>
      item.allowedActions.includes('ATTACH_RESOURCE'),
    )!;
    const progress: number[] = [];

    await demoCampaignService.attachPrivateAsset(
      promotion.id,
      new File(['private creative'], 'Launch Hero.PNG', { type: 'image/png' }),
      (value) => progress.push(value),
    );

    const detail = await demoCampaignService.getPromotion(promotion.id);
    const resource = detail.resources.find((item) => item.provider === 'SUPABASE_STORAGE');
    expect(resource?.storagePath).toMatch(
      new RegExp(`^${promotion.id}/[0-9a-f-]{36}/launch-hero\\.png$`),
    );
    expect(resource?.url).toBe(resource?.storagePath);
    await expect(demoCampaignService.getPrivateAssetUrl(resource!.storagePath!)).resolves.toMatch(
      /^(blob:|data:)/,
    );
    expect(progress).toEqual([10, 35, 100]);
  });

  it('updates and archives a client without deleting its record', async () => {
    const client = await demoCampaignService.createClient({
      name: 'Client Admin Test',
      billingEmail: '',
      billingAddress: '',
    });

    const updated = await demoCampaignService.updateClient(client.id, {
      name: 'Client Admin Test Updated',
      billingEmail: 'billing@client-admin.test',
      billingAddress: 'One Audit Way',
    });
    expect(updated).toMatchObject({
      name: 'Client Admin Test Updated',
      billingEmail: 'billing@client-admin.test',
    });

    await demoCampaignService.archiveClient(client.id);
    await expect(demoCampaignService.listClients()).resolves.not.toContainEqual(
      expect.objectContaining({ id: client.id }),
    );
  });

  it('reports a truthful non-destructive integration test result', async () => {
    await expect(demoCampaignService.testIntegration('ACCOUNTING')).resolves.toMatchObject({
      provider: 'ACCOUNTING',
      status: 'MANUAL',
    });
  });
});
