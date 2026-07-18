import { describe, expect, it } from 'vitest';

import { toLocalDateTimeInputValue } from './presentation-helpers';

describe('publication datetime input', () => {
  it('uses the user local wall-clock fields instead of converting to UTC', () => {
    const localDate = new Date(2026, 6, 18, 7, 5);
    expect(toLocalDateTimeInputValue(localDate)).toBe('2026-07-18T07:05');
  });
});
