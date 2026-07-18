import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PromotionStatusBadge } from './PromotionStatusBadge';

describe('PromotionStatusBadge', () => {
  it('renders the human label for an operational status', () => {
    render(<PromotionStatusBadge status="SUBMITTED_FOR_APPROVAL" />);
    expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
  });
});
