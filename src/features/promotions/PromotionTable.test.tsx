import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Promotion } from '../../domain/models';
import { PromotionTable } from './PromotionTable';

const promotion: Promotion = {
  id: '20000000-0000-4000-8000-000000000001',
  clientId: '10000000-0000-4000-8000-000000000001',
  clientName: 'Arcadia Hotels',
  title: 'Summer rooftop launch',
  description: null,
  status: 'DRAFT',
  salesOwnerId: '00000000-0000-4000-8000-000000000002',
  salesOwnerName: 'Maya Chen',
  creatorId: null,
  creatorName: null,
  approverId: null,
  approverName: null,
  publisherId: null,
  publisherName: null,
  dueDate: '2026-08-01',
  version: 1,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
  cancellationReason: null,
  allowedActions: [],
};

describe('PromotionTable', () => {
  it('shows the promotion owner', () => {
    render(
      <MemoryRouter>
        <PromotionTable promotions={[promotion]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('columnheader', { name: /current owner/i })).toBeInTheDocument();
    expect(screen.getByText('Maya Chen')).toBeInTheDocument();
  });
});
