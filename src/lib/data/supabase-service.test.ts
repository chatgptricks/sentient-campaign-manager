import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('../supabase/client', () => ({
  supabase: {
    rpc,
  },
}));

describe('supabaseCampaignService', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('creates a promotion with metadata without relying on method this binding', async () => {
    const { supabaseCampaignService } = await import('./supabase-service');
    const createPromotion = supabaseCampaignService.createPromotion;

    rpc.mockImplementation(async (name: string) => {
      if (name === 'create_promotion') {
        return {
          data: {
            id: '20000000-0000-4000-8000-000000000099',
            client_id: '10000000-0000-4000-8000-000000000099',
            client: { name: 'Test Client' },
            title: 'Test Promotion',
            description: null,
            status: 'DRAFT',
            sales_owner_id: '00000000-0000-4000-8000-000000000002',
            sales_owner: { display_name: 'Maya Chen' },
            creator_id: null,
            approver_id: null,
            publisher_id: null,
            due_date: null,
            version: 1,
            created_at: '2026-07-18T12:00:00.000Z',
            updated_at: '2026-07-18T12:00:00.000Z',
            cancellation_reason: null,
            allowed_actions: [],
          },
          error: null,
        };
      }
      if (name === 'upsert_campaign_metadata') {
        return {
          data: {
            promotion_id: '20000000-0000-4000-8000-000000000099',
            campaign_type: 'Social promotion',
            scheduled_date: '2026-08-01',
            priority: 'NORMAL',
            brief_url: null,
            client_material_links: [],
            external_resource_links: [],
            platforms: ['INSTAGRAM'],
            publishing_account_ids: [],
            external_partner_account_ids: [],
            internal_notes: null,
          },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC ${name}`);
    });

    await expect(
      createPromotion({
        clientId: '10000000-0000-4000-8000-000000000099',
        title: 'Test Promotion',
        description: '',
        dueDate: '',
        metadata: {
          campaignType: 'Social promotion',
          scheduledDate: '2026-08-01',
          priority: 'NORMAL',
          briefUrl: '',
          clientMaterialLinks: '',
          externalResourceLinks: '',
          platforms: ['INSTAGRAM'],
          publishingAccountIds: [],
          externalPartnerAccountIds: [],
          internalNotes: '',
        },
      }),
    ).resolves.toMatchObject({ id: '20000000-0000-4000-8000-000000000099' });
    expect(rpc).toHaveBeenCalledWith('upsert_campaign_metadata', expect.any(Object));
  });
});
