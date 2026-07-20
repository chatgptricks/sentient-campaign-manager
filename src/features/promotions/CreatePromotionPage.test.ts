import { describe, expect, it } from 'vitest';

import type { PublishingAccount } from '../../domain/models';
import {
  getSelectablePublishingAccounts,
  prunePublishingAccountIds,
} from './channel-account-selection';

const accounts: PublishingAccount[] = [
  {
    id: 'instagram-account',
    platform: 'INSTAGRAM',
    accountName: 'Instagram account',
    handle: '@instagram',
    accountUrl: 'https://www.instagram.com/instagram/',
    ownershipType: 'SENTIENT_OWNED',
    partnerName: null,
    active: true,
    defaultPublisherName: null,
    notes: null,
  },
  {
    id: 'linkedin-account',
    platform: 'LINKEDIN',
    accountName: 'LinkedIn account',
    handle: 'company/linkedin',
    accountUrl: 'https://www.linkedin.com/company/linkedin/',
    ownershipType: 'SENTIENT_OWNED',
    partnerName: null,
    active: true,
    defaultPublisherName: null,
    notes: null,
  },
];

describe('promotion channel account selection', () => {
  it('only shows accounts for selected platforms', () => {
    expect(getSelectablePublishingAccounts(accounts, ['INSTAGRAM']).map((item) => item.id)).toEqual(
      ['instagram-account'],
    );
  });

  it('removes accounts when their platform is unchecked', () => {
    expect(
      prunePublishingAccountIds(['instagram-account', 'linkedin-account'], accounts, ['LINKEDIN']),
    ).toEqual(['linkedin-account']);
  });
});
