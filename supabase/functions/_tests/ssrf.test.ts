import { describe, expect, it, vi } from 'vitest';
import { ManualCreativeResourceAdapter } from '../_shared/adapters/creative-resource.ts';
import { HttpError } from '../_shared/errors.ts';
import { isPublicIpAddress, safeHeadRequest, validateSafeExternalUrl } from '../_shared/ssrf.ts';

const publicDns = async () => ['93.184.216.34'];

describe('SSRF-safe resource validation', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '172.16.2.4',
    '192.168.1.2',
    '::1',
    '::ffff:7f00:1',
    '64:ff9b::7f00:1',
    'fc00::1',
    'fe80::1',
  ])('rejects non-public address %s', (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it('rejects a public hostname that resolves to a private address', async () => {
    await expect(
      validateSafeExternalUrl('https://example.com/resource', {
        resolveDns: async () => ['10.1.2.3'],
      }),
    ).rejects.toMatchObject<HttpError>({ code: 'RESOURCE_URL_UNSAFE' });
  });

  it('rejects provider lookalike hosts', async () => {
    await expect(
      validateSafeExternalUrl('https://canva.com.attacker.example/design', {
        provider: 'CANVA',
        resolveDns: publicDns,
      }),
    ).rejects.toMatchObject<HttpError>({ code: 'RESOURCE_PROVIDER_MISMATCH' });
  });

  it('validates custom URLs without fetching untrusted hosts', async () => {
    const fetcher = vi.fn();
    const adapter = new ManualCreativeResourceAdapter({ fetcher, resolveDns: publicDns });
    const result = await adapter.validate({
      displayName: 'Brief',
      provider: 'OTHER',
      resourceType: 'brief',
      url: 'https://example.com/brief',
    });
    expect(result).toMatchObject({ availability: 'NOT_CHECKED', status: 'VALID' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('accepts a local Storage URL only for the configured Supabase origin', async () => {
    vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321');
    try {
      const fetcher = vi.fn();
      const adapter = new ManualCreativeResourceAdapter({ fetcher });
      const promotionId = crypto.randomUUID();
      const resourceId = crypto.randomUUID();
      const result = await adapter.validate({
        displayName: 'Asset',
        promotionId,
        provider: 'SUPABASE_STORAGE',
        resourceId,
        resourceType: 'creative',
        url: `http://127.0.0.1:54321/storage/v1/object/sign/promotion-assets/${promotionId}/${resourceId}/file.png?token=x`,
      });
      expect(result).toMatchObject({ availability: 'NOT_CHECKED', status: 'VALID' });
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('accepts a scoped private Storage object path without making it public', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://project-ref.supabase.co');
    try {
      const fetcher = vi.fn();
      const adapter = new ManualCreativeResourceAdapter({ fetcher });
      const promotionId = crypto.randomUUID();
      const resourceId = crypto.randomUUID();
      const result = await adapter.validate({
        displayName: 'Asset',
        promotionId,
        provider: 'SUPABASE_STORAGE',
        resourceId,
        resourceType: 'creative',
        url: `${promotionId}/${resourceId}/campaign-master.pdf`,
      });
      expect(result).toMatchObject({ availability: 'NOT_CHECKED', status: 'VALID' });
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('rejects a private Storage path outside the linked resource scope', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://project-ref.supabase.co');
    try {
      const adapter = new ManualCreativeResourceAdapter();
      await expect(
        adapter.validate({
          displayName: 'Asset',
          promotionId: crypto.randomUUID(),
          provider: 'SUPABASE_STORAGE',
          resourceId: crypto.randomUUID(),
          resourceType: 'creative',
          url: `${crypto.randomUUID()}/${crypto.randomUUID()}/campaign-master.pdf`,
        }),
      ).rejects.toMatchObject<HttpError>({ code: 'RESOURCE_PROVIDER_MISMATCH' });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('performs a bounded HEAD check for an allowlisted provider', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 }));
    const adapter = new ManualCreativeResourceAdapter({ fetcher, resolveDns: publicDns });
    const result = await adapter.validate({
      displayName: 'Design',
      provider: 'CANVA',
      resourceType: 'creative',
      url: 'https://www.canva.com/design/abc',
    });
    expect(result).toMatchObject({ availability: 'AVAILABLE', status: 'VALID' });
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ method: 'HEAD', redirect: 'manual' }),
    );
  });

  it('does not follow provider redirects to an arbitrary host', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://attacker.example/resource' },
      }),
    );
    await expect(
      safeHeadRequest('https://www.canva.com/design/abc', {
        fetcher,
        provider: 'CANVA',
        resolveDns: publicDns,
      }),
    ).rejects.toMatchObject<HttpError>({ code: 'RESOURCE_PROVIDER_MISMATCH' });
  });
});
