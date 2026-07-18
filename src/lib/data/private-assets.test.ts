import { describe, expect, it } from 'vitest';

import {
  MAX_PRIVATE_ASSET_BYTES,
  createPrivateAssetDescriptor,
  sanitizePrivateAssetFilename,
  validatePrivateAssetFile,
} from './private-assets';

describe('private asset handling', () => {
  it('sanitizes a filename and creates the exact scoped storage path', () => {
    const descriptor = createPrivateAssetDescriptor(
      '20000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001',
      {
        name: 'Mí campaña FINAL (1).PDF',
        size: 2048,
        type: 'application/pdf',
      },
    );

    expect(descriptor.path).toBe(
      '20000000-0000-4000-8000-000000000001/60000000-0000-4000-8000-000000000001/mi-campana-final-1.pdf',
    );
    expect(descriptor.resourceType).toBe('PDF');
  });

  it('keeps storage filenames inside the bucket policy limit', () => {
    const filename = sanitizePrivateAssetFilename(`${'Long name '.repeat(30)}.png`, 'image/png');
    expect(filename.length).toBeLessThanOrEqual(180);
    expect(filename).toMatch(/\.png$/);
  });

  it('rejects unsupported and oversized files before any network request', () => {
    expect(() =>
      validatePrivateAssetFile({ name: 'unsafe.svg', size: 1024, type: 'image/svg+xml' }),
    ).toThrow('Choose a JPG, PNG, WebP, GIF, or PDF file.');
    expect(() =>
      validatePrivateAssetFile({
        name: 'large.png',
        size: MAX_PRIVATE_ASSET_BYTES + 1,
        type: 'image/png',
      }),
    ).toThrow('Private assets must be 25 MiB or smaller.');
  });
});
