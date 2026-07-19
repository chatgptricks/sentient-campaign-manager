import { describe, expect, it } from 'vitest';

import { isValidTransition, validPromotionTransitions } from './promotion-status';

describe('promotion state machine presentation mirror', () => {
  it('contains the required happy-path transitions', () => {
    expect(isValidTransition('DRAFT', 'CREATOR_ASSIGNED')).toBe(true);
    expect(isValidTransition('CREATIVE_IN_PROGRESS', 'SUBMITTED_FOR_APPROVAL')).toBe(true);
    expect(isValidTransition('SUBMITTED_FOR_APPROVAL', 'APPROVED')).toBe(true);
    expect(isValidTransition('VERIFICATION_PENDING', 'VERIFIED')).toBe(true);
    expect(isValidTransition('READY_FOR_INVOICING', 'INVOICED')).toBe(true);
  });

  it('rejects shortcuts and terminal-state changes', () => {
    expect(isValidTransition('DRAFT', 'APPROVED')).toBe(false);
    expect(isValidTransition('APPROVED', 'INVOICED')).toBe(false);
    expect(validPromotionTransitions.COMPLETED).toEqual([]);
    expect(validPromotionTransitions.CANCELLED).toEqual([]);
  });

  it('allows cancellation only from non-terminal states', () => {
    for (const [status, transitions] of Object.entries(validPromotionTransitions)) {
      if (['INVOICED', 'COMPLETED', 'CANCELLED'].includes(status)) {
        expect(transitions).not.toContain('CANCELLED');
      } else {
        expect(transitions).toContain('CANCELLED');
      }
    }
  });
});
