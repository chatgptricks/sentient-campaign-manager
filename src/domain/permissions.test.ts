import { describe, expect, it } from 'vitest';

import { hasAnyRole, hasRole, roleCodes } from './permissions';

describe('role hierarchy', () => {
  it('keeps roles ordered from highest to lowest privilege', () => {
    expect(roleCodes).toEqual([
      'ADMINISTRATOR',
      'FINANCE',
      'SALES',
      'APPROVER',
      'CREATOR',
      'PUBLISHER',
    ]);
  });

  it('lets admin and sales satisfy lower-role checks while legacy production roles alias to creator', () => {
    expect(hasRole(['ADMINISTRATOR'], 'FINANCE')).toBe(true);
    expect(hasRole(['FINANCE'], 'SALES')).toBe(true);
    expect(hasRole(['SALES'], 'APPROVER')).toBe(true);
    expect(hasRole(['APPROVER'], 'CREATOR')).toBe(true);
    expect(hasRole(['CREATOR'], 'PUBLISHER')).toBe(true);
  });

  it('does not let lower roles satisfy higher-role checks', () => {
    expect(hasRole(['FINANCE'], 'ADMINISTRATOR')).toBe(false);
    expect(hasRole(['SALES'], 'FINANCE')).toBe(false);
    expect(hasRole(['CREATOR'], 'SALES')).toBe(false);
  });

  it('uses hierarchy for multi-role checks', () => {
    expect(hasAnyRole(['SALES'], ['PUBLISHER'])).toBe(true);
    expect(hasAnyRole(['CREATOR'], ['APPROVER', 'PUBLISHER'])).toBe(true);
    expect(hasAnyRole(['CREATOR'], ['SALES'])).toBe(false);
  });
});
