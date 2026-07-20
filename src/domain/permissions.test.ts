import { describe, expect, it } from 'vitest';

import { hasAnyRole, hasRole, roleCodes } from './permissions';

describe('role hierarchy', () => {
  it('keeps roles ordered from highest to lowest privilege', () => {
    expect(roleCodes).toEqual(['ADMINISTRATOR', 'SALES', 'CREATOR']);
  });

  it('lets admin and sales satisfy lower-role checks', () => {
    expect(hasRole(['ADMINISTRATOR'], 'SALES')).toBe(true);
    expect(hasRole(['SALES'], 'CREATOR')).toBe(true);
    expect(hasRole(['CREATOR'], 'CREATOR')).toBe(true);
  });

  it('does not let lower roles satisfy higher-role checks', () => {
    expect(hasRole(['SALES'], 'ADMINISTRATOR')).toBe(false);
    expect(hasRole(['CREATOR'], 'SALES')).toBe(false);
  });

  it('uses hierarchy for multi-role checks', () => {
    expect(hasAnyRole(['SALES'], ['CREATOR'])).toBe(true);
    expect(hasAnyRole(['CREATOR'], ['CREATOR'])).toBe(true);
    expect(hasAnyRole(['CREATOR'], ['SALES'])).toBe(false);
  });
});
