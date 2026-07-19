import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ApprovalSubmission, ResourceLink } from '../../domain/models';
import { ResourceAccessControl } from './PromotionDetailPage';
import { getApprovedPublicationResources } from './presentation-helpers';

const baseResource: ResourceLink = {
  id: '60000000-0000-4000-8000-000000000001',
  promotionId: '20000000-0000-4000-8000-000000000001',
  provider: 'CANVA',
  resourceType: 'SOCIAL_CREATIVE',
  url: 'https://www.canva.com/design/example',
  storagePath: null,
  displayName: 'Promotion creative',
  validationStatus: 'VALID',
  validationMessage: null,
  attachedByName: 'Creator',
  attachedAt: '2026-07-18T12:00:00.000Z',
  archivedAt: null,
};

describe('resource access control', () => {
  it('renders an external resource as an HTTPS link', () => {
    render(
      <ResourceAccessControl resource={baseResource} opening={false} onOpenPrivate={vi.fn()} />,
    );

    expect(screen.getByRole('link', { name: /external link/i })).toHaveAttribute(
      'href',
      baseResource.url,
    );
  });

  it('never renders a private storage path as an external link', () => {
    const onOpenPrivate = vi.fn();
    const privateResource: ResourceLink = {
      ...baseResource,
      provider: 'SUPABASE_STORAGE',
      url: `${baseResource.promotionId}/${baseResource.id}/campaign.png`,
      storagePath: `${baseResource.promotionId}/${baseResource.id}/campaign.png`,
    };
    render(
      <ResourceAccessControl
        resource={privateResource}
        opening={false}
        onOpenPrivate={onOpenPrivate}
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /open private asset/i }));
    expect(onOpenPrivate).toHaveBeenCalledWith(privateResource.id, privateResource.storagePath);
  });
});

describe('publication resource eligibility', () => {
  const approvedSubmission: ApprovalSubmission = {
    id: '70000000-0000-4000-8000-000000000001',
    promotionId: baseResource.promotionId,
    submissionNumber: 1,
    resourceLinkId: baseResource.id,
    resourceName: baseResource.displayName,
    submittedBy: '00000000-0000-4000-8000-000000000003',
    submittedByName: 'Creator',
    submittedAt: '2026-07-18T12:00:00.000Z',
    state: 'APPROVED',
    decisionComments: null,
    decidedByName: 'Approver',
    decidedAt: '2026-07-18T13:00:00.000Z',
  };

  it('returns only approved, active resources', () => {
    const unapproved = { ...baseResource, id: '60000000-0000-4000-8000-000000000002' };
    const archived = {
      ...baseResource,
      id: '60000000-0000-4000-8000-000000000003',
      archivedAt: '2026-07-18T14:00:00.000Z',
    };
    const eligible = getApprovedPublicationResources({
      resources: [baseResource, unapproved, archived],
      submissions: [
        approvedSubmission,
        {
          ...approvedSubmission,
          id: '70000000-0000-4000-8000-000000000002',
          resourceLinkId: archived.id,
        },
      ],
    });

    expect(eligible).toEqual([baseResource]);
  });
});
