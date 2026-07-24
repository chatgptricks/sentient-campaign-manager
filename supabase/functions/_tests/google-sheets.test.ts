import { describe, expect, it } from 'vitest';
import { parseSheetChannelRows } from '../_shared/services/google-sheets.ts';

describe('Google Sheets generic rows', () => {
  it('accepts arbitrary headers and keeps editable row values', () => {
    const parsed = parseSheetChannelRows([
      ['Creator', 'Link', 'Post status'],
      ['Ivan', 'https://example.com/post', 'Ready'],
    ]);

    expect(parsed.headers).toEqual(['Creator', 'Link', 'Post status']);
    expect(parsed.items[0]).toMatchObject({
      accountName: 'Ivan · https://example.com/post · Ready',
      active: true,
      crmItemId: 'row-2',
      displayName: 'Ivan · https://example.com/post · Ready',
      rowNumber: 2,
      rowValues: ['Ivan', 'https://example.com/post', 'Ready'],
    });
  });

  it('uses optional active and platform columns when present', () => {
    const parsed = parseSheetChannelRows([
      ['Platform', 'Handle', 'Active'],
      ['twitter', '@sentient', 'no'],
    ]);

    expect(parsed.items[0]).toMatchObject({
      active: false,
      handle: '@sentient',
      platform: 'X',
    });
  });
});
