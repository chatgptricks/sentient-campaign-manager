import { describe, expect, it } from 'vitest';

import { canViewFinanceQueue } from './visibility';

describe('My Work finance queue visibility', () => {
  it('is visible to Finance and higher roles only', () => {
    expect(canViewFinanceQueue(['FINANCE'])).toBe(true);
    expect(canViewFinanceQueue(['ADMINISTRATOR'])).toBe(true);
    expect(canViewFinanceQueue(['CREATOR'])).toBe(false);
    expect(canViewFinanceQueue(['SALES', 'PUBLISHER'])).toBe(false);
  });
});
